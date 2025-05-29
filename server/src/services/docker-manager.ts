import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import type { DockerContainer, DockerEvent } from "../types/docker.types.js";
import type * as DockerodeTypes from "dockerode";
import { DOCKER_IMAGE_NAME, DOCKER_NETWORK_NAME } from "../config/server-config.js";
import { log, logError } from "../utils/logger.js";
import { getSecurityOptions, containerNetworkExists } from "./security-service.js";

const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");

// Simplified __dirname calculation
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const docker = new Dockerode();

// Function to clean up stale containers on startup
export async function cleanupStaleContainers(): Promise<void> {
  log("Checking for stale containers managed by this server...");
  try {
    const containers = await docker.listContainers({
      all: true, // List all containers (running and stopped)
      filters: JSON.stringify({
        label: ["managed-by=ably-cli-terminal-server"],
      }),
    });

    if (containers.length === 0) {
      log("No stale containers found.");
      return;
    }

    log(`Found ${containers.length} stale container(s). Attempting removal...`);
    const removalPromises = containers.map(async (containerInfo: DockerodeTypes.ContainerInfo) => {
      // Skip containers that are still running so that live sessions can be
      // resumed after a server restart (e.g. during CI E2E tests).
      // We consider a container "stale" only if it is *not* running.
      if (containerInfo.State === 'running') {
        log(`Skipping running container ${containerInfo.Id}; may belong to an active session.`);
        return;
      }

      try {
        const container = docker.getContainer(containerInfo.Id);
        log(`Removing stale container ${containerInfo.Id} (state: ${containerInfo.State}) ...`);
        await container.remove({ force: true }); // Force remove
        log(`Removed stale container ${containerInfo.Id}.`);
      } catch (error: unknown) {
        // Ignore "no such container" errors, it might have been removed already
        if (
          !(
            error instanceof Error &&
            /no such container/i.test(error.message)
          )
        ) {
          logError(
            `Failed to remove stale container ${containerInfo.Id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    });

    await Promise.allSettled(removalPromises);
    log("Stale container cleanup finished.");
  } catch (error: unknown) {
    logError(
      `Error during stale container cleanup: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Continue starting the server even if cleanup fails
  }
}

export async function ensureDockerImage(): Promise<void> {
  log(`Ensuring Docker image ${DOCKER_IMAGE_NAME} exists...`);
  try {
    const forceRebuild = process.env.FORCE_REBUILD_SANDBOX_IMAGE === 'true';

    // First check if the image exists
    const images = await docker.listImages({
      filters: { reference: [DOCKER_IMAGE_NAME] },
    });

    if (forceRebuild && images.length > 0) {
      log(`FORCE_REBUILD_SANDBOX_IMAGE is set. Removing existing image ${DOCKER_IMAGE_NAME} to trigger rebuild.`);
      try {
        // Remove image by its ID (first match)
        const imageId = images[0].Id;
        await docker.getImage(imageId).remove({ force: true });
        log(`Removed existing image ${imageId}.`);
      } catch (error) {
        logError(`Failed to remove image for rebuild: ${error}`);
      }
    }

    // Re-query images after potential removal
    const imagesPostCheck = await docker.listImages({
      filters: { reference: [DOCKER_IMAGE_NAME] },
    });

    if (imagesPostCheck.length === 0) {
      log(`Image ${DOCKER_IMAGE_NAME} not found. Will attempt to build it.`);

      // Get the location of the Dockerfile - should be in server directory (one level up from server/src)
      const dockerfilePath = path.resolve(__dirname, "../../../", "server/Dockerfile");

      // Check if Dockerfile exists
      if (!fs.existsSync(dockerfilePath)) {
        throw new Error(`Dockerfile not found at ${dockerfilePath}`);
      }

      log(`Building Docker image ${DOCKER_IMAGE_NAME} from ${dockerfilePath}...`);

      // Try building via Docker CLI first (more reliable than SDK)
      try {
        log(`Building with docker command: docker build -f server/Dockerfile -t ${DOCKER_IMAGE_NAME} ${path.resolve(__dirname, "../../../")}`);
        const output = execSync(`docker build -f server/Dockerfile -t ${DOCKER_IMAGE_NAME} ${path.resolve(__dirname, "../../../")}`, {
          stdio: ['ignore', 'pipe', 'pipe']
        }).toString();
        log(`Docker build output: ${output.slice(0, 200)}...`);
        log(`Docker image ${DOCKER_IMAGE_NAME} built successfully using CLI.`);
        return;
      } catch (error) {
        log(`Failed to build using Docker CLI: ${error}. Falling back to Docker SDK.`);
      }

      // Fallback to Docker SDK if CLI approach fails
      try {
        log("Attempting to build image using Docker SDK...");
        const stream = await docker.buildImage(
          { context: path.resolve(__dirname, "../../../"), src: ["server/Dockerfile"] },
          { t: DOCKER_IMAGE_NAME, dockerfile: "server/Dockerfile" },
        );

        await new Promise((resolve, reject) => {
          docker.modem.followProgress(
            stream,
            (err: Error | null, res: unknown) => (err ? reject(err) : resolve(res)),
            (event: DockerEvent) => {
              if (event.stream) process.stdout.write(event.stream); // Log build output
              if (event.errorDetail) logError(event.errorDetail.message);
            },
          );
        });

        log(`Docker image ${DOCKER_IMAGE_NAME} built successfully using SDK.`);
      } catch (error) {
        logError(`Failed to build Docker image ${DOCKER_IMAGE_NAME}: ${error}`);
        throw new Error(
          `Failed to build Docker image "${DOCKER_IMAGE_NAME}". Please build it manually using "docker build -t ${DOCKER_IMAGE_NAME} ." in the project root.`,
        );
      }
    } else {
      log(`Docker image ${DOCKER_IMAGE_NAME} found.`);
    }
  } catch (error) {
    logError(`Error checking/building Docker image: ${error}`);
    if (
      error instanceof Error &&
      error.message.includes("Cannot connect to the Docker daemon")
    ) {
      throw new Error(
        "Failed to connect to Docker. Is the Docker daemon running and accessible?",
      );
    }

    throw error;
  }
}

export async function createContainer(
  apiKey: string,
  accessToken: string,
  environmentVariables: Record<string, string> = {},
  sessionId: string, // Pass sessionId for logging
): Promise<DockerContainer> {
  const containerName = `ably-cli-session-${sessionId}`; // Used for container naming
  log('Creating Docker container (TTY Mode)...');
  try {
    // Create base environment variables with better defaults for terminal behavior
    const env = [
      // These environment variables are critical for proper terminal behavior
      'TERM=dumb', // Disable ANSI escape sequences to fix spinner bug from Ora
      'COLORTERM=truecolor',
      'LANG=en_US.UTF-8',
      'LC_ALL=en_US.UTF-8',
      'LC_CTYPE=en_US.UTF-8',
      'CLICOLOR=1',
      // Only include credentials that have a non-empty value
      ...(apiKey ? [`ABLY_API_KEY=${apiKey}`] : []),
      ...(accessToken ? [`ABLY_ACCESS_TOKEN=${accessToken}`] : []),
      // Simple PS1 prompt at container level
      'PS1=$ ',
      // Enable history with reasonable defaults
      'HISTSIZE=1000',
      'HISTFILE=/home/appuser/.bash_history'
    ];

    // Add any custom environment variables
    for (const [key, value] of Object.entries(environmentVariables)) {
      // Don't duplicate variables that are already set
      if (!env.some(e => e.startsWith(`${key}=`))) {
        env.push(`${key}=${value}`);
      }
    }

    const securityOpt = getSecurityOptions();

    const container = await docker.createContainer({
      AttachStderr: true,
      AttachStdin: true,
      AttachStdout: true,
      Env: env,
      // Explicitly set the user to non-root for security
      // This works with user namespace remapping
      User: 'appuser',
      // Use the working directory of the non-root user
      WorkingDir: '/home/appuser',
      HostConfig: {
        // Set to false to prevent container from being removed before we can attach
        AutoRemove: false,
        // Security capabilities
        CapDrop: [
          'ALL',                 // Drop all capabilities first
          'NET_ADMIN',           // Cannot modify network settings
          'NET_BIND_SERVICE',    // Cannot bind to privileged ports
          'NET_RAW'              // Cannot use raw sockets
        ],
        SecurityOpt: securityOpt,
        // Add read-only filesystem
        ReadonlyRootfs: true,
        // Add tmpfs mounts for writable directories
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=64m',
          '/run': 'rw,noexec,nosuid,size=32m'
        },
        // Mount a volume for the Ably config directory
        Mounts: [
          {
            Type: 'tmpfs',
            Target: '/home/appuser/.ably',
            TmpfsOptions: {
              SizeBytes: 10 * 1024 * 1024, // 10MB
              Mode: 0o700 // Secure permissions
            }
          },
        ],
        // Add resource limits
        PidsLimit: 50, // Limit to 50 processes
        Memory: 256 * 1024 * 1024, // 256MB
        MemorySwap: 256 * 1024 * 1024, // Disable swap
        NanoCpus: 1 * 1000000000, // Limit to 1 CPU

        // Network security restrictions
        // Use default bridge network if the custom network doesn't exist
        NetworkMode: await containerNetworkExists() ? DOCKER_NETWORK_NAME : 'bridge',
      },
      Image: DOCKER_IMAGE_NAME,
      Labels: { // Add label for cleanup
        'managed-by': 'ably-cli-terminal-server'
      },
      OpenStdin: true,
      StdinOnce: false,
      StopSignal: 'SIGTERM',
      StopTimeout: 5,
      Tty: true,          // Enable TTY mode
      // Explicitly set the command to run the restricted shell script
      Cmd: ["/bin/bash", "/scripts/restricted-shell.sh"],
      name: containerName, // Use the generated container name
    });

    // Log security features in use
    log(`Container ${container.id} created with security hardening:`);
    log(`- Read-only filesystem: yes`);
    log(`- User namespace remapping compatibility: yes`);
    log(`- Seccomp filtering: yes`);
    log(`- AppArmor profile: ${securityOpt.some(opt => opt.includes('ably-cli-sandbox-profile')) ? 'yes' : 'no'}`);

    return container;
  } catch (error) {
    logError(`Error creating container: ${error}`);
    throw error;
  }
} 