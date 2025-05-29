import { WebSocket } from "ws";
import * as crypto from "node:crypto";
import { createRequire } from "node:module";
import type { ClientSession } from "../types/session.types.js";
import type { ServerStatusMessage } from "../types/websocket.types.js";
import { computeCredentialHash } from "../utils/session-utils.js";
import { 
  MAX_IDLE_TIME_MS, 
  MAX_SESSION_DURATION_MS, 
  RESUME_GRACE_MS,
  OUTPUT_BUFFER_MAX_LINES 
} from "../config/server-config.js";
import { log, logError } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");

const docker = new Dockerode();

// Global sessions map
const sessions = new Map<string, ClientSession>();

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
    return;
  }

  log(`[Server] terminateSession called for sessionId=${sessionId}, reason=${reason}`);
  clearTimeout(session.timeoutId);

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
  
  for (const sessionId of sessionIds) {
    try {
      await terminateSession(sessionId, "Server shutdown", false);
    } catch (error: unknown) {
      logError(`Error terminating session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  log("All sessions cleaned up.");
}

export async function cleanupSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }
  log(`[Server] cleanupSession called for sessionId=${sessionId}`);

  // Attempt to send disconnected status if ws is open and not already handled by terminateSession
  // This is more of a fallback. terminateSession is the primary place.
  if (session.ws && session.ws.readyState === WebSocket.OPEN && !session.ws.CLOSING && !session.ws.CLOSED) {
    // Check if terminateSession might have already sent it by checking if a close reason related to termination was set.
    // This is heuristic. A more robust way would be a flag on the session object.
    // For now, we err on sending potentially twice vs. not at all in cleanup path.
    try {
      const statusMsg: ServerStatusMessage = { type: "status", payload: "disconnected", reason: "Session cleanup initiated" };
      session.ws.send(JSON.stringify(statusMsg));
      log(`Sent 'disconnected' status during cleanup for session ${sessionId} (fallback)`);
    } catch { /* ignore */ }
  }

  clearTimeout(session.timeoutId);

  if (session.stdinStream) {
    session.stdinStream.end();
    session.stdinStream.destroy(); // Ensure stream is fully destroyed
    log(`stdinStream for session ${sessionId} ended and destroyed.`);
  }
  if (session.stdoutStream) {
    // stdoutStream is readable, typically doesn't need end(); just destroy
    session.stdoutStream.destroy();
    log(`stdoutStream for session ${sessionId} destroyed.`);
  }

  // Remove container if it exists and isn't already being removed
  if (session.container) {
    try {
      log(`Removing container ${session.container.id}...`);
      await session.container.remove({ force: true }).catch((error: Error) => {
        log(`Note: Error removing container ${session.container?.id}: ${error.message}.`);
      });
      log(`Container ${session.container.id} removed.`);
    } catch (error) {
      log(`Note: Error during container removal: ${error}.`);
    }
  }

  sessions.delete(sessionId);
  log(`Session ${sessionId} removed. Active sessions: ${sessions.size}`);
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

export function canResumeSession(resumeId: string | null, credentialHash: string): boolean {
  if (!resumeId || !sessions.has(resumeId)) return false;
  return sessions.get(resumeId)!.credentialHash === credentialHash;
}

/**
 * Attempt to resume a session that was created by a previous server process
 * by locating a container whose name encodes the sessionId. If successful the
 * function will create a new ClientSession entry, replay recent logs to the
 * client WebSocket, attach a fresh exec and return true. If it fails to find a
 * suitable container or credentials do not match it returns false so that the
 * caller can continue with the normal new-session flow.
 */
export async function attemptCrossProcessResume(resumeId: string, incomingCredentialHash: string, ws: WebSocket): Promise<boolean> {
  try {
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

    if (containerCredentialHash !== incomingCredentialHash) {
      logError(`[Server] attemptCrossProcessResume: credential mismatch. containerCredentialHash=${containerCredentialHash}`);
      try {
        const errMsg: ServerStatusMessage = { type: 'status', payload: 'error', reason: 'Credentials do not match original session' };
        ws.send(JSON.stringify(errMsg));
      } catch { /* ignore */ }
      ws.close(4001, 'Credential mismatch');
      return true; // We handled the request (rejected)
    }

    // Build new session object
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

    log(`[Server] attemptCrossProcessResume: SUCCESS. sessionId=${resumeId}`);
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