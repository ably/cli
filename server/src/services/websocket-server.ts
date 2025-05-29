import { WebSocket, WebSocketServer } from "ws";
import * as http from "node:http";
import type { ClientSession } from "../types/session.types.js";
import type { ServerStatusMessage } from "../types/websocket.types.js";
import { 
  DEFAULT_PORT, 
  DEFAULT_MAX_SESSIONS, 
  AUTH_TIMEOUT_MS,
  SHUTDOWN_GRACE_PERIOD_MS 
} from "../config/server-config.js";
import { logSecure, logError } from "../utils/logger.js";
import { validateAndPurgeCredentials } from "./auth-service.js";
import { initializeSecurity, createSecureNetwork } from "./security-service.js";
import { cleanupStaleContainers, ensureDockerImage, createContainer } from "./docker-manager.js";
import { 
  generateSessionId, 
  terminateSession, 
  cleanupAllSessions,
  cleanupSession,
  scheduleOrphanCleanup,
  startSessionMonitoring,
  getSessions,
  setSession,
  takeoverSession,
  attemptCrossProcessResume,
  canResumeSession
} from "./session-manager.js";
import { attachToContainer, handleMessage } from "../utils/stream-handler.js";
import { extractClientContext, shouldRateLimitResumeAttempt, computeCredentialHash } from "../utils/session-utils.js";

const handleProtocols = (protocols: Set<string>, _request: unknown): string | false => {
    const firstProtocol = protocols.values().next().value;
    return firstProtocol === undefined ? false : firstProtocol;
};

// Moved from startServer scope
const verifyClient = (info: { origin: string; req: http.IncomingMessage; secure: boolean }, callback: (res: boolean, code?: number, message?: string, headers?: http.OutgoingHttpHeaders) => void) => {
    const origin = info.req.headers.origin || '*';
    logSecure(`Client connecting from origin: ${origin}`);
    // Allow all connections for now, but could add origin checks here
    callback(true);
};

// --- WebSocket Server Setup (Restored & Modified) ---
export async function startServer(): Promise<http.Server> {
    logSecure('Starting WebSocket server...');
    
    // Initialize security first
    initializeSecurity();
    
    await cleanupStaleContainers();
    await ensureDockerImage(); // Ensure image exists before starting

    const port = Number.parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
    const maxSessions = Number.parseInt(process.env.MAX_SESSIONS || String(DEFAULT_MAX_SESSIONS), 10);

    const server = http.createServer((_req, res) => {
        // Simple health check endpoint
        if (_req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    const wss = new WebSocketServer({
        server,
        handleProtocols, // Use function from outer scope
        verifyClient, // Use function from outer scope
    });

    // Start the HTTP server
    await new Promise<void>((resolve) => {
        server.listen(port, () => {
            logSecure(`WebSocket server listening on port ${port}`);
            resolve();
        });
    });

    // Start session monitoring
    const sessionMonitoringInterval = startSessionMonitoring();

    // A keep-alive interval to prevent the process from exiting
    const keepAliveInterval = setInterval(() => {
        // No-op, just keeps the event loop active
    }, 60000);

    wss.on("connection", (ws: WebSocket, _req: http.IncomingMessage) => {
        const sessionId = generateSessionId();
        logSecure(`[Server] New connection. Assigned sessionId: ${sessionId}`);

        // Immediately send a "connecting" status message
        try {
          const connectingMsg: ServerStatusMessage = { type: "status", payload: "connecting" };
          ws.send(JSON.stringify(connectingMsg));
          logSecure(`Sent 'connecting' status to new session ${sessionId}`);
        } catch (error) {
          logError(`Error sending 'connecting' status to ${sessionId}: ${error}`);
          // If we can't send 'connecting', close the connection
          ws.close(1011, "Failed to send initial status");
          // Note: No session object to cleanup here yet if this fails immediately.
          return;
        }

        const sessions = getSessions();
        if (sessions.size >= maxSessions) {
            logSecure("Max session limit reached. Rejecting new connection.");
            // Send structured error status before closing so client can handle gracefully
            const busyMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Server busy. Please try again later." };
            try { ws.send(JSON.stringify(busyMsg)); } catch { /* ignore */ }
            ws.close(1013, "Server busy");
            return;
        }

        // Create a minimal initial session state for tracking
        const initialSession: Partial<ClientSession> = {
             ws: ws,
             timeoutId: setTimeout(() => {
                 logSecure(`Authentication timeout for session ${sessionId}.`);
                 // Ensure ws is still open before closing
                 if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                     const timeoutMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Authentication timeout" };
                     try { ws.send(JSON.stringify(timeoutMsg)); } catch { /* ignore */ }
                     ws.close(4008, 'Authentication timeout');
                 }
                 cleanupSession(sessionId); // Cleanup based on ID
             }, AUTH_TIMEOUT_MS),
             sessionId: sessionId,
             authenticated: false,
             lastActivityTime: Date.now(),
             creationTime: Date.now(),
             isAttaching: false,
        };

        // Store partial session - crucial for cleanup if auth fails
        setSession(sessionId, initialSession as ClientSession);

        // Handle the single authentication message
        ws.once('message', async (message: Buffer) => {
            // --- Authentication Phase ---
            try {
                let authPayload: { apiKey?: string; accessToken?: string; environmentVariables?: Record<string, string>; sessionId?: string };
                try {
                    authPayload = JSON.parse(message.toString());
                } catch (_error) {
                    void _error;
                    logError(`[${sessionId}] Failed to parse auth message JSON.`);
                    const invalidAuthMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Invalid auth message format" };
                    try { ws.send(JSON.stringify(invalidAuthMsg)); } catch { /* ignore */ }
                    ws.close(4008, 'Invalid auth format');
                    if (sessionId) cleanupSession(sessionId);
                    return;
                }

                // --- Credential validation logic & (optional) resume handshake ---

                const resumeAttemptId = authPayload.sessionId && typeof authPayload.sessionId === 'string' ? authPayload.sessionId : null;

                // Compute credential hash early (used in both fresh & resume flows)
                const incomingCredentialHash = computeCredentialHash(authPayload.apiKey, authPayload.accessToken);

                if (resumeAttemptId) {
                    // First attempt in-memory resume
                    const sessions = getSessions();
                    if (sessions.has(resumeAttemptId)) {
                        const existing = sessions.get(resumeAttemptId)!;
                        logSecure(`[Server] Resume attempt: incoming sessionId=${resumeAttemptId}`);

                        if (existing.credentialHash !== incomingCredentialHash) {
                            logError(`[${sessionId}] Resume rejected: credential mismatch`);
                            try {
                              const errMsg: ServerStatusMessage = { type: 'status', payload: 'error', reason: 'Credentials do not match original session' };
                              ws.send(JSON.stringify(errMsg));
                            } catch { /* ignore */ }
                            ws.close(4001, 'Credential mismatch');
                            return;
                        }

                        // Take over existing session socket
                        takeoverSession(existing, ws);

                        // We must now clean up the *placeholder* session object that was
                        // created for this connection (identified by `sessionId`). Leaving
                        // it in the sessions map would allow its AUTH_TIMEOUT_MS timer to
                        // fire 10 s later, closing the very WebSocket we've just attached.
                        if (sessionId !== resumeAttemptId && sessions.has(sessionId)) {
                          const placeholder = sessions.get(sessionId)!;
                          clearTimeout(placeholder.timeoutId);
                          sessions.delete(sessionId);
                        }

                        // Send buffered output prior to new piping
                        if (existing.outputBuffer && existing.outputBuffer.length > 0) {
                           for (const line of existing.outputBuffer) {
                              try { ws.send(line); } catch { /* ignore send errors */ }
                           }
                        }

                        // Attach streams (new exec) so input/output resumes
                        try {
                           await attachToContainer(existing, ws);
                           ws.on('message', (msg) => handleMessage(existing, msg as Buffer));
                           logSecure(`[Server] In-memory resume: SUCCESS. sessionId=${resumeAttemptId}`);
                        } catch {
                           logError(`[Server] In-memory resume: FAILED. sessionId=${resumeAttemptId}`);
                           terminateSession(existing.sessionId, 'Failed in-memory resume');
                        }
                        return; // In-memory resume handled
                    }

                    // Fallback: try to restore session by locating existing container
                    const restored = await attemptCrossProcessResume(resumeAttemptId, incomingCredentialHash, ws);
                    if (restored) {
                        logSecure(`[Server] Cross-process resume: SUCCESS. sessionId=${resumeAttemptId}`);

                        // Clean up the placeholder session for this connection just as we do in the
                        // in-memory resume path.
                        if (sessionId !== resumeAttemptId && sessions.has(sessionId)) {
                          const placeholder = sessions.get(sessionId)!;
                          clearTimeout(placeholder.timeoutId);
                          sessions.delete(sessionId);
                        }

                        // The attemptCrossProcessResume function handles container attachment
                        // but we still need to set up the message handler for the restored session
                        const restoredSession = getSessions().get(resumeAttemptId);
                        if (restoredSession) {
                          try {
                            await attachToContainer(restoredSession, ws);
                            ws.on('message', (msg) => handleMessage(restoredSession, msg as Buffer));
                          } catch {
                            logError(`[Server] Cross-process resume attachment: FAILED. sessionId=${resumeAttemptId}`);
                            terminateSession(restoredSession.sessionId, 'Failed cross-process resume attachment');
                          }
                        }

                        return; // Resume handled
                    }
                    // If restoration failed we will continue creating a fresh session below.
                }

                // --- Credential validation logic for fresh session ---
                const hasApiKey = typeof authPayload.apiKey === 'string' && authPayload.apiKey.trim().length > 0;
                const hasAccessToken = typeof authPayload.accessToken === 'string' && authPayload.accessToken.trim().length > 0;

                // If neither credential is supplied, reject
                if (!hasApiKey && !hasAccessToken) {
                    logError(`[${sessionId}] No credentials supplied.`);
                    const missingCredMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "No API key or access token provided" };
                    try { ws.send(JSON.stringify(missingCredMsg)); } catch { /* ignore */ }
                    ws.close(4001, 'Missing credentials');
                    if (sessionId) cleanupSession(sessionId);
                    return;
                }

                // If an access token is supplied and *looks* like a JWT, run structural validation; otherwise accept as-is.
                const accessTokenStr = hasAccessToken ? String(authPayload.accessToken) : null;
                if (accessTokenStr && accessTokenStr.split('.').length === 3) {
                    const validation = validateAndPurgeCredentials({ accessToken: accessTokenStr });
                    if (!validation.valid) {
                        logError(`[${sessionId}] Supplied JWT access token failed validation.`);
                        const invalidTokenMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Invalid or expired access token" };
                        try { ws.send(JSON.stringify(invalidTokenMsg)); } catch { /* ignore */ }
                        ws.close(4001, 'Invalid token');
                        if (sessionId) cleanupSession(sessionId);
                        return;
                    }
                }
                const { apiKey, accessToken, environmentVariables } = authPayload;

                // --- Auth Success -> Container Creation Phase ---
                logSecure(`[Server] Authentication successful.`);

                // Clear the auth timeout since we've authenticated successfully
                clearTimeout(initialSession.timeoutId);

                let container;
                try {
                   // Pass credentials to createContainer
                   container = await createContainer(apiKey ?? '', accessToken ?? '', environmentVariables || {}, sessionId);
                   logSecure(`[Server] Container created successfully: ${container.id}`);

                   // Start the container before attempting to attach
                   await container.start();
                   logSecure(`[Server] Container started successfully: ${container.id}`);

                } catch (error) {
                    logError(`[Server] Failed to create or start container: ${error instanceof Error ? error.message : String(error)}`);
                    const containerErrorMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Failed to create session environment" };
                    try { ws.send(JSON.stringify(containerErrorMsg)); } catch { /* ignore */ }
                    ws.close(1011, 'Container creation failed');
                    if (sessionId) cleanupSession(sessionId); // Cleanup partial session
                    return;
                }

                // Compute credential hash for later resume validation
                const credentialHash = computeCredentialHash(apiKey, accessToken);
                logSecure(`[Server] credentialHash=${credentialHash.slice(0, 8)}...`);

                // --- Create Full Session Object ---
                const fullSession: ClientSession = {
                    ...(initialSession as ClientSession), // Spread initial properties (ws, sessionId)
                    authenticated: true,
                    isAttaching: false, // Will be set to true by attachToContainer
                    timeoutId: setTimeout(() => {}, 0), // Dummy timeout, immediately cleared
                    container: container,
                    credentialHash,
                    // execInstance, stdinStream, stdoutStream added by attachToContainer
                };
                clearTimeout(fullSession.timeoutId); // Clear the dummy timeout
                setSession(sessionId, fullSession); // Update session map with full data
                logSecure(`[Server] Full session object created.`);

                // --- Attachment Phase ---
                try {
                    // Wait for attachment to complete before setting up message handlers
                    await attachToContainer(fullSession, ws);
                    logSecure(`[Server] Successfully attached to container.`);

                    // --- Set up Main Message Handler ---
                    // Only set up *after* successful attachment
                    ws.on('message', (msg) => handleMessage(fullSession, msg as Buffer));
                    logSecure(`[Server] Main message handler attached.`);
                } catch (_error) {
                    // Attachment failed, but we'll let the error handling in attachToContainer handle it
                    logError(`[Server] Attachment error: ${String(_error)}`);
                    // Don't attempt to cleanup here as attachToContainer will have done it already
                }
            } catch (error) {
                // Catch errors during the setup process (auth, container create, attach)
                logError(`[Server] Error during connection setup: ${error instanceof Error ? error.message : String(error)}`);
                const setupErrorMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Internal server error during setup" };
                try { ws.send(JSON.stringify(setupErrorMsg)); } catch { /* ignore */ }
                ws.close(1011, 'Setup error');
                if (sessionId) cleanupSession(sessionId); // Cleanup whatever state exists
            }
        });

        // Handle top-level WebSocket close/error (covers cases before/during auth)
        // For connections that have completed authentication we do **not** destroy
        // the session immediately – instead we schedule orphan cleanup so the
        // container can be resumed within the RESUME_GRACE_MS window.
        const topLevelCloseHandler = (code: number, reason: Buffer) => {
            logSecure(`[Server] WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);

            const existing = getSessions().get(sessionId);
            if (existing && existing.authenticated) {
                // Authenticated session ⇒ keep it around for possible resume
                scheduleOrphanCleanup(existing);
            } else {
                // Not yet authenticated ⇒ safe to purge immediately
                cleanupSession(sessionId);
            }
        };

        ws.on('close', topLevelCloseHandler);

        ws.on('error', (err) => {
            logError(`[Server] WebSocket error: ${err.message}`);
            const existing = getSessions().get(sessionId);
            if (existing && existing.authenticated) {
                scheduleOrphanCleanup(existing);
            } else {
                cleanupSession(sessionId);
            }
        });
    });

    wss.on("error", (error: Error) => {
        logError(`WebSocket Server Error: ${error.message}`);
        // Consider more robust error handling? Shutdown?
    });

    // --- Graceful Shutdown ---
    let isShuttingDown = false;

    const shutdown = async (signal: string) => {
        // Prevent multiple shutdown attempts
        if (isShuttingDown) {
            logSecure(`Already shutting down, ignoring additional ${signal} signal`);
            return;
        }

        isShuttingDown = true;
        logSecure(`Received ${signal}. Shutting down server...`);

        // Clear the intervals
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
        }
        if (sessionMonitoringInterval) {
            clearInterval(sessionMonitoringInterval);
        }

        await cleanupAllSessions();

        logSecure('Closing WebSocket server...');

        // Set a timeout to force exit if cleanup takes too long
        const forceExitTimeout = setTimeout(() => {
            logError("Shutdown timed out. Forcing exit.");
            process.exit(1);
        }, SHUTDOWN_GRACE_PERIOD_MS);

        try {
            await new Promise<void>((resolve, reject) => {
                wss.close((err) => {
                    if (err) {
                        logError(`Error closing WebSocket server: ${err}`);
                        reject(err);
                        return;
                    }
                    logSecure('WebSocket server closed.');
                    resolve();
                });
            });

            await new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        logError(`Error closing HTTP server: ${err}`);
                        reject(err);
                        return;
                    }
                    logSecure('HTTP server closed.');
                    resolve();
                });
            });

            // Clear the force exit timeout
            clearTimeout(forceExitTimeout);
            logSecure('Shutdown complete.');

            // Exit with success code
            process.exit(0);
        } catch (error) {
            logError(`Error during shutdown: ${error}`);
            // Let the timeout handle the force exit
        }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    return server;
}

/**
 * Initialize and start the server
 */
export async function initializeServer(): Promise<http.Server> {
  // Create secure network before server starts
  try {
    await createSecureNetwork();
  } catch (error) {
    logError(`Failed to create secure network: ${error}`);
    logSecure('Continuing with default network configuration');
  }

  const server = await startServer();
  logSecure("Terminal server started successfully.");
  return server;
} 