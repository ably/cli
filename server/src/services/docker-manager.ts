import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import type { DockerContainer, DockerEvent, ContainerCreateOptions, Container } from "../types/docker.types.js";
import { DOCKER_IMAGE_NAME, CONTAINER_LIMITS, FORCE_REBUILD_SANDBOX_IMAGE, IS_CI, IS_DEVELOPMENT } from "../config/server-config.js";
import { log, logError, logSecure } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");

// Simplified __dirname calculation
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const docker = new Dockerode();

/**
 * Verify container resource limits are properly applied
 * NOTE: Currently unused - keeping for potential future use
 */
/*
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
    
    // Verify security options with CI-aware handling
    const securityOpt = hostConfig.SecurityOpt || [];
    const hasNoNewPrivileges = securityOpt.includes('no-new-privileges');
    const hasSeccomp = securityOpt.some((opt: string) => opt.startsWith('seccomp='));
    const hasAppArmor = securityOpt.some((opt: string) => opt.startsWith('apparmor=') && !opt.includes('unconfined'));
    
    // In production, require all security features. In CI, allow some to be missing.
    if (!hasNoNewPrivileges) {
      throw new Error("Security verification failed: no-new-privileges is required");
    }
    
    if (!IS_DEVELOPMENT && !IS_CI) {
      // Production environment: enforce all security features
      if (!hasSeccomp || !hasAppArmor) {
        throw new Error(`Production security verification failed: seccomp=${hasSeccomp}, apparmor=${hasAppArmor}`);
      }
    } else {
      // Development or CI environment: continue with warnings instead of failing
      logSecure(`Development or CI mode: Container created with seccomp profile: ${hasSeccomp ? 'custom' : 'Docker defaults'}`);
      logSecure(`Development or CI mode: Container created with AppArmor profile: ${hasAppArmor ? 'custom' : 'Docker defaults'}`);
    }
    
    logSecure("Container resource limits and security verified", {
      containerId: container.id.slice(0, 12),
      memoryMB: Math.round(hostConfig.Memory / 1024 / 1024),
      cpus: hostConfig.NanoCpus / 1000000000,
      pidsLimit: hostConfig.PidsLimit,
      securityOptions: securityOpt.length,
      environment: IS_DEVELOPMENT ? 'development' : IS_CI ? 'CI' : 'production',
      securityFeatures: {
        noNewPrivileges: hasNoNewPrivileges,
        seccomp: hasSeccomp,
        appArmor: hasAppArmor
      }
    });
    
  } catch (error) {
    logError(`Container limit verification failed: ${error}`);
    throw error;
  }
}
*/

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

// OLD CONSERVATIVE CLEANUP FUNCTION - REMOVED
// This function has been replaced by the aggressive cleanup function in session-manager.ts
// which properly handles Phase 3 logic for removing orphaned containers when the server
// is the only instance running.
//
// The old function below was too conservative and would skip ALL running containers,
// which prevented proper cleanup of orphaned containers from previous server instances.
//
// export async function cleanupStaleContainers(): Promise<void> {
//   // Old conservative logic that skipped running containers
// }

export async function ensureDockerImage(): Promise<void> {
  logSecure(`Ensuring Docker image ${DOCKER_IMAGE_NAME} exists...`, {
    environment: IS_DEVELOPMENT ? 'development' : IS_CI ? 'CI' : 'production'
  });
  
  try {
    // In development or CI, add timeout protection for all Docker operations
    const dockerTimeout = (IS_DEVELOPMENT || IS_CI) ? 30000 : 120000; // 30s in dev/CI, 2 minutes in prod
    
    const forceRebuild = FORCE_REBUILD_SANDBOX_IMAGE;

    // First check if the image exists (with timeout)
    const images = await Promise.race([
      docker.listImages({ filters: { reference: [DOCKER_IMAGE_NAME] } }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Docker listImages timeout')), dockerTimeout)
      )
    ]) as any[];

    if (forceRebuild && images.length > 0) {
      logSecure(`FORCE_REBUILD_SANDBOX_IMAGE is set. Removing existing image ${DOCKER_IMAGE_NAME} to trigger rebuild.`);
      try {
        // Remove image by its ID (first match) with timeout
        const imageId = images[0].Id;
        await Promise.race([
          docker.getImage(imageId).remove({ force: true }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Docker image removal timeout')), dockerTimeout)
          )
        ]);
        logSecure(`Removed existing image ${imageId}.`);
      } catch (error) {
        logError(`Failed to remove image for rebuild: ${error}`);
        if (IS_DEVELOPMENT || IS_CI) {
          logSecure("Development or CI mode: Continuing despite image removal failure");
        }
      }
    }

    // Re-query images after potential removal (with timeout)
    const imagesPostCheck = await Promise.race([
      docker.listImages({ filters: { reference: [DOCKER_IMAGE_NAME] } }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Docker listImages timeout (post-check)')), dockerTimeout)
      )
    ]) as any[];

    if (imagesPostCheck.length === 0) {
      logSecure(`Image ${DOCKER_IMAGE_NAME} not found. Will attempt to build it.`);

      // In development or CI, check if we should skip image building
      if (IS_DEVELOPMENT || IS_CI) {
        logSecure("Development or CI mode: Image building may be skipped due to Docker limitations");
        
        // Try to check Docker daemon availability first
        try {
          await Promise.race([
            docker.ping(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Docker ping timeout')), 5000)
            )
          ]);
          logSecure("Development or CI mode: Docker daemon is responsive, proceeding with image build");
        } catch (error) {
          logSecure(`Development or CI mode: Docker daemon not available (${error}) - skipping image build`);
          throw new Error(`Development or CI environment: Docker daemon not available for image building: ${error}`);
        }
      }

      // Get the location of the Dockerfile - should be in server directory (one level up from server/src)
      const dockerfilePath = path.resolve(__dirname, "../../../", "server/Dockerfile");

      // Check if Dockerfile exists
      if (!fs.existsSync(dockerfilePath)) {
        const error = `Dockerfile not found at ${dockerfilePath}`;
        if (IS_DEVELOPMENT || IS_CI) {
          logSecure(`Development or CI mode: ${error} - this may be expected in development or CI environments`);
          throw new Error(`Development or CI environment: ${error}`);
        } else {
          throw new Error(error);
        }
      }

      logSecure(`Building Docker image ${DOCKER_IMAGE_NAME} from ${dockerfilePath}...`);

      // Try building via Docker CLI first (more reliable than SDK) with timeout
      try {
        logSecure(`Building with docker command: docker build -f server/Dockerfile -t ${DOCKER_IMAGE_NAME} ${path.resolve(__dirname, "../../../")}`);
        
        const buildCommand = `docker build -f server/Dockerfile -t ${DOCKER_IMAGE_NAME} ${path.resolve(__dirname, "../../../")}`;
        
        if (IS_DEVELOPMENT || IS_CI) {
          // Use spawn with timeout in development or CI instead of execSync
          const { spawn } = await import('node:child_process');
          
          await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              child.kill();
              reject(new Error('Docker build timeout in development or CI'));
            }, dockerTimeout);
            
            const child = spawn('docker', ['build', '-f', 'server/Dockerfile', '-t', DOCKER_IMAGE_NAME, path.resolve(__dirname, "../../../")], {
              stdio: ['ignore', 'pipe', 'pipe']
            });
            
            let output = '';
            child.stdout?.on('data', (data) => {
              output += data.toString();
            });
            
            child.stderr?.on('data', (data) => {
              output += data.toString();
            });
            
            child.on('close', (code) => {
              clearTimeout(timeoutId);
              if (code === 0) {
                logSecure(`Docker image ${DOCKER_IMAGE_NAME} built successfully using CLI in development or CI.`);
                resolve(void 0);
              } else {
                reject(new Error(`Docker build failed with code ${code}: ${output.slice(-500)}`));
              }
            });
            
            child.on('error', (error) => {
              clearTimeout(timeoutId);
              reject(error);
            });
          });
        } else {
          // Use execSync in production (existing behavior)
          const output = execSync(buildCommand, {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: dockerTimeout
          }).toString();
          logSecure(`Docker build output: ${output.slice(0, 200)}...`);
          logSecure(`Docker image ${DOCKER_IMAGE_NAME} built successfully using CLI.`);
        }
        return;
      } catch (error) {
        logSecure(`Failed to build using Docker CLI: ${error}. ${(IS_DEVELOPMENT || IS_CI) ? 'Development or CI mode: Skipping SDK fallback' : 'Falling back to Docker SDK.'}`);
        if (IS_DEVELOPMENT || IS_CI) {
          throw new Error(`Development or CI environment: Docker build failed - ${error}`);
        }
      }

      // Fallback to Docker SDK only in production
      if (!IS_DEVELOPMENT && !IS_CI) {
        try {
          logSecure("Attempting to build image using Docker SDK...");
          const stream = await Promise.race([
            docker.buildImage(
              { context: path.resolve(__dirname, "../../../"), src: ["server/Dockerfile"] },
              { t: DOCKER_IMAGE_NAME, dockerfile: "server/Dockerfile" },
            ),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Docker SDK buildImage timeout')), dockerTimeout)
            )
          ]) as any;

          await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('Docker SDK followProgress timeout'));
            }, dockerTimeout);
            
            docker.modem.followProgress(
              stream,
              (err: Error | null, res: unknown) => {
                clearTimeout(timeoutId);
                if (err) reject(err);
                else resolve(res);
              },
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
      }
    } else {
      logSecure(`Docker image ${DOCKER_IMAGE_NAME} found.`);
    }
  } catch (error) {
    logError(`Error checking/building Docker image: ${error}`);
    
    if (error instanceof Error && error.message.includes("Cannot connect to the Docker daemon")) {
      if (IS_DEVELOPMENT || IS_CI) {
        logSecure("Development or CI mode: Docker daemon connection failed - this may be expected in development or CI environments");
        throw new Error(`Development or CI environment: Failed to connect to Docker daemon - ${error.message}`);
      } else {
        throw new Error("Failed to connect to Docker. Is the Docker daemon running and accessible?");
      }
    }

    // In development or CI, provide more context about the failure
    if (IS_DEVELOPMENT || IS_CI) {
      throw new Error(`Development or CI environment: Docker image operations failed - ${error instanceof Error ? error.message : String(error)}`);
    }

    throw error;
  }
}

/**
 * Enhanced container creation with better auto-removal and health monitoring
 * Part of Phase 2 improvements
 */
export async function createContainer(
  imageName: string,
  sessionId: string,
  env: Record<string, string> = {},
  opts: Partial<ContainerCreateOptions> = {}
): Promise<Container> {
  try {
    log(`Creating container for session ${sessionId} with image ${imageName}`);
    
    // Ensure environment variables are properly formatted
    const envArray = Object.entries(env).map(([key, value]) => `${key}=${value}`);
    
    // Enhanced container configuration with better cleanup and monitoring
    const containerConfig = {
      Image: imageName,
      name: opts.name || `ably-cli-session-${sessionId}`,
      Env: envArray,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Labels: {
        "ably-cli-terminal": "true",
        "ably-cli-session-id": sessionId,
        "ably-cli-created": new Date().toISOString(),
        // Add session type for better tracking
        "ably-cli-session-type": env.ABLY_ACCESS_TOKEN ? "authenticated" : "anonymous",
        // Add server instance identifier for cleanup coordination
        "ably-cli-server-pid": String(process.pid),
        "ably-cli-server-start": String(process.uptime()),
        ...opts.labels,
      },
      // Enhanced networking and resource constraints
      NetworkMode: opts.networkMode || "bridge",
      // Improved resource limits
      HostConfig: {
        // Enhanced auto-removal configuration
        AutoRemove: false, // We handle removal manually for better control
        // Resource constraints (important for security)
        Memory: opts.memory || 512 * 1024 * 1024, // 512MB default
        NanoCpus: opts.nanoCpus || 0.5 * 1000000000, // 0.5 CPU default
        // Security constraints
        ReadonlyRootfs: opts.readonlyRootfs || false,
        // Network constraints
        NetworkMode: opts.networkMode || "bridge",
        // Enhanced cleanup configuration
        RestartPolicy: {
          Name: "no" // Never restart automatically
        },
        // Improved security settings
        SecurityOpt: opts.securityOpt || [],
        CapDrop: opts.capDrop || ["ALL"],
        CapAdd: opts.capAdd || ["SETUID", "SETGID"], // Minimal required capabilities
        ...opts.hostConfig,
      },
      // Add health check configuration
      // REMOVED: Health check that was causing containers to fail
      // The health check expected /tmp/.ably-ready to exist but the scripts don't create it
      // This was causing exit code 127 errors and test failures
      //
      // Healthcheck: {
      //   Test: ["CMD-SHELL", "test -f /tmp/.ably-ready || exit 1"],
      //   Interval: 30000000000, // 30 seconds in nanoseconds
      //   Timeout: 10000000000,   // 10 seconds in nanoseconds
      //   Retries: 3,
      //   StartPeriod: 5000000000 // 5 seconds in nanoseconds
      // },
      ...opts.containerConfig,
    };

    logSecure("Creating container with enhanced configuration", {
      sessionId: sessionId.slice(0, 8),
      imageName,
      hasAutoRemove: false,
      memoryLimit: containerConfig.HostConfig.Memory,
      cpuLimit: containerConfig.HostConfig.NanoCpus,
    });

    const container = await docker.createContainer(containerConfig);
    
    log(`Container ${container.id.slice(0, 12)} created successfully for session ${sessionId}`);
    
    // Add container monitoring
    void monitorNewContainer(container, sessionId);
    
    return container;
    
  } catch (error) {
    logError(`Failed to create container for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Enhanced container monitoring for newly created containers
 * Monitors container health and handles automatic cleanup on failure
 */
async function monitorNewContainer(container: Container, sessionId: string): Promise<void> {
  try {
    // Wait a bit for container to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const inspect = await container.inspect();
    const isRunning = inspect.State.Running;
    const exitCode = inspect.State.ExitCode;
    
    if (isRunning) {
      log(`Container ${container.id.slice(0, 12)} for session ${sessionId} started successfully`);
    } else {
      // Container is not running - check exit code for the reason
      if (exitCode === 0) {
        log(`Container ${container.id.slice(0, 12)} for session ${sessionId} stopped during startup`);
      } else {
        logError(`Container ${container.id.slice(0, 12)} for session ${sessionId} failed to start (exit code: ${exitCode})`);
      }
      
      // Cleanup failed container
      try {
        await container.remove({ force: true, v: true });
        log(`Removed failed container ${container.id.slice(0, 12)} for session ${sessionId}`);
      } catch (removeError) {
        logError(`Failed to remove failed container ${container.id.slice(0, 12)}: ${removeError}`);
      }
    }
  } catch (error) {
    logError(`Error monitoring new container for session ${sessionId}: ${error}`);
  }
}

/**
 * Enhanced container removal with verification
 * Part of Phase 2 improvements for reliable cleanup
 */
export async function removeContainer(
  container: Container, 
  force = true, 
  removeVolumes = true
): Promise<void> {
  const containerId = container.id;
  
  try {
    log(`Attempting to remove container ${containerId.slice(0, 12)} (force=${force}, removeVolumes=${removeVolumes})`);
    
    // First, try to stop the container if it's running
    try {
      const inspect = await container.inspect();
      if (inspect.State.Running) {
        log(`Stopping running container ${containerId.slice(0, 12)}`);
        await container.stop({ t: 5 }); // 5 second timeout
      }
    } catch (error: any) {
      if (error.statusCode !== 404) {
        logError(`Error stopping container ${containerId.slice(0, 12)}: ${error}`);
      }
    }
    
    // Remove the container
    await container.remove({ force, v: removeVolumes });
    log(`Container ${containerId.slice(0, 12)} removed successfully`);
    
    // Verify removal
    await verifyContainerRemoval(containerId);
    
  } catch (error: any) {
    if (error.statusCode === 404 || error.message.includes('No such container')) {
      log(`Container ${containerId.slice(0, 12)} was already removed`);
    } else {
      logError(`Error removing container ${containerId.slice(0, 12)}: ${error}`);
      throw error;
    }
  }
}

/**
 * Verify that a container has been completely removed
 */
async function verifyContainerRemoval(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.inspect();
    // If we get here, container still exists
    logError(`Container ${containerId.slice(0, 12)} still exists after removal attempt`);
  } catch (error: any) {
    if (error.statusCode === 404 || error.message.includes('No such container')) {
      log(`Container ${containerId.slice(0, 12)} removal verified`);
    } else {
      logError(`Error verifying container removal for ${containerId.slice(0, 12)}: ${error}`);
    }
  }
}

/**
 * Get container status with enhanced error handling
 */
export async function getContainerStatus(containerId: string): Promise<{
  exists: boolean;
  running: boolean;
  exitCode?: number;
  error?: string;
}> {
  try {
    const container = docker.getContainer(containerId);
    const inspect = await container.inspect();
    
    return {
      exists: true,
      running: inspect.State.Running,
      exitCode: inspect.State.ExitCode,
    };
  } catch (error: any) {
    if (error.statusCode === 404 || error.message.includes('No such container')) {
      return {
        exists: false,
        running: false,
      };
    } else {
      return {
        exists: true, // Assume it exists but we can't check
        running: false,
        error: error.message,
      };
    }
  }
}

/**
 * Enhanced bulk container cleanup for server startup
 * Part of Phase 3 improvements
 */
export async function bulkRemoveContainers(
  containerIds: string[],
  maxConcurrent = 3
): Promise<{
  removed: string[];
  failed: Array<{ id: string; error: string }>;
}> {
  const removed: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  
  // Process containers in batches to prevent overwhelming Docker daemon
  for (let i = 0; i < containerIds.length; i += maxConcurrent) {
    const batch = containerIds.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (containerId) => {
      try {
        const container = docker.getContainer(containerId);
        await removeContainer(container, true, true);
        removed.push(containerId);
      } catch (error) {
        failed.push({
          id: containerId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
    
    await Promise.allSettled(batchPromises);
    
    // Small delay between batches
    if (i + maxConcurrent < containerIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  log(`Bulk container removal completed: ${removed.length} removed, ${failed.length} failed`);
  
  return { removed, failed };
} 