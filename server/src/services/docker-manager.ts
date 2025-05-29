import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import type { DockerContainer, DockerEvent } from "../types/docker.types.js";
import type * as DockerodeTypes from "dockerode";
import { DOCKER_IMAGE_NAME, DOCKER_NETWORK_NAME } from "../config/server-config.js";
import { logSecure, logError } from "../utils/logger.js";
import { getSecurityOptions, enforceSecureNetwork, getSecurityStatus } from "./security-service.js";

const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");

// Simplified __dirname calculation
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const docker = new Dockerode();

// Container resource limits (configurable via environment)
const CONTAINER_LIMITS = {
  memory: Number.parseInt(process.env.CONTAINER_MEMORY_LIMIT || '268435456'), // 256MB default
  memorySwap: Number.parseInt(process.env.CONTAINER_MEMORY_LIMIT || '268435456'), // Same as memory (no swap)
  nanoCpus: Number.parseInt(process.env.CONTAINER_CPU_LIMIT || '1000000000'), // 1 CPU default
  pidsLimit: Number.parseInt(process.env.CONTAINER_PIDS_LIMIT || '50'), // 50 processes default
  tmpfsSize: Number.parseInt(process.env.CONTAINER_TMPFS_SIZE || '67108864'), // 64MB default
  configDirSize: Number.parseInt(process.env.CONTAINER_CONFIG_SIZE || '10485760'), // 10MB default
};

/**
 * Verify container resource limits are properly applied
 */
async function verifyContainerLimits(container: DockerContainer): Promise<void> {
  try {
    const inspect = await container.inspect();
    const hostConfig = inspect.HostConfig;
    
    // Verify memory limits
    if (hostConfig.Memory !== CONTAINER_LIMITS.memory) {
      throw new Error(`Memory limit mismatch: expected ${CONTAINER_LIMITS.memory}, got ${hostConfig.Memory}`);
    }
    
    // Verify CPU limits
    if (hostConfig.NanoCpus !== CONTAINER_LIMITS.nanoCpus) {
      throw new Error(`CPU limit mismatch: expected ${CONTAINER_LIMITS.nanoCpus}, got ${hostConfig.NanoCpus}`);
    }
    
    // Verify PID limits
    if (hostConfig.PidsLimit !== CONTAINER_LIMITS.pidsLimit) {
      throw new Error(`PID limit mismatch: expected ${CONTAINER_LIMITS.pidsLimit}, got ${hostConfig.PidsLimit}`);
    }
    
    // Verify security options
    const securityOpt = hostConfig.SecurityOpt || [];
    const hasNoNewPrivileges = securityOpt.includes('no-new-privileges');
    const hasSeccomp = securityOpt.some((opt: string) => opt.startsWith('seccomp='));
    const hasAppArmor = securityOpt.some((opt: string) => opt.startsWith('apparmor=') && !opt.includes('unconfined'));
    
    if (!hasNoNewPrivileges || !hasSeccomp || !hasAppArmor) {
      throw new Error(`Security options verification failed: no-new-privileges=${hasNoNewPrivileges}, seccomp=${hasSeccomp}, apparmor=${hasAppArmor}`);
    }
    
    logSecure("Container resource limits and security verified", {
      containerId: container.id.slice(0, 12),
      memoryMB: Math.round(hostConfig.Memory / 1024 / 1024),
      cpus: hostConfig.NanoCpus / 1000000000,
      pidsLimit: hostConfig.PidsLimit,
      securityOptions: securityOpt.length
    });
    
  } catch (error) {
    logError(`Container limit verification failed: ${error}`);
    throw error;
  }
}

/**
 * Enable auto-removal for container after successful attachment
 */
export async function enableAutoRemoval(container: DockerContainer): Promise<void> {
  try {
    // Since Docker doesn't allow changing AutoRemove after creation,
    // we'll implement our own cleanup mechanism
    const cleanup = async () => {
      try {
        const inspect = await container.inspect();
        if (inspect.State.Running) {
          logSecure("Container still running, stopping for cleanup", {
            containerId: container.id.slice(0, 12)
          });
          await container.stop();
        }
        
        await container.remove();
        logSecure("Container auto-removed", {
          containerId: container.id.slice(0, 12)
        });
      } catch (error) {
        logError(`Auto-removal failed for container ${container.id}: ${error}`);
      }
    };
    
    // Set up cleanup on container exit
    const stream = await container.attach({
      stream: true,
      stdout: false,
      stderr: false,
      logs: false
    });
    
    stream.on('end', cleanup);
    stream.on('close', cleanup);
    
    logSecure("Auto-removal enabled for container", {
      containerId: container.id.slice(0, 12)
    });
    
  } catch (error) {
    logError(`Failed to enable auto-removal: ${error}`);
    // Don't throw - this is not critical for functionality
  }
}

// Function to clean up stale containers on startup
export async function cleanupStaleContainers(): Promise<void> {
  logSecure("Checking for stale containers managed by this server...");
  try {
    const containers = await docker.listContainers({
      all: true, // List all containers (running and stopped)
      filters: JSON.stringify({
        label: ["managed-by=ably-cli-terminal-server"],
      }),
    });

    if (containers.length === 0) {
      logSecure("No stale containers found.");
      return;
    }

    logSecure(`Found ${containers.length} stale container(s). Attempting removal...`);
    const removalPromises = containers.map(async (containerInfo: DockerodeTypes.ContainerInfo) => {
      // Skip containers that are still running so that live sessions can be
      // resumed after a server restart (e.g. during CI E2E tests).
      // We consider a container "stale" only if it is *not* running.
      if (containerInfo.State === 'running') {
        logSecure(`Skipping running container ${containerInfo.Id}; may belong to an active session.`);
        return;
      }

      try {
        const container = docker.getContainer(containerInfo.Id);
        logSecure(`Removing stale container ${containerInfo.Id} (state: ${containerInfo.State}) ...`);
        await container.remove({ force: true }); // Force remove
        logSecure(`Removed stale container ${containerInfo.Id}.`);
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
    logSecure("Stale container cleanup finished.");
  } catch (error: unknown) {
    logError(
      `Error during stale container cleanup: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Continue starting the server even if cleanup fails
  }
}

export async function ensureDockerImage(): Promise<void> {
  logSecure(`Ensuring Docker image ${DOCKER_IMAGE_NAME} exists...`);
  try {
    const forceRebuild = process.env.FORCE_REBUILD_SANDBOX_IMAGE === 'true';

    // First check if the image exists
    const images = await docker.listImages({
      filters: { reference: [DOCKER_IMAGE_NAME] },
    });

    if (forceRebuild && images.length > 0) {
      logSecure(`FORCE_REBUILD_SANDBOX_IMAGE is set. Removing existing image ${DOCKER_IMAGE_NAME} to trigger rebuild.`);
      try {
        // Remove image by its ID (first match)
        const imageId = images[0].Id;
        await docker.getImage(imageId).remove({ force: true });
        logSecure(`Removed existing image ${imageId}.`);
      } catch (error) {
        logError(`Failed to remove image for rebuild: ${error}`);
      }
    }

    // Re-query images after potential removal
    const imagesPostCheck = await docker.listImages({
      filters: { reference: [DOCKER_IMAGE_NAME] },
    });

    if (imagesPostCheck.length === 0) {
      logSecure(`Image ${DOCKER_IMAGE_NAME} not found. Will attempt to build it.`);

      // Get the location of the Dockerfile - should be in server directory (one level up from server/src)
      const dockerfilePath = path.resolve(__dirname, "../../../", "server/Dockerfile");

      // Check if Dockerfile exists
      if (!fs.existsSync(dockerfilePath)) {
        throw new Error(`Dockerfile not found at ${dockerfilePath}`);
      }

      logSecure(`Building Docker image ${DOCKER_IMAGE_NAME} from ${dockerfilePath}...`);

      // Try building via Docker CLI first (more reliable than SDK)
      try {
        logSecure(`Building with docker command: docker build -f server/Dockerfile -t ${DOCKER_IMAGE_NAME} ${path.resolve(__dirname, "../../../")}`);
        const output = execSync(`docker build -f server/Dockerfile -t ${DOCKER_IMAGE_NAME} ${path.resolve(__dirname, "../../../")}`, {
          stdio: ['ignore', 'pipe', 'pipe']
        }).toString();
        logSecure(`Docker build output: ${output.slice(0, 200)}...`);
        logSecure(`Docker image ${DOCKER_IMAGE_NAME} built successfully using CLI.`);
        return;
      } catch (error) {
        logSecure(`Failed to build using Docker CLI: ${error}. Falling back to Docker SDK.`);
      }

      // Fallback to Docker SDK if CLI approach fails
      try {
        logSecure("Attempting to build image using Docker SDK...");
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

        logSecure(`Docker image ${DOCKER_IMAGE_NAME} built successfully using SDK.`);
      } catch (error) {
        logError(`Failed to build Docker image ${DOCKER_IMAGE_NAME}: ${error}`);
        throw new Error(
          `Failed to build Docker image "${DOCKER_IMAGE_NAME}". Please build it manually using "docker build -t ${DOCKER_IMAGE_NAME} ." in the project root.`,
        );
      }
    } else {
      logSecure(`Docker image ${DOCKER_IMAGE_NAME} found.`);
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
  
  // Verify security is properly initialized
  const securityStatus = getSecurityStatus();
  if (!securityStatus.initialized || !securityStatus.seccompEnabled || !securityStatus.appArmorEnabled) {
    throw new Error("Security profiles not properly initialized - container creation blocked");
  }
  
  // Enforce secure network requirement
  await enforceSecureNetwork();
  
  logSecure('Creating Docker container with enhanced security', {
    sessionId,
    securityStatus
  });
  
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
        // Use false initially - we'll enable auto-removal after successful attachment
        AutoRemove: false,
        // Enhanced security capabilities
        CapDrop: [
          'ALL',                 // Drop all capabilities first
          'NET_ADMIN',           // Cannot modify network settings
          'NET_BIND_SERVICE',    // Cannot bind to privileged ports
          'NET_RAW',             // Cannot use raw sockets
          'SYS_ADMIN',           // Cannot perform system administration operations
          'SYS_PTRACE',          // Cannot trace arbitrary processes
          'SYS_MODULE',          // Cannot load/unload kernel modules
          'DAC_OVERRIDE',        // Cannot bypass file permissions
          'SETUID',              // Cannot change user IDs
          'SETGID'               // Cannot change group IDs
        ],
        SecurityOpt: securityOpt,
        // Add read-only filesystem
        ReadonlyRootfs: true,
        // Add tmpfs mounts for writable directories with size limits
        Tmpfs: {
          '/tmp': `rw,noexec,nosuid,size=${CONTAINER_LIMITS.tmpfsSize}`,
          '/run': `rw,noexec,nosuid,size=${Math.round(CONTAINER_LIMITS.tmpfsSize / 2)}`
        },
        // Mount a volume for the Ably config directory
        Mounts: [
          {
            Type: 'tmpfs',
            Target: '/home/appuser/.ably',
            TmpfsOptions: {
              SizeBytes: CONTAINER_LIMITS.configDirSize,
              Mode: 0o700 // Secure permissions
            }
          },
        ],
        // Enhanced resource limits
        PidsLimit: CONTAINER_LIMITS.pidsLimit,
        Memory: CONTAINER_LIMITS.memory,
        MemorySwap: CONTAINER_LIMITS.memorySwap, // Disable swap
        NanoCpus: CONTAINER_LIMITS.nanoCpus,
        // Additional resource constraints
        KernelMemory: Math.round(CONTAINER_LIMITS.memory * 0.1), // 10% of main memory
        OomKillDisable: false, // Allow OOM killer to prevent system issues
        
        // Network security restrictions - use only the secure network
        NetworkMode: DOCKER_NETWORK_NAME,
        
        // Additional security options
        Privileged: false,
        UsernsMode: '', // Use host user namespace mapping
        IpcMode: '', // Private IPC namespace
        PidMode: '', // Private PID namespace
      },
      Image: DOCKER_IMAGE_NAME,
      Labels: { 
        'managed-by': 'ably-cli-terminal-server',
        'session-id': sessionId,
        'security-level': 'enhanced'
      },
      OpenStdin: true,
      StdinOnce: false,
      StopSignal: 'SIGTERM',
      StopTimeout: 5,
      Tty: true,
      // Explicitly set the command to run the restricted shell script
      Cmd: ["/bin/bash", "/scripts/restricted-shell.sh"],
      name: containerName,
    });

    // Verify container was created with proper limits
    await verifyContainerLimits(container);

    // Log security features in use
    logSecure(`Container created with enhanced security hardening`, {
      containerId: container.id.slice(0, 12),
      sessionId,
      features: {
        readOnlyFilesystem: true,
        userNamespaceCompatible: true,
        seccompEnabled: true,
        appArmorEnabled: true,
        networkRestricted: true,
        resourceLimited: true,
        capabilitiesDropped: 10
      },
      limits: {
        memoryMB: Math.round(CONTAINER_LIMITS.memory / 1024 / 1024),
        cpus: CONTAINER_LIMITS.nanoCpus / 1000000000,
        pidsLimit: CONTAINER_LIMITS.pidsLimit,
        tmpfsSizeMB: Math.round(CONTAINER_LIMITS.tmpfsSize / 1024 / 1024)
      }
    });

    return container;
  } catch (error) {
    logError(`Error creating enhanced security container: ${error}`);
    throw error;
  }
} 