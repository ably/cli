import { WebSocket } from 'ws';
import * as crypto from "node:crypto";
import { createRequire } from "node:module";
import type { ClientSession } from "../types/session.types.js";
import type { ServerStatusMessage } from "../types/websocket.types.js";
import { 
  computeCredentialHash, 
  isCredentialHashEqual, 
  shouldRateLimitResumeAttempt,
  isClientContextCompatible 
} from "../utils/session-utils.js";
import { 
  MAX_IDLE_TIME_MS, 
  MAX_SESSION_DURATION_MS, 
  RESUME_GRACE_MS,
  OUTPUT_BUFFER_MAX_LINES 
} from "../config/server-config.js";
import { log, logError, logSecure } from "../utils/logger.js";
import { unregisterSession } from "./session-tracking-service.js";
import type { ContainerInfo } from 'dockerode';
import Docker from 'dockerode';
import { getSessionMetrics, validateSessionTracking, clearAllSessionTracking, registerSession } from './session-tracking-service.js';
import type { SessionMetrics } from './session-tracking-service.js';

const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");

const docker = new Dockerode();

// Global sessions map
const sessions = new Map<string, ClientSession>();

// Track cleanup operations to prevent double cleanup
const cleanupInProgress = new Set<string>();

// --- Session Management Functions ---

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export async function terminateSession(
  sessionId: string,
  reason: string,
  _graceful = true,
  code = 1000,
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    log(`Session ${sessionId} not found for termination.`);
    // Still try to unregister in case it's tracked but not in sessions map
    unregisterSession(sessionId);
    return;
  }

  log(`[Server] terminateSession called for sessionId=${sessionId}, reason=${reason}`);
  
  // Clear any existing timers
  if (session.timeoutId) clearTimeout(session.timeoutId);
  if (session.orphanTimer) clearTimeout(session.orphanTimer);

  // Send disconnected status message
  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    try {
      const statusMsg: ServerStatusMessage = { type: "status", payload: "disconnected", reason };
      session.ws.send(JSON.stringify(statusMsg));
      log(`Sent 'disconnected' status to session ${sessionId}`);
      
      // Send close with code after a brief delay to allow the status message to be sent
      setTimeout(() => {
        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.close(code, reason);
        }
      }, 100);
    } catch (error: unknown) {
      logError(`Error sending disconnected status to session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      // Still proceed with cleanup even if message sending fails
    }
  }

  // Always clean up regardless of graceful flag for now
  await cleanupSession(sessionId);
}

export async function cleanupAllSessions(): Promise<void> {
  log(`Cleaning up ${sessions.size} sessions...`);
  const sessionIds = [...sessions.keys()];
  
  // Process cleanup in batches to prevent overwhelming the system
  const batchSize = 5;
  for (let i = 0; i < sessionIds.length; i += batchSize) {
    const batch = sessionIds.slice(i, i + batchSize);
    const cleanupPromises = batch.map(async (sessionId) => {
      try {
        await terminateSession(sessionId, "Server shutdown", false);
      } catch (error: unknown) {
        logError(`Error terminating session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    
    await Promise.allSettled(cleanupPromises);
    
    // Small delay between batches to prevent system overload
    if (i + batchSize < sessionIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  log("All sessions cleaned up.");
}

export async function cleanupSession(sessionId: string): Promise<void> {
  // Prevent double cleanup
  if (cleanupInProgress.has(sessionId)) {
    log(`Cleanup already in progress for session ${sessionId}, skipping...`);
    return;
  }
  
  cleanupInProgress.add(sessionId);
  
  try {
    const session = sessions.get(sessionId);
    if (!session) {
      log(`Session ${sessionId} not found for cleanup`);
      // Still unregister from tracking in case it exists there
      unregisterSession(sessionId);
      return;
    }
    
    log(`[Server] cleanupSession called for sessionId=${sessionId}`);

    // Attempt to send disconnected status if ws is open and not already handled by terminateSession
    // This is more of a fallback. terminateSession is the primary place.
    if (session.ws && session.ws.readyState === WebSocket.OPEN && !session.ws.CLOSING && !session.ws.CLOSED) {
      try {
        const statusMsg: ServerStatusMessage = { type: "status", payload: "disconnected", reason: "Session cleanup initiated" };
        session.ws.send(JSON.stringify(statusMsg));
        log(`Sent 'disconnected' status during cleanup for session ${sessionId} (fallback)`);
      } catch { /* ignore */ }
    }

    // Clear all timers
    if (session.timeoutId) clearTimeout(session.timeoutId);
    if (session.orphanTimer) clearTimeout(session.orphanTimer);

    // Clean up streams first
    await cleanupSessionStreams(session);

    // Clean up container with enhanced error handling and verification
    await cleanupSessionContainer(session);

    // Unregister from session tracking (CRITICAL - this was missing!)
    unregisterSession(sessionId);

    // Remove from sessions map
    sessions.delete(sessionId);
    log(`Session ${sessionId} removed. Active sessions: ${sessions.size}`);
    
  } catch (error) {
    logError(`Error during session cleanup for ${sessionId}: ${error}`);
  } finally {
    cleanupInProgress.delete(sessionId);
  }
}

/**
 * Enhanced stream cleanup with proper error handling
 */
async function cleanupSessionStreams(session: ClientSession): Promise<void> {
  const sessionId = session.sessionId;
  
  try {
    // Clean up stdin stream
    if (session.stdinStream) {
      try {
        if (!session.stdinStream.destroyed) {
          // Remove listeners to prevent cleanup loops
          session.stdinStream.removeAllListeners();
          session.stdinStream.end();
          session.stdinStream.destroy();
        }
        log(`stdinStream for session ${sessionId} ended and destroyed.`);
      } catch (error) {
        logError(`Error cleaning up stdin stream for ${sessionId}: ${error}`);
      }
      session.stdinStream = undefined;
    }
    
    // Clean up stdout stream (if different from stdin)
    if (session.stdoutStream && session.stdoutStream !== session.stdinStream) {
      try {
        if (!session.stdoutStream.destroyed) {
          session.stdoutStream.removeAllListeners();
          session.stdoutStream.destroy();
        }
        log(`stdoutStream for session ${sessionId} destroyed.`);
      } catch (error) {
        logError(`Error cleaning up stdout stream for ${sessionId}: ${error}`);
      }
      session.stdoutStream = undefined;
    }
  } catch (error) {
    logError(`Error during stream cleanup for session ${sessionId}: ${error}`);
  }
}

/**
 * Enhanced container cleanup with verification and health monitoring
 */
async function cleanupSessionContainer(session: ClientSession): Promise<void> {
  const sessionId = session.sessionId;
  
  if (!session.container) {
    log(`No container to clean up for session ${sessionId}`);
    return;
  }

  const containerId = session.container.id;
  log(`Starting container cleanup for session ${sessionId}, container ${containerId.slice(0, 12)}`);
  
  try {
    // First, try to get container status
    let containerExists = true;
    let containerRunning = false;
    
    try {
      const inspect = await session.container.inspect();
      containerRunning = inspect.State.Running;
      log(`Container ${containerId.slice(0, 12)} status: running=${containerRunning}`);
    } catch (error) {
      const err = error as { statusCode?: number; message?: string };
      if (err.statusCode === 404 || err.message?.includes('No such container')) {
        containerExists = false;
        log(`Container ${containerId.slice(0, 12)} no longer exists`);
      } else {
        logError(`Error inspecting container ${containerId.slice(0, 12)}: ${error}`);
      }
    }
    
    if (containerExists) {
      // Stop container if running
      if (containerRunning) {
        try {
          log(`Stopping container ${containerId.slice(0, 12)}...`);
          await session.container.stop({ t: 5 }); // 5 second timeout
          log(`Container ${containerId.slice(0, 12)} stopped`);
        } catch (error) {
          const err = error as { message?: string };
          // Container might have already stopped or exited
          if (!err.message?.includes('is not running') && !err.message?.includes('No such container')) {
            logError(`Error stopping container ${containerId.slice(0, 12)}: ${error}`);
          }
        }
      }
      
      // Force remove container
      try {
        log(`Removing container ${containerId.slice(0, 12)}...`);
        await session.container.remove({ force: true, v: true }); // force=true, remove volumes=true
        log(`Container ${containerId.slice(0, 12)} removed successfully`);
      } catch (error) {
        const err = error as { statusCode?: number; message?: string };
        if (err.statusCode === 404 || err.message?.includes('No such container')) {
          log(`Container ${containerId.slice(0, 12)} was already removed`);
        } else {
          logError(`Error removing container ${containerId.slice(0, 12)}: ${error}`);
          
          // Additional cleanup attempt with direct Docker API
          try {
            await docker.getContainer(containerId).remove({ force: true, v: true });
            log(`Container ${containerId.slice(0, 12)} removed on retry`);
          } catch (retryError) {
            logError(`Final cleanup attempt failed for container ${containerId.slice(0, 12)}: ${retryError}`);
          }
        }
      }
    }
    
    // Verify container is gone
    await verifyContainerCleanup(containerId);
    
  } catch (error) {
    logError(`Error during container cleanup for session ${sessionId}: ${error}`);
  } finally {
    session.container = undefined;
  }
}

/**
 * Verify container has been completely removed
 */
async function verifyContainerCleanup(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.inspect();
    // If we get here, container still exists
    logError(`Container ${containerId.slice(0, 12)} still exists after cleanup attempt`);
  } catch (error) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode === 404 || err.message?.includes('No such container')) {
      log(`Container ${containerId.slice(0, 12)} cleanup verified - container no longer exists`);
    } else {
      logError(`Error verifying container cleanup for ${containerId.slice(0, 12)}: ${error}`);
    }
  }
}

/**
 * Start a timer that will fully terminate the session after RESUME_GRACE_MS
 * unless the session is resumed. If a timer already exists it is cleared.
 */
export function scheduleOrphanCleanup(session: ClientSession): void {
  if (session.orphanTimer) clearTimeout(session.orphanTimer);
  session.orphanTimer = setTimeout(() => {
    log(`Orphan timer fired – cleaning session ${session.sessionId}`);
    terminateSession(session.sessionId, 'Session resume window expired');
  }, RESUME_GRACE_MS);
  log(`Scheduled orphan cleanup for session ${session.sessionId} in ${RESUME_GRACE_MS}ms`);
}

/**
 * Helper to replace the WebSocket on an existing session when a valid resume
 * request arrives. Closes the old socket, clears orphan timer, reassigns ws.
 */
export function takeoverSession(existing: ClientSession, newWs: WebSocket): void {
  if (existing.ws && existing.ws.readyState === WebSocket.OPEN) {
    existing.ws.terminate();
  }
  if (existing.orphanTimer) {
    clearTimeout(existing.orphanTimer);
    existing.orphanTimer = undefined;
  }
  existing.ws = newWs;
  existing.lastActivityTime = Date.now();
}

export function canResumeSession(
  resumeId: string | null, 
  credentialHash: string,
  clientContext?: { fingerprint: string }
): boolean {
  if (!resumeId || !sessions.has(resumeId)) return false;
  
  const session = sessions.get(resumeId)!;
  
  // Use timing-safe comparison for credential hashes
  if (!session.credentialHash || !isCredentialHashEqual(session.credentialHash, credentialHash)) {
    return false;
  }
  
  // Validate client context if available
  if (clientContext && session.clientContext && !isClientContextCompatible(session.clientContext, clientContext)) {
    logError(`Client context mismatch for session resume attempt: ${resumeId}`);
    return false;
  }
  
  return true;
}

/**
 * Attempt to resume a session that was created by a previous server process
 * by locating a container whose name encodes the sessionId. If successful the
 * function will create a new ClientSession entry, replay recent logs to the
 * client WebSocket, attach a fresh exec and return true. If it fails to find a
 * suitable container or credentials do not match it returns false so that the
 * caller can continue with the normal new-session flow.
 */
export async function attemptCrossProcessResume(
  resumeId: string, 
  incomingCredentialHash: string, 
  ws: WebSocket,
  clientContext?: { ip: string; userAgent: string; fingerprint: string }
): Promise<boolean> {
  try {
    // Check rate limiting first
    if (shouldRateLimitResumeAttempt(resumeId)) {
      try {
        const errMsg: ServerStatusMessage = { 
          type: 'status', 
          payload: 'error', 
          reason: 'Too many resume attempts. Please wait before trying again.' 
        };
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(errMsg));
      } catch { /* ignore */ }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(4429, 'rate-limited');
      }
      return true; // We handled the request (rejected)
    }

    const containerName = `ably-cli-session-${resumeId}`;

    // Look for a container whose name matches exactly (running or stopped)
    const containers = await docker.listContainers({
      all: true,
      filters: JSON.stringify({ name: [containerName] }),
    });

    if (containers.length === 0) {
      return false; // No container to resume
    }

    const containerInfo = containers[0];

    // If the container is not running we cannot resume – tell client immediately
    if (containerInfo.State !== 'running') {
      try {
        const errMsg: ServerStatusMessage = { type: 'status', payload: 'error', reason: 'Session ended on server' };
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(errMsg));
      } catch { /* ignore */ }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(4004, 'session-ended');
      }
      return true; // handled (but cannot resume)
    }

    const container = docker.getContainer(containerInfo.Id);

    // Inspect to get environment for credential validation & timestamps
    const inspect = await container.inspect();
    const envArray: string[] = inspect.Config?.Env ?? [];

    const envMap: Record<string, string> = {};
    for (const kv of envArray) {
      const idx = kv.indexOf('=');
      if (idx !== -1) {
        envMap[kv.slice(0, idx)] = kv.slice(idx + 1);
      }
    }

    const storedApiKey = envMap['ABLY_API_KEY'] ?? '';
    const storedAccessToken = envMap['ABLY_ACCESS_TOKEN'] ?? '';
    const containerCredentialHash = computeCredentialHash(storedApiKey, storedAccessToken);

    // Use timing-safe comparison for credential validation
    if (!isCredentialHashEqual(containerCredentialHash, incomingCredentialHash)) {
      logError(`[Server] attemptCrossProcessResume: credential mismatch for session ${resumeId}`);
      try {
        const errMsg: ServerStatusMessage = { type: 'status', payload: 'error', reason: 'Credentials do not match original session' };
        ws.send(JSON.stringify(errMsg));
      } catch { /* ignore */ }
      ws.close(4001, 'Credential mismatch');
      return true; // We handled the request (rejected)
    }

    // Build new session object with client context
    const newSession: ClientSession = {
      ws,
      authenticated: true,
      timeoutId: setTimeout(() => {}, 0),
      container,
      execInstance: undefined,
      stdinStream: undefined,
      stdoutStream: undefined,
      sessionId: resumeId,
      lastActivityTime: Date.now(),
      // Use container creation time as session creation time fallback
      creationTime: new Date(inspect.Created).getTime() || Date.now(),
      isAttaching: false,
      credentialHash: containerCredentialHash,
      outputBuffer: [],
      orphanTimer: undefined,
      clientContext,
    };
    clearTimeout(newSession.timeoutId);

    sessions.set(resumeId, newSession);

    // Replay recent logs as best-effort (tail OUTPUT_BUFFER_MAX_LINES)
    try {
      const logBuff = await container.logs({ stdout: true, stderr: true, tail: OUTPUT_BUFFER_MAX_LINES });
      const logStr = Buffer.isBuffer(logBuff) ? logBuff.toString('utf8') : String(logBuff);
      const lines = logStr.split(/\r?\n/);
      for (const line of lines) {
        if (line.length === 0) continue;
        try { ws.send(line); } catch { /* ignore */ }
        newSession.outputBuffer!.push(line);
      }
    } catch (error) {
      logError(`[Server] attemptCrossProcessResume: Failed to fetch logs for replay: ${error}`);
    }

    // Note: The caller (websocket server) will handle attaching to container and setting up message handlers

    logSecure(`[Server] attemptCrossProcessResume: SUCCESS.`, { sessionId: resumeId });
    return true;
  } catch (error) {
    logError(`[Server] attemptCrossProcessResume: Error during cross-process resume attempt: ${error}`);
    return false; // Fall back to fresh session
  }
}

// Add session timeout monitoring
export function startSessionMonitoring(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    sessions.forEach(async (session, sessionId) => {
      // Check for max session duration
      if (now - session.creationTime > MAX_SESSION_DURATION_MS) {
        log(`Session ${sessionId} exceeded maximum duration. Terminating.`);
        await terminateSession(sessionId, "Maximum session duration reached");
        return; // Move to the next session
      }

      // Check for inactivity, only if not currently attaching
      if (!session.isAttaching && (now - session.lastActivityTime > MAX_IDLE_TIME_MS)) {
        log(`Session ${sessionId} timed out due to inactivity. Terminating.`);
        await terminateSession(sessionId, "Session timed out due to inactivity");
      }
    });
  }, 60 * 1000); // Check every minute
}

// Session management exports
export function getSessions(): Map<string, ClientSession> {
  return sessions;
}

export function getSession(sessionId: string): ClientSession | undefined {
  return sessions.get(sessionId);
}

export function setSession(sessionId: string, session: ClientSession): void {
  sessions.set(sessionId, session);
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function getSessionCount(): number {
  return sessions.size;
}

export function getSessionList(): { sessionId: string; authenticated: boolean; lastActivityTime: number }[] {
  return [...sessions.values()].map(session => ({
    sessionId: session.sessionId,
    authenticated: session.authenticated,
    lastActivityTime: session.lastActivityTime
  }));
}

/**
 * Enhanced stale container cleanup for Phase 3 - Server startup cleanup
 * This is more aggressive than the original implementation when no other server instances are detected
 */
export async function cleanupStaleContainers(): Promise<void> {
  try {
    log("Starting enhanced stale container cleanup...");
    
    // Check if other server instances are running
    const otherServersRunning = await detectOtherServerInstances();
    const isOnlyServerInstance = !otherServersRunning;
    
    log(`Other server instances detected: ${otherServersRunning}, this is only instance: ${isOnlyServerInstance}`);
    
    // Get all containers with our label
    const allContainers = await docker.listContainers({ 
      all: true, // Include stopped containers
      filters: {
        label: ["managed-by=ably-cli-terminal-server"]
      }
    });

    log(`Found ${allContainers.length} Ably CLI containers`);

    if (allContainers.length === 0) {
      log("No Ably CLI containers found");
      return;
    }

    let removedCount = 0;
    let skippedCount = 0;
    const batchSize = 3; // Process containers in small batches

    for (let i = 0; i < allContainers.length; i += batchSize) {
      const batch = allContainers.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (containerInfo: ContainerInfo) => {
        const containerId = containerInfo.Id;
        const containerName = containerInfo.Names?.[0] || 'unnamed';
        const isRunning = containerInfo.State === 'running';
        
        try {
          // Check if this container belongs to any active session
          const belongsToActiveSession = [...sessions.values()].some(
            session => session.container?.id === containerId
          );

          if (belongsToActiveSession) {
            log(`Skipping container ${containerId.slice(0, 12)} (${containerName}) - belongs to active session`);
            skippedCount++;
            return;
          }

          // Aggressive cleanup logic based on server instance detection
          let shouldRemove = false;
          let reason = '';

          if (isOnlyServerInstance) {
            // If we're the only server instance, remove ALL orphaned containers
            shouldRemove = true;
            reason = 'orphaned container (no other server instances detected)';
          } else {
            // If other servers might be running, be more conservative
            // Only remove containers that are clearly stale
            if (isRunning) {
              // For running containers when other servers detected, check if they're old
              const container = docker.getContainer(containerId);
              try {
                const inspect = await container.inspect();
                const startTime = new Date(inspect.State.StartedAt).getTime();
                const now = Date.now();
                const ageHours = (now - startTime) / (1000 * 60 * 60);
                
                // Remove running containers older than 2 hours when other servers are detected
                if (ageHours > 2) {
                  shouldRemove = true;
                  reason = `old running container (${ageHours.toFixed(1)} hours old)`;
                }
              } catch (inspectError) {
                log(`Could not inspect container ${containerId.slice(0, 12)}: ${inspectError}`);
                shouldRemove = true;
                reason = 'uninspectable container';
              }
            } else {
              shouldRemove = true;
              reason = 'stopped container';
            }
          }

          if (shouldRemove) {
            log(`Removing container ${containerId.slice(0, 12)} (${containerName}): ${reason}`);
            
            const container = docker.getContainer(containerId);
            
            // Stop first if running
            if (isRunning) {
              try {
                await container.stop({ t: 5 });
                log(`Stopped container ${containerId.slice(0, 12)}`);
              } catch (error) {
                const err = error as { message?: string };
                // Container might have already stopped or exited
                if (!err.message?.includes('is not running') && !err.message?.includes('No such container')) {
                  logError(`Error stopping container ${containerId.slice(0, 12)}: ${error}`);
                }
              }
            }
            
            // Remove container
            try {
              await container.remove({ force: true, v: true });
              log(`Removed container ${containerId.slice(0, 12)} (${containerName})`);
              removedCount++;
            } catch (removeError) {
              const removeErr = removeError as { statusCode?: number };
              if (removeErr.statusCode === 404) {
                log(`Container ${containerId.slice(0, 12)} was already removed`);
                removedCount++;
              } else {
                logError(`Error removing container ${containerId.slice(0, 12)}: ${removeError}`);
              }
            }
          } else {
            log(`Keeping container ${containerId.slice(0, 12)} (${containerName}) - ${isRunning ? 'running' : 'stopped'} and within age limits`);
            skippedCount++;
          }
        } catch (error) {
          logError(`Error processing container ${containerId.slice(0, 12)}: ${error}`);
        }
      });

      // Wait for current batch to complete
      await Promise.allSettled(batchPromises);
      
      // Small delay between batches to prevent overwhelming Docker daemon
      if (i + batchSize < allContainers.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    log(`Container cleanup completed: ${removedCount} removed, ${skippedCount} kept`);
    
    // Additional verification step
    await verifyAllContainersCleanup();

  } catch (error) {
    logError(`Error during stale container cleanup: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Detect if other Ably CLI server instances are running
 * This helps determine how aggressive to be with container cleanup
 */
async function detectOtherServerInstances(): Promise<boolean> {
  try {
    // Method 1: Check for processes listening on similar ports
    // Note: This is a heuristic and may not be 100% accurate
    
    // Method 2: Check for containers running with server labels
    const serverContainers = await docker.listContainers({
      filters: {
        label: ["ably-cli-server=true"]
      }
    });
    
    if (serverContainers.length > 0) {
      log(`Found ${serverContainers.length} server containers running`);
      return true;
    }
    
    // Method 3: Check for lock files or other server indicators
    // This could be enhanced with a more sophisticated server instance detection mechanism
    
    return false;
  } catch (error) {
    logError(`Error detecting other server instances: ${error}`);
    // If we can't detect, assume other servers might be running (conservative approach)
    return true;
  }
}

/**
 * Verify that all expected containers have been cleaned up
 */
async function verifyAllContainersCleanup(): Promise<void> {
  try {
    const remainingContainers = await docker.listContainers({
      all: true,
      filters: {
        label: ["managed-by=ably-cli-terminal-server"]
      }
    });
    
    const activeSessionContainers = new Set(
      [...sessions.values()]
        .map(session => session.container?.id)
        .filter(Boolean)
    );
    
    const orphanedContainers = remainingContainers.filter(
      (container: ContainerInfo) => !activeSessionContainers.has(container.Id)
    );
    
    if (orphanedContainers.length > 0) {
      logError(`Found ${orphanedContainers.length} orphaned containers after cleanup:`);
      orphanedContainers.forEach((container: ContainerInfo) => {
        logError(`  - ${container.Id.slice(0, 12)} (${container.Names?.[0] || 'unnamed'}) - ${container.State}`);
      });
    } else {
      log("Container cleanup verification passed - no orphaned containers detected");
    }
  } catch (error) {
    logError(`Error during container cleanup verification: ${error}`);
  }
}

/**
 * Enhanced container health monitoring for active sessions
 */
export async function monitorContainerHealth(): Promise<void> {
  try {
    const activeSessions = [...sessions.values()].filter(session => session.container);
    
    if (activeSessions.length === 0) {
      return;
    }
    
    log(`Monitoring health of ${activeSessions.length} active session containers`);
    
    for (const session of activeSessions) {
      if (!session.container) continue;
      
      try {
        const inspect = await session.container.inspect();
        const isRunning = inspect.State.Running;
        const exitCode = inspect.State.ExitCode;
        
        if (isRunning || exitCode === 0) {
          // Container is running normally or stopped gracefully
          continue;
        }
        
        logError(`Container ${session.container.id.slice(0, 12)} for session ${session.sessionId} exited with code ${exitCode}`);
        // Clean up the failed session
        void cleanupSession(session.sessionId);
      } catch (error) {
        const err = error as { statusCode?: number };
        if (err.statusCode === 404) {
          log(`Container for session ${session.sessionId} no longer exists - cleaning up session`);
          void cleanupSession(session.sessionId);
        } else {
          logError(`Error monitoring container for session ${session.sessionId}: ${error}`);
        }
      }
    }
  } catch (error) {
    logError(`Error during container health monitoring: ${error}`);
  }
}

/**
 * Comprehensive session/container reconciliation for debugging and monitoring
 * Identifies and optionally fixes inconsistencies between session tracking and actual containers
 */
export async function reconcileSessionsAndContainers(options: {
  dryRun?: boolean;
  autoFix?: boolean;
  detailedReport?: boolean;
} = {}): Promise<{
  consistent: boolean;
  issues: string[];
  fixed: string[];
  report: {
    sessionCount: number;
    containerCount: number;
    trackingMetrics: SessionMetrics;
    orphanedContainers: string[];
    orphanedSessions: string[];
    containersWithoutSessions: string[];
    sessionsWithoutContainers: string[];
  };
}> {
  const { dryRun = true, autoFix = false, detailedReport = false } = options;
  const issues: string[] = [];
  const fixed: string[] = [];
  
  try {
    log("Starting session/container reconciliation...");
    
    // 1. Get current session state
    const sessionMap = getSessions();
    const sessionIds = [...sessionMap.keys()];
    const sessionMetrics = getSessionMetrics();
    const trackingValidation = validateSessionTracking();
    
    // 2. Get all containers managed by this server
    const docker = new Docker();
    const allContainers = await docker.listContainers({ all: true });
    const ourContainers = allContainers.filter((container: ContainerInfo) => 
      container.Labels && 
      container.Labels['managed-by'] === 'ably-cli-terminal-server'
    );
    
    // 3. Categorize containers
    const runningContainers = ourContainers.filter((c: ContainerInfo) => c.State === 'running');
    const stoppedContainers = ourContainers.filter((c: ContainerInfo) => c.State === 'exited' || c.State === 'stopped');
    const deadContainers = ourContainers.filter((c: ContainerInfo) => c.State === 'dead');
    
    // 4. Find orphaned containers (containers without corresponding sessions)
    const orphanedContainers: string[] = [];
    const containersWithoutSessions: string[] = [];
    
    for (const container of runningContainers) {
      const sessionId = container.Labels?.['session-id'];
      if (!sessionId) {
        orphanedContainers.push(container.Id);
        continue;
      }
      
      if (!sessionMap.has(sessionId)) {
        containersWithoutSessions.push(container.Id);
        issues.push(`Running container ${container.Id.slice(0, 12)} has session-id ${sessionId.slice(0, 8)} but no session exists`);
        
        if (autoFix && !dryRun) {
          try {
            const containerObj = docker.getContainer(container.Id);
            await containerObj.stop({ t: 5 });
            await containerObj.remove();
            fixed.push(`Stopped and removed orphaned container ${container.Id.slice(0, 12)}`);
          } catch (error) {
            issues.push(`Failed to clean up orphaned container ${container.Id.slice(0, 12)}: ${error}`);
          }
        }
      }
    }
    
    // 5. Find orphaned sessions (sessions without corresponding containers)
    const orphanedSessions: string[] = [];
    const sessionsWithoutContainers: string[] = [];
    
    for (const [sessionId, session] of sessionMap) {
      if (!session.container) {
        if (session.authenticated) {
          orphanedSessions.push(sessionId);
          issues.push(`Authenticated session ${sessionId.slice(0, 8)} has no container`);
        }
        continue;
      }
      
      const containerId = session.container.id;
      const containerExists = ourContainers.some((c: ContainerInfo) => c.Id === containerId);
      
      if (!containerExists) {
        sessionsWithoutContainers.push(sessionId);
        issues.push(`Session ${sessionId.slice(0, 8)} references non-existent container ${containerId.slice(0, 12)}`);
        
        if (autoFix && !dryRun) {
          try {
            terminateSession(sessionId, 'Container no longer exists');
            fixed.push(`Terminated session ${sessionId.slice(0, 8)} with missing container`);
          } catch (error) {
            issues.push(`Failed to terminate session ${sessionId.slice(0, 8)}: ${error}`);
          }
        }
      }
    }
    
    // 6. Check for stuck containers (stopped but session still exists)
    for (const container of stoppedContainers) {
      const sessionId = container.Labels?.['session-id'];
      if (sessionId && sessionMap.has(sessionId)) {
        issues.push(`Session ${sessionId.slice(0, 8)} exists but container ${container.Id.slice(0, 12)} is stopped`);
        
        if (autoFix && !dryRun) {
          try {
            terminateSession(sessionId, 'Container is stopped');
            const containerObj = docker.getContainer(container.Id);
            await containerObj.remove();
            fixed.push(`Cleaned up stopped container ${container.Id.slice(0, 12)} and terminated session`);
          } catch (error) {
            issues.push(`Failed to clean up stopped container ${container.Id.slice(0, 12)}: ${error}`);
          }
        }
      }
    }
    
    // 7. Check session tracking consistency
    if (!trackingValidation.valid) {
      issues.push(...trackingValidation.issues.map((issue: string) => `Session tracking: ${issue}`));
      
      if (autoFix && !dryRun) {
        // Rebuild session tracking from actual sessions
        clearAllSessionTracking();
        for (const [sessionId, session] of sessionMap) {
          if (session.authenticated) {
            // Determine if authenticated based on access token presence
            const hasAccessToken = session.credentialHash && session.credentialHash.includes('|');
            registerSession(sessionId, hasAccessToken ? 'dummy-token' : undefined);
          }
        }
        fixed.push("Rebuilt session tracking from actual sessions");
      }
    }
    
    // 8. Clean up dead containers
    for (const container of deadContainers) {
      issues.push(`Dead container found: ${container.Id.slice(0, 12)}`);
      
      if (autoFix && !dryRun) {
        try {
          const containerObj = docker.getContainer(container.Id);
          await containerObj.remove();
          fixed.push(`Removed dead container ${container.Id.slice(0, 12)}`);
        } catch (error) {
          issues.push(`Failed to remove dead container ${container.Id.slice(0, 12)}: ${error}`);
        }
      }
    }
    
    // 9. Create comprehensive report
    const report = {
      sessionCount: sessionIds.length,
      containerCount: ourContainers.length,
      trackingMetrics: sessionMetrics,
      orphanedContainers,
      orphanedSessions,
      containersWithoutSessions,
      sessionsWithoutContainers,
      ...(detailedReport && {
        detailed: {
          runningContainers: runningContainers.length,
          stoppedContainers: stoppedContainers.length,
          deadContainers: deadContainers.length,
          sessionTracking: trackingValidation,
          sessions: sessionIds.map(id => ({
            id: id.slice(0, 8),
            authenticated: sessionMap.get(id)?.authenticated || false,
            hasContainer: !!sessionMap.get(id)?.container,
            creationTime: sessionMap.get(id)?.creationTime
          })),
          containers: ourContainers.map((c: ContainerInfo) => ({
            id: c.Id.slice(0, 12),
            state: c.State,
            sessionId: c.Labels?.['session-id']?.slice(0, 8) || 'none',
            created: c.Created
          }))
        }
      })
    };
    
    const consistent = issues.length === 0;
    
    log(`Reconciliation complete. Consistent: ${consistent}, Issues: ${issues.length}, Fixed: ${fixed.length}`);
    
    return {
      consistent,
      issues,
      fixed,
      report
    };
    
  } catch (error) {
    const errorMsg = `Error during reconciliation: ${error}`;
    logError(errorMsg);
    return {
      consistent: false,
      issues: [errorMsg],
      fixed: [],
      report: {
        sessionCount: 0,
        containerCount: 0,
        trackingMetrics: { anonymous: 0, authenticated: 0, total: 0 },
        orphanedContainers: [],
        orphanedSessions: [],
        containersWithoutSessions: [],
        sessionsWithoutContainers: []
      }
    };
  }
}

/**
 * Periodic reconciliation check (lighter version for regular monitoring)
 */
export async function performPeriodicReconciliation(): Promise<void> {
  try {
    const result = await reconcileSessionsAndContainers({ 
      dryRun: true, 
      autoFix: false, 
      detailedReport: false 
    });
    
    if (!result.consistent) {
      logSecure("Periodic reconciliation detected issues", {
        issueCount: result.issues.length,
        sessionCount: result.report.sessionCount,
        containerCount: result.report.containerCount,
        firstFewIssues: result.issues.slice(0, 3)
      });
    }
    
    // Auto-fix critical issues (orphaned containers consuming resources)
    if (result.report.orphanedContainers.length > 0 || result.report.containersWithoutSessions.length > 0) {
      logSecure("Auto-fixing orphaned containers in periodic reconciliation");
      await reconcileSessionsAndContainers({ 
        dryRun: false, 
        autoFix: true, 
        detailedReport: false 
      });
    }
  } catch (error) {
    logError(`Error in periodic reconciliation: ${error}`);
  }
}

// Test hooks for session management
export const __testHooks = { scheduleOrphanCleanup, sessions, takeoverSession, canResumeSession };

// Additional helper ONLY for unit tests – allows tests to safely delete a
// session entry from the map (e.g. placeholder) without performing any socket
// or container cleanup logic.
// Not used in production code.
export function __deleteSessionForTest(id: string): void {
  if (sessions.has(id)) {
    const s = sessions.get(id)!;
    clearTimeout(s.timeoutId);
    sessions.delete(id);
  }
} 