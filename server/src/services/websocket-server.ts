import { WebSocket, WebSocketServer } from "ws";
import * as http from "node:http";
import type { ClientSession } from "../types/session.types.js";
import type { ServerStatusMessage } from "../types/websocket.types.js";
import { 
  PORT,
  AUTH_TIMEOUT_MS,
  SHUTDOWN_GRACE_PERIOD_MS,
  MAX_WEBSOCKET_MESSAGE_SIZE,
  validateConfiguration,
  getConfigurationSummary
} from "../config/server-config.js";
import { logSecure, logError } from "../utils/logger.js";
import { validateAndPurgeCredentials } from "./auth-service.js";
import { initializeSecurity, createSecureNetwork, cleanupSecurity } from "./security-service.js";
import { cleanupStaleContainers, ensureDockerImage, createContainer, enableAutoRemoval } from "./docker-manager.js";
import { 
  initializeRateLimiting,
  shutdownRateLimiting,
  isIPRateLimited,
  recordConnectionAttempt,
  isSessionResumeLimited,
  recordSessionResumeAttempt,
  validateMessageSize,
  getRateLimitingStats,
  getClientIPFromRequest
} from "./rate-limiting-service.js";
import { 
  canCreateSession,
  registerSession,
  unregisterSession,
  getSessionMetrics,
  getSessionAlerts
} from "./session-tracking-service.js";
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
import { computeCredentialHash } from "../utils/session-utils.js";

const handleProtocols = (protocols: Set<string>, _request: unknown): string | false => {
    const firstProtocol = protocols.values().next().value;
    return firstProtocol === undefined ? false : firstProtocol;
};

// Moved from startServer scope
const verifyClient = (info: { origin: string; req: http.IncomingMessage; secure: boolean }, callback: (res: boolean, code?: number, message?: string, headers?: http.OutgoingHttpHeaders) => void) => {
    const origin = info.req.headers.origin || '*';
    const clientIP = getClientIPFromRequest(info.req); // Use secure IP extraction
    
    logSecure(`Client connecting from origin and IP`, { 
      origin, 
      ip: clientIP,
      proxyHeaders: {
        xForwardedFor: info.req.headers['x-forwarded-for'],
        xRealIp: info.req.headers['x-real-ip']
      }
    });
    
    // Check IP rate limiting with request context
    if (isIPRateLimited(clientIP, info.req)) {
      logSecure("Connection rejected due to IP rate limiting", { 
        ip: clientIP,
        userAgent: info.req.headers['user-agent']
      });
      callback(false, 429, 'Too Many Requests');
      return;
    }
    
    // Record connection attempt with request context
    if (!recordConnectionAttempt(clientIP, info.req)) {
      logSecure("Connection rejected - IP rate limit exceeded", { 
        ip: clientIP,
        userAgent: info.req.headers['user-agent']
      });
      callback(false, 429, 'Too Many Requests');
      return;
    }
    
    // Allow all connections for now, but could add origin checks here
    callback(true);
};

// --- WebSocket Server Setup (Restored & Modified) ---
export async function startServer(): Promise<http.Server> {
    logSecure('Starting WebSocket server with enhanced security and DoS protection...');
    
    // Validate configuration first
    const configValidation = validateConfiguration();
    if (!configValidation.valid) {
      logError(`Configuration validation failed: ${configValidation.issues.join(', ')}`);
      throw new Error(`Invalid configuration: ${configValidation.issues.join(', ')}`);
    }
    
    // Log configuration summary
    logSecure('Server configuration loaded', getConfigurationSummary());
    
    // Initialize security with CI-aware handling
    try {
        initializeSecurity();
        logSecure('Security profiles initialized successfully');
    } catch (error) {
        logError(`Fatal: Security initialization failed - ${error}`);
        throw new Error(`Cannot start server without proper security: ${error}`);
    }
    
    // Initialize rate limiting service
    initializeRateLimiting();
    
    // Create secure network with CI-aware handling
    try {
        await createSecureNetwork();
        logSecure('Network initialization completed');
    } catch (error) {
        // Import IS_DEVELOPMENT from config for development detection
        const { IS_CI, IS_DEVELOPMENT } = await import('../config/server-config.js');
        if (IS_DEVELOPMENT || IS_CI) {
            logSecure(`${IS_DEVELOPMENT ? 'Development' : IS_CI ? 'CI' : 'production'} mode: Network creation failed (${error}) - server will continue with default bridge network`);
        } else {
            logError(`Fatal: Secure network setup failed - ${error}`);
            throw new Error(`Cannot start server without secure network: ${error}`);
        }
    }
    
    await cleanupStaleContainers();
    
    // Ensure Docker image exists before starting (development/CI-aware)
    try {
        await ensureDockerImage();
        logSecure('Docker image verification completed');
    } catch (error) {
        // Import IS_DEVELOPMENT from config for development detection
        const { IS_CI, IS_DEVELOPMENT } = await import('../config/server-config.js');
        if (IS_DEVELOPMENT || IS_CI) {
            logSecure(`${IS_DEVELOPMENT ? 'Development' : IS_CI ? 'CI' : 'production'} mode: Docker image operations failed (${error}) - server will continue without pre-built image`);
            logSecure('Development or CI mode: Container creation may fail if Docker image is not available');
        } else {
            logError(`Fatal: Docker image setup failed - ${error}`);
            throw new Error(`Cannot start server without Docker image: ${error}`);
        }
    }

    const server = http.createServer((_req, res) => {
        // Simple health check endpoint
        if (_req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
        } else if (_req.url === '/stats') {
            // Basic stats endpoint
            const sessionStats = getSessionMetrics();
            const rateLimitStats = getRateLimitingStats();
            const alerts = getSessionAlerts();
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              sessions: sessionStats,
              rateLimiting: rateLimitStats,
              alerts: alerts.alerts
            }));
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
        server.listen(PORT, () => {
            logSecure(`WebSocket server listening on port ${PORT}`);
            resolve();
        });
    });

    // Start session monitoring
    const sessionMonitoringInterval = startSessionMonitoring();

    // A keep-alive interval to prevent the process from exiting
    const keepAliveInterval = setInterval(() => {
        // Log session alerts if any
        const alerts = getSessionAlerts();
        if (alerts.alerts.length > 0) {
          logSecure("Session capacity alerts", { alerts: alerts.alerts });
        }
    }, 60000);

    wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
        const sessionId = generateSessionId();
        const clientIP = getClientIPFromRequest(req); // Use secure IP extraction
        
        logSecure(`[Server] New connection assigned sessionId`, { 
          sessionId: sessionId.slice(0, 8),
          ip: clientIP,
          userAgent: req.headers['user-agent'],
          proxyHeaders: {
            xForwardedFor: req.headers['x-forwarded-for'],
            xRealIp: req.headers['x-real-ip']
          }
        });

        // Immediately send a "connecting" status message
        try {
          const connectingMsg: ServerStatusMessage = { type: "status", payload: "connecting" };
          ws.send(JSON.stringify(connectingMsg));
          logSecure(`Sent 'connecting' status to new session ${sessionId.slice(0, 8)}`);
        } catch (error) {
          logError(`Error sending 'connecting' status to ${sessionId}: ${error}`);
          // If we can't send 'connecting', close the connection
          ws.close(1011, "Failed to send initial status");
          // Note: No session object to cleanup here yet if this fails immediately.
          return;
        }

        // Create a minimal initial session state for tracking
        const initialSession: Partial<ClientSession> = {
             ws: ws,
             timeoutId: setTimeout(() => {
                 logSecure(`Authentication timeout for session ${sessionId.slice(0, 8)}`);
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
            // --- Message Size Validation ---
            if (!validateMessageSize(message.length, MAX_WEBSOCKET_MESSAGE_SIZE)) {
              logSecure("Authentication message too large", {
                sessionId: sessionId.slice(0, 8),
                size: message.length,
                limit: MAX_WEBSOCKET_MESSAGE_SIZE
              });
              const sizeErrorMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Message too large" };
              try { ws.send(JSON.stringify(sizeErrorMsg)); } catch { /* ignore */ }
              ws.close(4009, 'Message too large');
              cleanupSession(sessionId);
              return;
            }

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

                // --- Session Limit Check ---
                const sessionCheck = canCreateSession(authPayload.accessToken);
                if (!sessionCheck.allowed) {
                    logSecure("Session creation denied", {
                      sessionId: sessionId.slice(0, 8),
                      sessionType: sessionCheck.sessionType,
                      reason: sessionCheck.reason
                    });
                    const limitMsg: ServerStatusMessage = { type: "status", payload: "error", reason: sessionCheck.reason };
                    try { ws.send(JSON.stringify(limitMsg)); } catch { /* ignore */ }
                    ws.close(4013, 'Session limit reached');
                    cleanupSession(sessionId);
                    return;
                }

                // --- Credential validation logic & (optional) resume handshake ---

                const resumeAttemptId = authPayload.sessionId && typeof authPayload.sessionId === 'string' ? authPayload.sessionId : null;

                // Compute credential hash early (used in both fresh & resume flows)
                const incomingCredentialHash = computeCredentialHash(authPayload.apiKey, authPayload.accessToken);

                if (resumeAttemptId) {
                    // Check session resume rate limit
                    if (isSessionResumeLimited(resumeAttemptId)) {
                      const rateLimitMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Too many resume attempts. Try again later." };
                      try { ws.send(JSON.stringify(rateLimitMsg)); } catch { /* ignore */ }
                      ws.close(4029, 'Resume rate limited');
                      cleanupSession(sessionId);
                      return;
                    }

                    // Record resume attempt
                    if (!recordSessionResumeAttempt(resumeAttemptId)) {
                      const rateLimitMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Resume rate limit exceeded" };
                      try { ws.send(JSON.stringify(rateLimitMsg)); } catch { /* ignore */ }
                      ws.close(4029, 'Resume rate limited');
                      cleanupSession(sessionId);
                      return;
                    }

                    // First attempt in-memory resume
                    const sessions = getSessions();
                    if (sessions.has(resumeAttemptId)) {
                        const existing = sessions.get(resumeAttemptId)!;
                        logSecure(`[Server] Resume attempt: incoming sessionId=${resumeAttemptId.slice(0, 8)}`);

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
                           logSecure(`[Server] In-memory resume: SUCCESS. sessionId=${resumeAttemptId.slice(0, 8)}`);
                        } catch {
                           logError(`[Server] In-memory resume: FAILED. sessionId=${resumeAttemptId.slice(0, 8)}`);
                           terminateSession(existing.sessionId, 'Failed in-memory resume');
                        }
                        return; // In-memory resume handled
                    }

                    // Fallback: try to restore session by locating existing container
                    const restored = await attemptCrossProcessResume(resumeAttemptId, incomingCredentialHash, ws);
                    if (restored) {
                        logSecure(`[Server] Cross-process resume: SUCCESS. sessionId=${resumeAttemptId.slice(0, 8)}`);

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
                            logError(`[Server] Cross-process resume attachment: FAILED. sessionId=${resumeAttemptId.slice(0, 8)}`);
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

                // Register session in tracking system
                if (!registerSession(sessionId, authPayload.accessToken)) {
                    logSecure("Session registration failed in tracking", {
                      sessionId: sessionId.slice(0, 8)
                    });
                    const trackingErrorMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Session registration failed" };
                    try { ws.send(JSON.stringify(trackingErrorMsg)); } catch { /* ignore */ }
                    ws.close(4013, 'Registration failed');
                    cleanupSession(sessionId);
                    return;
                }

                const { apiKey, accessToken, environmentVariables } = authPayload;

                // --- Auth Success -> Container Creation Phase ---
                logSecure(`[Server] Authentication successful for session`, {
                  sessionId: sessionId.slice(0, 8),
                  sessionType: sessionCheck.sessionType
                });

                // Clear the auth timeout since we've authenticated successfully
                clearTimeout(initialSession.timeoutId);

                let container;
                try {
                   // Pass credentials to createContainer with enhanced security
                   container = await createContainer(apiKey ?? '', accessToken ?? '', environmentVariables || {}, sessionId);
                   logSecure(`[Server] Enhanced security container created: ${container.id.slice(0, 12)}`);

                   // Start the container before attempting to attach
                   await container.start();
                   logSecure(`[Server] Container started successfully: ${container.id.slice(0, 12)}`);

                   // Enable auto-removal for cleanup after session ends
                   await enableAutoRemoval(container);

                } catch (error) {
                    logError(`[Server] Failed to create/start/configure container: ${error instanceof Error ? error.message : String(error)}`);
                    
                    // Unregister session from tracking
                    unregisterSession(sessionId);
                    
                    const containerErrorMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Failed to create secure session environment" };
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
                    ws.on('message', (msg: Buffer) => {
                      // Validate message size for ongoing messages
                      if (!validateMessageSize(msg.length, MAX_WEBSOCKET_MESSAGE_SIZE)) {
                        logSecure("Message too large, terminating session", {
                          sessionId: sessionId.slice(0, 8),
                          size: msg.length
                        });
                        terminateSession(sessionId, 'Message size limit exceeded');
                        return;
                      }
                      handleMessage(fullSession, msg);
                    });
                    logSecure(`[Server] Main message handler attached.`);
                } catch (_error) {
                    // Attachment failed, but we'll let the error handling in attachToContainer handle it
                    logError(`[Server] Attachment error: ${String(_error)}`);
                    
                    // Unregister session from tracking
                    unregisterSession(sessionId);
                    
                    // Don't attempt to cleanup here as attachToContainer will have done it already
                }
            } catch (error) {
                // Catch errors during the setup process (auth, container create, attach)
                logError(`[Server] Error during connection setup: ${error instanceof Error ? error.message : String(error)}`);
                
                // Unregister session from tracking if it was registered
                unregisterSession(sessionId);
                
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
            logSecure(`[Server] WebSocket closed`, {
              sessionId: sessionId.slice(0, 8),
              code,
              reason: reason.toString()
            });

            const existing = getSessions().get(sessionId);
            if (existing && existing.authenticated) {
                // Authenticated session ⇒ keep it around for possible resume
                scheduleOrphanCleanup(existing);
            } else {
                // Not yet authenticated ⇒ safe to purge immediately
                unregisterSession(sessionId);
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
                unregisterSession(sessionId);
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
        logSecure(`Received ${signal}. Shutting down server with security and rate limiting cleanup...`);

        // Clear the intervals
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
        }
        if (sessionMonitoringInterval) {
            clearInterval(sessionMonitoringInterval);
        }

        await cleanupAllSessions();

        // Clean up rate limiting service
        try {
            shutdownRateLimiting();
            logSecure('Rate limiting service cleaned up');
        } catch (error) {
            logError(`Error during rate limiting cleanup: ${error}`);
        }

        // Clean up security resources
        try {
            cleanupSecurity();
            logSecure('Security resources cleaned up');
        } catch (error) {
            logError(`Error during security cleanup: ${error}`);
        }

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
 * Initialize and start the server with enhanced security and DoS protection
 */
export async function initializeServer(): Promise<http.Server> {
  logSecure("Initializing terminal server with enhanced security and DoS protection...");
  
  const server = await startServer();
  logSecure("Terminal server started successfully with enhanced security and DoS protection.");
  return server;
} 