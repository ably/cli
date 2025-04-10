import WebSocket, { WebSocketServer, createWebSocketStream } from 'ws';
import type { WebSocket as WebSocketType } from 'ws';
import Docker from 'dockerode';
import { Duplex, Stream } from 'stream';
import * as path from 'path'; // Needed for path resolution
import { fileURLToPath } from 'url'; // Needed for __dirname in ESM

// Replicate __dirname behavior in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const DOCKER_IMAGE_NAME = 'ably-cli-sandbox';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_PORT = 8080;
const DEFAULT_MAX_SESSIONS = 5;
const AUTH_TIMEOUT_MS = 10000; // 10 seconds
const SHUTDOWN_GRACE_PERIOD_MS = 10000; // 10 seconds

interface Session {
  container: Docker.Container;
  ws: WebSocketType;
  timeoutId: NodeJS.Timeout;
  execStream: Duplex;
  execInstance: Docker.Exec;
  apiKey?: string;
  accessToken?: string;
  isAuthenticated: boolean;
}

const sessions: Map<string, Session> = new Map();
const docker = new Docker();

function log(message: string): void {
    console.log(`[TerminalServer] ${message}`);
}

function logError(message: unknown): void {
    console.error(`[TerminalServerError] ${message instanceof Error ? message.message : String(message)}`);
    if (message instanceof Error && message.stack) {
        console.error(message.stack);
    }
}

// Function to clean up stale containers on startup
async function cleanupStaleContainers(): Promise<void> {
    log('Checking for stale containers managed by this server...');
    try {
        const containers = await docker.listContainers({
            all: true, // List all containers (running and stopped)
            filters: JSON.stringify({
                label: ['managed-by=ably-cli-terminal-server']
            })
        });

        if (containers.length === 0) {
            log('No stale containers found.');
            return;
        }

        log(`Found ${containers.length} stale container(s). Attempting removal...`);
        const removalPromises = containers.map(async (containerInfo) => {
            try {
                const container = docker.getContainer(containerInfo.Id);
                log(`Removing stale container ${containerInfo.Id}...`);
                await container.remove({ force: true }); // Force remove
                log(`Removed stale container ${containerInfo.Id}.`);
            } catch (removeError: any) {
                // Ignore "no such container" errors, it might have been removed already
                if (!(removeError instanceof Error && /no such container/i.test(removeError.message))) {
                     logError(`Failed to remove stale container ${containerInfo.Id}: ${removeError.message || removeError}`);
                }
            }
        });

        await Promise.allSettled(removalPromises);
        log('Stale container cleanup finished.');

    } catch (error: any) {
        logError(`Error during stale container cleanup: ${error.message || error}`);
        // Continue starting the server even if cleanup fails
    }
}

async function ensureDockerImage(): Promise<void> {
    log(`Ensuring Docker image ${DOCKER_IMAGE_NAME} exists...`);
    try {
        const images = await docker.listImages({ filters: { reference: [DOCKER_IMAGE_NAME] } });
        if (images.length === 0) {
            log(`Image ${DOCKER_IMAGE_NAME} not found.`);
            // Assume Dockerfile is in the root, two levels up from scripts/
            const dockerfilePath = path.resolve(__dirname, '../../', 'Dockerfile');
            log(`Attempting to build Docker image from ${dockerfilePath}...`);
            // Note: Building via SDK requires careful stream handling for output
            // This is a simplified example; a real implementation needs better error/output handling.
             try {
                 const stream = await docker.buildImage({ context: path.resolve(__dirname, '../../'), src: ['Dockerfile'] }, { t: DOCKER_IMAGE_NAME });
                 await new Promise((resolve, reject) => {
                     docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res), (event) => {
                         if (event.stream) process.stdout.write(event.stream); // Log build output
                         if (event.errorDetail) logError(event.errorDetail.message);
                     });
                 });
                 log(`Docker image ${DOCKER_IMAGE_NAME} built successfully.`);
             } catch (buildError) {
                 logError(`Failed to build Docker image ${DOCKER_IMAGE_NAME}: ${buildError}`);
                 throw new Error(`Failed to automatically build Docker image "${DOCKER_IMAGE_NAME}". Please build it manually using "docker build -t ${DOCKER_IMAGE_NAME} ." in the project root.`);
             }
        } else {
            log(`Docker image ${DOCKER_IMAGE_NAME} found.`);
        }
    } catch (error) {
        logError(`Error checking/building Docker image: ${error}`);
        if (error instanceof Error && error.message.includes('Cannot connect to the Docker daemon')) {
            throw new Error('Failed to connect to Docker. Is the Docker daemon running and accessible?');
        }
        throw error;
    }
}

async function createContainer(
    apiKey: string, 
    accessToken: string, 
    environmentVariables: Record<string, string> = {}
): Promise<Docker.Container> {
    log('Creating Docker container (TTY Mode)...');
    try {
        // Create base environment variables with better defaults for terminal behavior
        const env = [
            // These environment variables are critical for proper terminal behavior
            'TERM=xterm-256color', 
            'COLORTERM=truecolor',
            'LANG=en_US.UTF-8',
            'LC_ALL=en_US.UTF-8',
            'LC_CTYPE=en_US.UTF-8',
            'CLICOLOR=1',
            `ABLY_API_KEY=${apiKey}`,
            `ABLY_ACCESS_TOKEN=${accessToken}`,
            // Simple PS1 prompt at container level
            'PS1=$ ',
            // Enable history
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
        
        const container = await docker.createContainer({
            Image: DOCKER_IMAGE_NAME,
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,          // Enable TTY mode
            OpenStdin: true,
            StdinOnce: false,
            StopSignal: 'SIGTERM',
            StopTimeout: 5,
            Labels: { // Add label for cleanup
                'managed-by': 'ably-cli-terminal-server'
            },
            HostConfig: {
                CapDrop: ['ALL'],
                SecurityOpt: ['no-new-privileges'],
                AutoRemove: true,
            },
            Env: env,
            // Don't override the container's default CMD
            // This will ensure the restricted-shell.sh is used as defined in the Dockerfile
        });
        log(`Container ${container.id} created.`);
        return container;
    } catch (error) {
        logError(`Error creating container: ${error}`);
        throw error;
    }
}

// --- Session Management Functions (Restored & Modified) ---

async function terminateSession(sessionId: string, reason: string): Promise<void> {
    log(`Terminating session ${sessionId} due to: ${reason}`);
    const session = sessions.get(sessionId);
    if (!session) {
        log(`Session ${sessionId} not found in map, likely already terminated.`);
        return;
    }

    log(`Terminating session ${sessionId}. Current session count: ${sessions.size}`);
    clearTimeout(session.timeoutId);
    sessions.delete(sessionId);
    log(`Session ${sessionId} deleted from map. New session count: ${sessions.size}`);

    // Send termination message before closing
    try {
        if (session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(JSON.stringify({ type: 'session_end', reason }));
        }
    } catch (sendError) {
        logError(`Error sending session_end message to ${sessionId}: ${sendError}`);
    }

    // Close WebSocket
    try {
        session.ws.close(1001, `Session terminated: ${reason}`.slice(0, 123));
    } catch (wsError) {
        logError(`Error closing WebSocket for session ${sessionId}: ${wsError}`);
    }

    // End the Exec Stream associated with the session
    if (session.execStream && !session.execStream.destroyed) {
        log(`Ending exec stream for session ${sessionId}...`);
        session.execStream.end();
        session.execStream.destroy(); // Force destroy
    }

    // Stop the main Container (AutoRemove should handle deletion)
    try {
        const container = session.container;
        log(`Stopping container ${sessionId}...`);
        // Inspect might fail if already stopped/removed
        const containerInfo = await container.inspect().catch(() => null); 
        if (containerInfo && (containerInfo.State.Running || containerInfo.State.Paused)) {
            await container.stop({ t: 2 }).catch(stopError => {
                logError(`Error stopping container ${sessionId}: ${stopError}. Relying on AutoRemove.`);
            });
            log(`Container ${sessionId} stopped.`);
        } else {
             log(`Container ${sessionId} already stopped or removed.`);
        }
    } catch (dockerError) {
        // Ignore "no such container" errors as it might have auto-removed
        if (!(dockerError instanceof Error && /no such container/i.test(dockerError.message))) {
            logError(`Error during container stop/cleanup for session ${sessionId}: ${dockerError}`);
        }
    }
    log(`Session ${sessionId} resources released.`);
}

async function cleanupAllSessions(): Promise<void> {
    log('Cleaning up all active sessions...');
    const cleanupPromises = Array.from(sessions.keys()).map(sessionId =>
        terminateSession(sessionId, 'Server shutting down.')
    );
    await Promise.allSettled(cleanupPromises);
    log('All session cleanup routines initiated.');
}

// --- Main Connection Handler using Exec --- 
async function handleAuth(message: Buffer, ws: WebSocketType, authTimeoutIdRef: { current: NodeJS.Timeout | null }) {
    if (ws.readyState !== WebSocket.OPEN) {
        logError('WebSocket is not open during handleAuth.');
        return;
    }

    // Clear the specific auth timeout for this connection
    if (authTimeoutIdRef.current) {
        clearTimeout(authTimeoutIdRef.current);
        authTimeoutIdRef.current = null;
    }

    let credentials: { type?: string; apiKey?: string; accessToken?: string; environmentVariables?: Record<string, string> } = {};
    try {
        credentials = JSON.parse(message.toString());
    } catch (e) {
        logError('Failed to parse auth message');
        ws.send('Invalid authentication message format.\r\n');
        ws.close(1008, 'Invalid auth message');
        return;
    }

    if (credentials.type !== 'auth' || !credentials.apiKey || !credentials.accessToken) {
        logError('Invalid auth message content');
        ws.send('Invalid authentication credentials provided.\r\n');
        ws.close(1008, 'Invalid credentials');
        return;
    }

    log('Client authenticated. Creating container and exec process...');
    let container: Docker.Container | null = null;
    let sessionId: string | null = null;
    let execStream: Duplex | null = null;
    let sessionTerminated = false;
    const cleanupAndTerminate = async (reason: string) => {
        if (sessionTerminated) return;
        sessionTerminated = true;
        log(`Triggering session termination for ${sessionId} due to: ${reason}`);
        if (sessionId) {
            await terminateSession(sessionId, reason); 
        }
        // Ensure WS is closed if session termination didn't catch it
        if(ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1011, reason);
        }
    };

    try {
        // 1. Create & Start Container
        container = await createContainer(credentials.apiKey!, credentials.accessToken!, credentials.environmentVariables || {}); 
        sessionId = container.id;
        await container.start();
        log(`Main container ${sessionId} started.`);

        // 2. Execute the restricted shell script directly via exec
        log(`Executing restricted shell in container ${sessionId}...`);
        const exec = await container.exec({
            // Explicitly run the restricted shell script
            Cmd: ['/bin/bash', '/scripts/restricted-shell.sh'], 
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,          // Use TTY for the exec process
            // Set critical environment variables FOR the restricted shell process
            Env: [
                'TERM=xterm-256color',
                'LANG=en_US.UTF-8',
                'LC_ALL=en_US.UTF-8',
                'LC_CTYPE=en_US.UTF-8',
                'CLICOLOR=1',
                'PS1=$ ' // Ensure prompt is set for this exec context
            ]
        });
        const execAttachOptions = { hijack: true, stdin: true }; // Keep hijack: true
        execStream = await exec.start(execAttachOptions) as Duplex; 
        log(`Attached to exec stream for ${sessionId} (restricted shell).`);

        // Resize the PTY to a default size initially
        try {
            await exec.resize({ h: 24, w: 80 });
            log(`Resized exec PTY for ${sessionId} to default 80x24.`);
        } catch (resizeError) {
            logError(`[${sessionId}] Failed to resize PTY initially: ${resizeError}`);
            // Continue connection even if resize fails initially
        }

        // 3. Create WS Stream in RAW BINARY mode
        // Omit stream options entirely to get default Buffer behavior
        const websocketStream = createWebSocketStream(ws); 

        // Removed: , { decodeStrings: true } or other encoding options

        // 4. Store Session
        const timeoutId = setTimeout(() => cleanupAndTerminate('Session timed out.'), SESSION_TIMEOUT_MS);
        const fullSession: Session = {
            container,
            ws,
            timeoutId,
            execStream, // This is the stream from the exec'd restricted shell
            execInstance: exec, // Store the exec instance here
            apiKey: credentials.apiKey,
            accessToken: credentials.accessToken,
            isAuthenticated: true,
        };
        sessions.set(sessionId, fullSession);
        log(`Session ${sessionId} created and stored.`);

        // 5. Manual Forwarding & Demultiplexing
        let processingBuffer = Buffer.alloc(0); // Buffer to handle partial stream frames
        execStream.on('data', (chunk: Buffer) => {
            processingBuffer = Buffer.concat([processingBuffer, chunk]);
            // --- DEBUGGING: Log incoming raw chunk and current buffer ---
            // log(`[DEBUG EXEC_CHUNK_RECV] Chunk(${chunk.length}): ${chunk.toString('hex')}`);
            // log(`[DEBUG EXEC_BUFFER_PRE] Buffer(${processingBuffer.length}): ${processingBuffer.toString('hex')}`);
            // --- END DEBUGGING ---

            while (processingBuffer.length >= 8) { // Need at least 8 bytes for the header
                const header = processingBuffer.slice(0, 8);
                const streamType = header[0]; // 1 for stdout, 2 for stderr
                const payloadSize = header.readUInt32BE(4); // Read size from bytes 4-7

                if (processingBuffer.length >= 8 + payloadSize) {
                    // We have the full frame (header + payload)
                    const payload = processingBuffer.slice(8, 8 + payloadSize);
                    // --- DEBUGGING: Log header, size, and extracted payload ---
                    // log(`[DEBUG DEMUX_FRAME] Header: ${header.toString('hex')}, Type: ${streamType}, Size: ${payloadSize}`);
                    // log(`[DEBUG DEMUX_PAYLOAD] Payload(${payload.length}): ${payload.toString('hex')}`);
                    // --- END DEBUGGING ---

                    // Only forward stdout (streamType 1) to the WebSocket for the terminal
                    if (streamType === 1) {
                        try {
                            if (!websocketStream.destroyed) {
                                // --- DEBUGGING: Log payload being written to websocketStream ---
                                // log(`[DEBUG WS_WRITE_DEMUXED] Buffer(${payload.length}): ${payload.toString('hex')}`);
                                // --- END DEBUGGING ---
                                websocketStream.write(payload);
                            }
                        } catch (err) {
                            const logSessionId = sessionId || 'unknown';
                            logError(`[${logSessionId}] WS stream write error after demux: ${err instanceof Error ? err.message : String(err)}`);
                            cleanupAndTerminate('WS stream write error');
                            return; // Stop processing if write fails
                        }
                    } else if (streamType === 2) {
                        // Optionally log stderr or handle it differently
                        // log(`[DEBUG DEMUX_STDERR] Payload(${payload.length}): ${payload.toString('utf-8')}`);
                    } else {
                        // log(`[DEBUG DEMUX_UNKNOWN] Unknown stream type: ${streamType}`);
                    }

                    // Remove the processed frame (header + payload) from the buffer
                    processingBuffer = processingBuffer.slice(8 + payloadSize);
                    // log(`[DEBUG EXEC_BUFFER_POST] Buffer(${processingBuffer.length}): ${processingBuffer.toString('hex')}`);

                } else {
                    // Not enough data in buffer for the full payload yet, break and wait for more data
                    // log(`[DEBUG DEMUX_WAIT] Need ${8 + payloadSize} bytes, have ${processingBuffer.length}. Waiting for more data.`);
                    break;
                }
            }
        });

        websocketStream.on('data', (chunk: Buffer | string) => {
            // Find the current session ID (assuming it's available in the closure)
            // NOTE: sessionId might be null briefly before session is fully stored.
            // It's safer to look up the session by the WebSocket instance if needed,
            // but for simplicity, we assume sessionId is correctly captured here.
            const currentSessionId = sessionId; 
            if (!currentSessionId) { 
                logError('Resize handler: Could not determine session ID.');
                return; 
            }

            try {
                let parsedMessage: any;
                let isResizeMessage = false;

                // Check if it's a resize message
                if (Buffer.isBuffer(chunk) || typeof chunk === 'string') {
                    try {
                        parsedMessage = JSON.parse(chunk.toString());
                        if (parsedMessage && parsedMessage.type === 'resize' && 
                            typeof parsedMessage.cols === 'number' && typeof parsedMessage.rows === 'number') 
                        {
                            isResizeMessage = true;
                        }
                    } catch (e) {
                        // Not a JSON message, treat as regular data
                    }
                }

                if (isResizeMessage) {
                    const { cols, rows } = parsedMessage;
                    // Ensure cols and rows are positive integers
                    if (cols > 0 && rows > 0) {
                        log(`[${currentSessionId}] Received resize request: ${cols}x${rows}`);
                        // Find the session and its exec instance
                        const currentSession = sessions.get(currentSessionId);
                        if (currentSession && currentSession.execInstance) {
                            // Resize the *original* exec instance
                            currentSession.execInstance.resize({ h: rows, w: cols })
                                .catch(resizeError => {
                                    logError(`[${currentSessionId}] Failed to resize PTY on request: ${resizeError}`);
                                });
                        } else {
                            logError(`[${currentSessionId}] Could not find session or execInstance to resize PTY.`);
                        }
                    } else {
                        logError(`[${currentSessionId}] Received invalid dimensions in resize request: ${cols}x${rows}`);
                    }
                } else {
                    // Not a resize message, forward to the container
                    const currentSession = sessions.get(currentSessionId);
                    if (currentSession && currentSession.execStream && !currentSession.execStream.destroyed) {
                        currentSession.execStream.write(chunk);
                    } else {
                        // Log if forwarding fails (e.g., stream closed before message processed)
                        // Avoid terminating session here, let other handlers manage stream closure.
                        log(`[${currentSessionId}] Could not forward non-resize data, stream unavailable.`);
                    }
                }
            } catch (err) {
                 // Use the captured sessionId for consistent logging
                 logError(`[${currentSessionId}] Error processing incoming websocket data: ${err}`);
                 // Terminate the session on general processing errors within this handler
                 cleanupAndTerminate('WebSocket data processing error');
            }
        });
        
        // Error and Close handlers for BOTH streams
        execStream.on('error', (err: Error) => {
             logError(`[${sessionId}] Exec Stream Error: ${err.message}`);
             if (!websocketStream.destroyed) websocketStream.destroy(err);
             cleanupAndTerminate('Exec stream error.'); 
         });
        execStream.on('close', () => {
             log(`[${sessionId}] Exec Stream Closed.`);
             if (!websocketStream.destroyed) websocketStream.destroy();
             cleanupAndTerminate('Container process exited.');
        });
        websocketStream.on('error', (err: Error) => {
             logError(`[${sessionId}] WebSocket Stream Error: ${err.message}`);
             if (!execStream!.destroyed) execStream!.destroy(err);
             cleanupAndTerminate('WebSocket stream error.');
        });
        websocketStream.on('close', () => {
             log(`[${sessionId}] WebSocket Stream Closed (Client disconnected).`);
             if (!execStream!.destroyed) execStream!.destroy();
             cleanupAndTerminate('Client disconnected.');
        });

        log(`[${sessionId}] Manual forwarding established.`);

        // 6. Send confirmation
        ws.send('Authentication successful. Session established.\r\n');
        
        // 7. No explicit startup command needed here, handled by restricted-shell.sh welcome message

    } catch (error) {
        logError(`Failed to create session after auth: ${error}`);
        await cleanupAndTerminate(`Session setup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// --- WebSocket Server Setup (Restored & Modified) --- 
async function startServer() {
    const port = DEFAULT_PORT; // Simplified for now
    const maxSessions = DEFAULT_MAX_SESSIONS;
    log(`Starting Terminal Server on port ${port}, max sessions: ${maxSessions}...`);

    // Clean up stale containers before starting
    await cleanupStaleContainers();

    try {
        await ensureDockerImage();
    } catch (error) {
        logError(error);
        process.exit(1);
    }

    const wss = new WebSocketServer({ 
        port: port,
        // Add CORS support for the HTTP upgrade request
        handleProtocols: (protocols, request) => {
            return Array.isArray(protocols) && protocols.length > 0 ? protocols[0] : '';
        },
        verifyClient: (info, callback) => {
            // Get the origin from the request
            const origin = info.req.headers.origin || '*';
            log(`Client connecting from origin: ${origin} - allowing connection`);
            
            // Set CORS headers on the upgrade response
            if (info.req.headers.origin) {
                info.req.headers['Access-Control-Allow-Origin'] = '*';
                info.req.headers['Access-Control-Allow-Headers'] = 'Authorization, X-Requested-With, Content-Type';
                info.req.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
                info.req.headers['Access-Control-Allow-Credentials'] = 'true';
            }
            
            // Always allow the connection
            callback(true);
        }
    });

    // Handle HTTP OPTIONS requests (preflight) separately
    wss.on('headers', (headers, request) => {
        // Add CORS headers to all responses
        headers.push('Access-Control-Allow-Origin: *');
        headers.push('Access-Control-Allow-Headers: Authorization, X-Requested-With, Content-Type');
        headers.push('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        headers.push('Access-Control-Allow-Credentials: true');
    });

    wss.on('connection', async (ws: WebSocketType, request) => {
        if (sessions.size >= maxSessions) {
            log('Max session limit reached. Rejecting new connection.');
            ws.send('Server busy. Please try again later.\r\n');
            ws.close(1013, 'Server busy'); // Use appropriate close code
            return;
        }

        log('Client connected. Waiting for authentication...');

        // Use a ref object to pass the timeout ID to handleAuth
        const authTimeoutIdRef = { current: null as NodeJS.Timeout | null };
        authTimeoutIdRef.current = setTimeout(() => {
             log('Authentication timeout.');
             authTimeoutIdRef.current = null; // Clear ref
             if(ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.send('Authentication timeout.\r\n');
                ws.close(1008, 'Authentication timeout');
             }
        }, AUTH_TIMEOUT_MS);

        const authHandler = (message: Buffer) => {
            // Pass the ref object so handleAuth can clear the timer
            handleAuth(message, ws, authTimeoutIdRef).catch(err => {
                logError(`Unhandled error during handleAuth: ${err}`);
                // Clear timer if handleAuth crashes before doing so
                if (authTimeoutIdRef.current) clearTimeout(authTimeoutIdRef.current);
                if(ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                    ws.close(1011, 'Internal Server Error');
                }
            });
        };

        ws.once('message', authHandler);

        // Outer error/close handlers - find session by ws and terminate
        ws.on('close', (code, reason) => {
            log(`WebSocket Closed (Outer Handler). Code: ${code}, Reason: ${reason.toString('utf-8')}`);
            // Find session associated with this WebSocket
            let sessionIdToTerminate: string | null = null;
            for (const [id, session] of sessions.entries()) {
                if (session.ws === ws) {
                    sessionIdToTerminate = id;
                    break;
                }
            }
            if (sessionIdToTerminate) {
                // Terminate the found session
                terminateSession(sessionIdToTerminate, 'WebSocket connection closed.');
            } else {
                log('Outer WS close handler: No active session found for this WS.');
            }
            // Clear auth timeout if it's still pending
            if (authTimeoutIdRef.current) {
                clearTimeout(authTimeoutIdRef.current);
                authTimeoutIdRef.current = null;
            }
        });
        ws.on('error', (err) => {
            logError(`WebSocket Error (Outer Handler): ${err.message}`);
            // Find session associated with this WebSocket
            let sessionIdToTerminate: string | null = null;
            for (const [id, session] of sessions.entries()) {
                if (session.ws === ws) {
                    sessionIdToTerminate = id;
                    break;
                }
            }
            if (sessionIdToTerminate) {
                // Terminate the found session
                terminateSession(sessionIdToTerminate, 'WebSocket connection error.');
            } else {
                 logError('Outer WS error handler: No active session found for this WS.');
                 // Attempt to close if possible
                 try { ws.close(1011, 'WS Error'); } catch(e) {/* ignore */}
            }
            // Clear auth timeout if it's still pending
            if (authTimeoutIdRef.current) {
                clearTimeout(authTimeoutIdRef.current);
                authTimeoutIdRef.current = null;
            }
        });
    });

    wss.on('error', (error: Error) => {
        logError(`WebSocket Server Error: ${error.message}`);
        // Consider more robust error handling? Shutdown?
    });

    log(`WebSocket server listening on port ${port}`);

    // --- Graceful Shutdown --- 
    const shutdown = async (signal: string) => {
        log(`Received ${signal}. Shutting down server...`);
        await cleanupAllSessions();
        log('Closing WebSocket server...');
        wss.close((err) => {
            if (err) {
                logError(`Error closing WebSocket server: ${err}`);
            }
            log('WebSocket server closed.');
            log('Shutdown complete.');
            process.exit(0);
        });
        // Force exit if cleanup takes too long
        setTimeout(() => {
            logError('Shutdown timed out. Forcing exit.');
            process.exit(1);
        }, SHUTDOWN_GRACE_PERIOD_MS);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// --- Main Execution Block --- 
(async () => {
    log("Starting Terminal Server...");
    try {
        await startServer(); // Run the actual server now
    } catch (err) {
        logError('Server failed unexpectedly:');
        logError(err);
        process.exit(1);
    }
})();

