import { WebSocketServer, WebSocket } from "ws";
import { createWebSocketStream } from "ws";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Duplex } from "node:stream";
import * as stream from "node:stream";
import * as crypto from "node:crypto";
import * as http from "node:http";
import * as jwt from "jsonwebtoken";
// Import Dockerode with type import for type checking
import type * as DockerodeTypes from "dockerode";
// For ES Module compatibility
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");
import process from 'node:process';

// Constants for Docker configuration
const DOCKER_IMAGE_NAME = process.env.DOCKER_IMAGE_NAME || 'ably-cli-sandbox';
const DOCKER_NETWORK_NAME = 'ably_cli_restricted';
// These domains will be used to restrict container network access in the network security implementation
const ALLOWED_DOMAINS = [
    'rest.ably.io',
    'realtime.ably.io',
    'api.ably.io',
    '*.ably.io',    // Wildcard for Ably subdomains
    'ably.com',     // Ably main domain
    '*.ably.com',   // Wildcard for Ably.com subdomains
    'npmjs.org',    // Allow npm registry for package installs
    'registry.npmjs.org',
];

// Simplified __dirname calculation
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Configuration ---
const _SESSION_TIMEOUT_MS = 1000 * 60 * 15; // 15 minutes
const DEFAULT_PORT = 8080;
const DEFAULT_MAX_SESSIONS = 50;
const AUTH_TIMEOUT_MS = 10_000; // 10 seconds
const SHUTDOWN_GRACE_PERIOD_MS = 10_000; // 10 seconds for graceful shutdown
// Add session timeout constants
const MAX_IDLE_TIME_MS = 10 * 60 * 1000;      // 10 minutes of inactivity
const MAX_SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes total

// Type definitions for Docker objects
type DockerContainer = DockerodeTypes.Container;
type DockerExec = DockerodeTypes.Exec;
type DockerExecCreateOptions = DockerodeTypes.ExecCreateOptions;

// Type for Docker event
interface DockerEvent {
  stream?: string;
  errorDetail?: { message: string };
  [key: string]: unknown;
}

type ClientSession = {
  ws: WebSocket;
  authenticated: boolean;
  timeoutId: NodeJS.Timeout;
  container?: DockerContainer;
  execInstance?: DockerExec;
  stdinStream?: stream.Duplex;
  stdoutStream?: stream.Duplex;
  sessionId: string;
  // Add activity tracking fields
  lastActivityTime: number;
  creationTime: number;
};

const sessions = new Map<string, ClientSession>();
const docker = new Dockerode();

function log(message: string): void {
    console.log(`[TerminalServer ${new Date().toISOString()}] ${message}`);
}

function logError(message: unknown): void {
    console.error(`[TerminalServerError ${new Date().toISOString()}] ${message instanceof Error ? message.message : String(message)}`);
    if (message instanceof Error && message.stack) {
        console.error(message.stack);
    }
}

// Function to clean up stale containers on startup
async function cleanupStaleContainers(): Promise<void> {
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
      try {
        const container = docker.getContainer(containerInfo.Id);
        log(`Removing stale container ${containerInfo.Id}...`);
        await container.remove({ force: true }); // Force remove
        log(`Removed stale container ${containerInfo.Id}.`);
      } catch (removeError: unknown) {
        // Ignore "no such container" errors, it might have been removed already
        if (
          !(
            removeError instanceof Error &&
            /no such container/i.test(removeError.message)
          )
        ) {
          logError(
            `Failed to remove stale container ${containerInfo.Id}: ${removeError instanceof Error ? removeError.message : String(removeError)}`,
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

async function ensureDockerImage(): Promise<void> {
  log(`Ensuring Docker image ${DOCKER_IMAGE_NAME} exists...`);
  try {
    const images = await docker.listImages({
      filters: { reference: [DOCKER_IMAGE_NAME] },
    });
    if (images.length === 0) {
      log(`Image ${DOCKER_IMAGE_NAME} not found.`);
      // Assume Dockerfile is in the root, two levels up from scripts/
      const dockerfilePath = path.resolve(__dirname, "../../", "Dockerfile");
      log(`Attempting to build Docker image from ${dockerfilePath}...`);
      // Note: Building via SDK requires careful stream handling for output
      // This is a simplified example; a real implementation needs better error/output handling.
      try {
        const stream = await docker.buildImage(
          { context: path.resolve(__dirname, "../../"), src: ["Dockerfile"] },
          { t: DOCKER_IMAGE_NAME },
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
        log(`Docker image ${DOCKER_IMAGE_NAME} built successfully.`);
      } catch (buildError) {
        logError(
          `Failed to build Docker image ${DOCKER_IMAGE_NAME}: ${buildError}`,
        );
        throw new Error(
          `Failed to automatically build Docker image "${DOCKER_IMAGE_NAME}". Please build it manually using "docker build -t ${DOCKER_IMAGE_NAME} ." in the project root.`,
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

async function createContainer(
  apiKey: string,
  accessToken: string,
  environmentVariables: Record<string, string> = {},
): Promise<DockerContainer> {
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

        const container = await docker.createContainer({
            AttachStderr: true,
            AttachStdin: true,
            AttachStdout: true,
            Env: env,
            HostConfig: {
                AutoRemove: true,
                // Security capabilities
                CapDrop: [
                    'ALL',                 // Drop all capabilities first
                    'NET_ADMIN',           // Cannot modify network settings
                    'NET_BIND_SERVICE',    // Cannot bind to privileged ports
                    'NET_RAW'              // Cannot use raw sockets
                ],
                SecurityOpt: [
                    'no-new-privileges',   // Prevents privilege escalation
                    'apparmor=unconfined', // Will be replaced with custom profile later
                    'seccomp=unconfined'   // Will be replaced with custom profile later
                ],
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
                    }
                ],
                // Add resource limits
                PidsLimit: 50, // Limit to 50 processes
                Memory: 256 * 1024 * 1024, // 256MB
                MemorySwap: 256 * 1024 * 1024, // Disable swap
                NanoCpus: 1 * 1000000000, // Limit to 1 CPU

                // Network security restrictions
                NetworkMode: 'ably_cli_restricted', // This network should be created at server startup
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
            Cmd: ["/bin/bash", "/scripts/restricted-shell.sh"]
        });
        log(`Container ${container.id} created with security hardening.`);
        return container;
    } catch (error) {
        logError(`Error creating container: ${error}`);
        throw error;
    }
}

// --- Session Management Functions (Restored & Modified) ---

function generateSessionId(): string {
  return crypto.randomUUID();
}

function isValidToken(token: string): boolean {
  if (!token || typeof token !== "string") {
    logError("Token validation failed: Token is missing or not a string.");
    return false;
  }

  // Basic JWT structure check (three parts separated by dots)
  if (token.split(".").length !== 3) {
    logError("Token validation failed: Invalid JWT structure.");
    return false;
  }

  try {
    // Decode the token without verification to check payload
    const decoded = jwt.decode(token);

    if (!decoded || typeof decoded !== "object") {
      logError("Token validation failed: Could not decode token payload.");
      return false;
    }

    // Check for expiration claim (exp)
    if (typeof decoded.exp !== "number") {
      logError(
        "Token validation failed: Missing or invalid expiration claim (exp).",
      );
      // Allow tokens without expiry for now, but log it.
      // Consider making this stricter if Control API tokens always have expiry.
      log("Warning: Provided token does not have a standard expiration claim.");
      return true; // Allow for now
    }

    // Check if the token is expired
    const nowInSeconds = Date.now() / 1000;
    if (decoded.exp < nowInSeconds) {
      logError("Token validation failed: Token has expired.");
      return false;
    }

    log(
      `Token structure and expiry check passed for token starting with: ${token.slice(0, 10)}... (Expiry: ${new Date(decoded.exp * 1000).toISOString()})`,
    );
    return true;
  } catch (error: unknown) {
    logError(
      `Token validation failed with unexpected decoding error: ${String(error)}`,
    );
    return false;
  }
}

async function terminateSession(
  sessionId: string,
  reason: string,
): Promise<void> {
  log(`Terminating session ${sessionId} due to: ${reason}`);
  const session = sessions.get(sessionId);
  if (!session) {
    log(`Session ${sessionId} not found in map, likely already terminated.`);
    return;
  }

  log(
    `Terminating session ${sessionId}. Current session count: ${sessions.size}`,
  );
  clearTimeout(session.timeoutId);
  sessions.delete(sessionId);
  log(
    `Session ${sessionId} deleted from map. New session count: ${sessions.size}`,
  );

  // Send termination message before closing
  try {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ reason, type: "session_end" }));
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
  if (session.stdinStream && !session.stdinStream.destroyed) {
    log(`Ending stdin stream for session ${sessionId}...`);
    session.stdinStream.end();
    session.stdinStream.destroy(); // Force destroy
  }

  // Stop the main Container (check session.container)
  if (session.container) {
    const container = session.container;
    try {
      log(`Stopping container ${container.id}...`);
      // Inspect might fail if already stopped/removed
      const containerInfo = await container.inspect().catch(() => null);
      if (
        containerInfo &&
        (containerInfo.State.Running || containerInfo.State.Paused)
      ) {
        await container.stop({ t: 2 }).catch((stopError: Error) => {
          logError(
            `Error stopping container ${container.id}: ${stopError instanceof Error ? stopError.message : String(stopError)}`,
          );
        });
        log(`Container ${container.id} stopped.`);
      } else {
        log(`Container ${container.id} already stopped or removed.`);
      }
    } catch (dockerError) {
      // Ignore "no such container" errors as it might have auto-removed
      if (
        !(
          dockerError instanceof Error &&
          /no such container/i.test(dockerError.message)
        )
      ) {
        logError(
          `Error during container stop/cleanup for session ${sessionId}: ${dockerError}`,
        );
      }
    }
  } else {
    log(
      `No container associated with session ${sessionId} during termination.`,
    );
  }

  log(`Session ${sessionId} resources released.`);
}

async function cleanupAllSessions(): Promise<void> {
  log("Cleaning up all active sessions...");
  const cleanupPromises = [...sessions.keys()].map((sessionId) =>
    terminateSession(sessionId, "Server shutting down."),
  );
  await Promise.allSettled(cleanupPromises);
  log("All session cleanup routines initiated.");
}

// Moved from startServer scope
const handleProtocols = (protocols: Set<string>, _request: unknown): string | false => {
    const firstProtocol = protocols.values().next().value;
    return firstProtocol === undefined ? false : firstProtocol;
};

// Moved from startServer scope
const verifyClient = (info: { origin: string; req: http.IncomingMessage; secure: boolean }, callback: (res: boolean, code?: number, message?: string, headers?: http.OutgoingHttpHeaders) => void) => {
    const origin = info.req.headers.origin || '*';
    log(`Client connecting from origin: ${origin}`);
    // Allow all connections for now, but could add origin checks here
    callback(true);
};

// --- WebSocket Server Setup (Restored & Modified) ---
async function startServer() {
    log('Starting WebSocket server...');
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
            log(`WebSocket server listening on port ${port}`);
            resolve();
        });
    });

    // Start session monitoring
    const sessionMonitoringInterval = startSessionMonitoring();

    wss.on("connection", (ws: WebSocket, _req: http.IncomingMessage) => {
        const sessionId = generateSessionId();
        log(`Client connected, assigned session ID: ${sessionId}`);

        if (sessions.size >= maxSessions) {
            log("Max session limit reached. Rejecting new connection.");
            ws.send("Server busy. Please try again later.\r\n");
            ws.close(1013, "Server busy");
            return;
        }

        // Create a minimal initial session state for tracking
        const initialSession: Partial<ClientSession> = {
             ws: ws,
             timeoutId: setTimeout(() => {
                 log(`Authentication timeout for session ${sessionId}.`);
                 // Ensure ws is still open before closing
                 if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                     ws.close(4008, 'Authentication timeout');
                 }
                 cleanupSession(sessionId); // Cleanup based on ID
             }, AUTH_TIMEOUT_MS),
             sessionId: sessionId,
             authenticated: false,
             lastActivityTime: Date.now(),
             creationTime: Date.now(),
        };

        // Store partial session - crucial for cleanup if auth fails
        sessions.set(sessionId, initialSession as ClientSession);

        // Handle the single authentication message
        ws.once('message', async (message: Buffer) => {
            // --- Authentication Phase ---
            try {
                let authPayload: { apiKey?: string; accessToken?: string; environmentVariables?: Record<string, string> };
                try {
                    authPayload = JSON.parse(message.toString());
                } catch {
                    logError(`[${sessionId}] Failed to parse auth message JSON.`);
                     if (ws.readyState === WebSocket.OPEN) {
                        ws.send('Invalid auth message format.\r\n');
                        ws.close(4008, 'Invalid auth format');
                    }
                    if (sessionId) cleanupSession(sessionId);
                    return;
                }

                // Combine token validation (placeholder) and credential check
                if (!authPayload.apiKey || !authPayload.accessToken || !isValidToken(authPayload.accessToken)) {
                    logError(`[${sessionId}] Invalid credentials or token received.`);
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send('Invalid token or credentials.\r\n');
                        ws.close(4001, 'Invalid token/credentials');
                    }
                    if (sessionId) cleanupSession(sessionId); // Cleanup partial session
                    return;
                }
                const { apiKey, accessToken, environmentVariables } = authPayload;

                // --- Auth Success -> Container Creation Phase ---
                log(`[${sessionId}] Authentication successful.`);

                // Clear the auth timeout since we've authenticated successfully
                clearTimeout(initialSession.timeoutId);

                let container: DockerContainer;
                try {
                   // Pass credentials to createContainer
                   container = await createContainer(apiKey, accessToken, environmentVariables || {});
                   log(`[${sessionId}] Container created successfully: ${container.id}`);

                   // Start the container before attempting to attach
                   await container.start();
                   log(`[${sessionId}] Container started successfully: ${container.id}`);
                } catch (containerError) {
                    logError(`[${sessionId}] Failed to create or start container: ${containerError instanceof Error ? containerError.message : String(containerError)}`);
                    if (ws.readyState === WebSocket.OPEN) {
                       ws.send('Failed to create session environment.\r\n');
                       ws.close(1011, 'Container creation failed');
                    }
                    if (sessionId) cleanupSession(sessionId); // Cleanup partial session
                    return;
                }

                // --- Create Full Session Object ---
                const fullSession: ClientSession = {
                    ...(initialSession as ClientSession), // Spread initial properties (ws, sessionId)
                    authenticated: true,
                    timeoutId: setTimeout(() => {}, 0), // Dummy timeout, immediately cleared
                    container: container,
                    // execInstance, stdinStream, stdoutStream added by attachToContainer
                };
                clearTimeout(fullSession.timeoutId); // Clear the dummy timeout
                sessions.set(sessionId, fullSession); // Update session map with full data
                log(`[${sessionId}] Full session object created.`);

                // --- Attachment Phase ---
                await attachToContainer(fullSession, ws);
                log(`[${sessionId}] Successfully attached to container.`);

                // --- Set up Main Message Handler ---
                // Only set this up *after* successful attachment
                ws.on('message', (msg) => handleMessage(fullSession, msg as Buffer));
                log(`[${sessionId}] Main message handler attached.`);

            } catch (error) {
                // Catch errors during the setup process (auth, container create, attach)
                logError(`[${sessionId}] Error during connection setup: ${error instanceof Error ? error.message : String(error)}`);
                 if (ws.readyState === WebSocket.OPEN) {
                     ws.send('Internal server error during setup.\r\n');
                     ws.close(1011, 'Setup error');
                 }
                 if (sessionId) cleanupSession(sessionId); // Cleanup whatever state exists
            }
        });

        // Handle top-level WebSocket close/error (covers cases before/during auth)
        ws.on('close', (code, reason) => {
            log(
                `[${sessionId}] WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`,
            );
            cleanupSession(sessionId);
        });
        ws.on('error', (err) => {
            logError(`[${sessionId}] WebSocket error: ${err.message}`);
            cleanupSession(sessionId); // Close and cleanup on error
        });
    });

    wss.on("error", (error: Error) => {
        logError(`WebSocket Server Error: ${error.message}`);
        // Consider more robust error handling? Shutdown?
    });

    // --- Graceful Shutdown ---
    let isShuttingDown = false;

    // A keep-alive interval to prevent the process from exiting
    const keepAliveInterval = setInterval(() => {
        // No-op, just keeps the event loop active
    }, 60000);

    const shutdown = async (signal: string) => {
        // Prevent multiple shutdown attempts
        if (isShuttingDown) {
            log(`Already shutting down, ignoring additional ${signal} signal`);
            return;
        }

        isShuttingDown = true;
        log(`Received ${signal}. Shutting down server...`);

        // Clear the intervals
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
        }
        if (sessionMonitoringInterval) {
            clearInterval(sessionMonitoringInterval);
        }

        await cleanupAllSessions();

        log('Closing WebSocket server...');

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
                    log('WebSocket server closed.');
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
                    log('HTTP server closed.');
                    resolve();
                });
            });

            // Clear the force exit timeout
            clearTimeout(forceExitTimeout);
            log('Shutdown complete.');

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

// Removed IIFE - using top-level await directly
let keepAliveInterval: NodeJS.Timeout;

// --- Server Initialization (using top-level await) ---

// Create secure network before server starts
try {
  await createSecureNetwork();
} catch (error) {
  logError(`Failed to create secure network: ${error}`);
  log('Continuing with default network configuration');
}

try {
  await startServer();
  log("Terminal server started successfully.");

  // Keep the Node.js process alive
  // This prevents the process from exiting after top-level code completes in ES modules
  keepAliveInterval = setInterval(() => {
    // No-op interval to keep event loop active
  }, 60000);

  // Handle Node.js debugger disconnection
  // Use type assertion for Node.js internal properties
  const nodeProcess = process as unknown as {
    _debugProcess?: (pid: number) => void;
    _debugEnd?: () => void;
    pid?: number;
  };

  if (nodeProcess._debugProcess && nodeProcess.pid) {
    process.on('SIGINT', () => {
      try {
        // Disable the debugger on first SIGINT to allow clean exit
        if (nodeProcess._debugEnd) {
          nodeProcess._debugEnd();
        }
      } catch {
        // Ignore errors
      }
    });
  }
} catch (error) {
  logError("Server failed unexpectedly:");
  logError(error);
  process.exit(1);
}

function pipeStreams(
  ws: WebSocket,
  containerStream: Duplex
): void {
  try {
    log('Setting up bidirectional piping between WebSocket and container stream');

    // Set up data handling from container to WebSocket
    let processingBuffer = Buffer.alloc(0);

    containerStream.on('data', (chunk: Buffer) => {
      processingBuffer = Buffer.concat([processingBuffer, chunk]);

      // Process complete frames
      while (processingBuffer.length >= 8) {
        const streamType = processingBuffer[0]; // 1=stdout, 2=stderr
        const payloadSize = processingBuffer.readUInt32BE(4);

        if (processingBuffer.length < 8 + payloadSize) {
          break; // Wait for more data
        }

        const payload = processingBuffer.slice(8, 8 + payloadSize);

        if (streamType === 1 || streamType === 2) {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(payload);
            }
          } catch (error) {
            logError(`Failed to send data: ${error instanceof Error ? error.message : String(error)}`);
            return;
          }
        }

        processingBuffer = processingBuffer.slice(8 + payloadSize);
      }
    });

    // NOTE: We no longer set up WebSocket message handling here
    // This is now handled by the main message handler to avoid duplication

  } catch (error) {
    logError(`Failed to pipe streams: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper to safely close WebSocket stream
function safeCloseWsStream(wsStream: Duplex) {
  if (wsStream && !wsStream.destroyed) {
    log("Closing WebSocket stream.");
    wsStream.destroy();
  }
}

// --- Container Attachment Logic ---

async function attachToContainer(session: ClientSession, ws: WebSocket): Promise<void> {
    const wsStream = createWebSocketStream(ws, {
        encoding: 'utf8',
        decodeStrings: false, // Don't convert strings to buffers
        defaultEncoding: 'utf8'
    });
    let containerStream: stream.Duplex | null = null;

    try {
        // Ensure container exists on session before proceeding
        if (!session.container) {
            throw new Error('Container not associated with session during attach');
        }

        // Check if the container is running before attempting to attach
        try {
            const containerInfo = await session.container.inspect();
            if (!containerInfo.State.Running) {
                // Container is not running, start it
                log(`Container ${session.container.id} is not running, attempting to start it...`);
                await session.container.start();
                log(`Container ${session.container.id} started successfully.`);
            }
        } catch (inspectError) {
            logError(`Error checking container state for ${session.container.id}: ${inspectError instanceof Error ? inspectError.message : String(inspectError)}`);
            throw new Error(`Failed to verify container state: ${inspectError instanceof Error ? inspectError.message : String(inspectError)}`);
        }

        log(`Attaching to container ${session.container.id} for session ${session.sessionId}`);

        const execOptions: DockerExecCreateOptions = {
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            // Use the restricted shell script explicitly
            Cmd: ['/bin/bash', '/scripts/restricted-shell.sh'],
            // Set critical environment variables for proper terminal behavior
            Env: [
                'TERM=xterm-256color',
                'COLORTERM=truecolor',
                'LANG=en_US.UTF-8',
                'LC_ALL=en_US.UTF-8',
                'LC_CTYPE=en_US.UTF-8',
                'CLICOLOR=1',
                'PS1=$ ', // Ensure prompt is set properly
                'LC_TERMINAL=xterm-256color',
                'LC_TERMINAL_VERSION=3.4.0'
            ],
            Tty: true,
        };
        const exec = await session.container.exec(execOptions);
        session.execInstance = exec; // Store exec instance

        const streamOpts = { hijack: true, stdin: true };
        containerStream = await exec.start(streamOpts) as stream.Duplex;

        // Assign streams to session *after* successful creation
        session.stdinStream = containerStream;
        session.stdoutStream = containerStream;

        log(`Attached stream to container ${session.container.id} for session ${session.sessionId}`);

        // Now pipe streams, containerStream is guaranteed to be Duplex here
        pipeStreams(ws, containerStream);

        // WebSocket stream event handlers
        wsStream.on('close', () => {
            log(`WebSocket stream closed for session ${session.sessionId}`);
            // containerStream is captured in this closure
            if (containerStream) safeCloseWsStream(containerStream);
            cleanupSession(session.sessionId);
        });
        wsStream.on('error', (err) => {
            logError(`WebSocket stream error for session ${session.sessionId}: ${err.message}`);
            if (containerStream) safeCloseWsStream(containerStream);
            cleanupSession(session.sessionId);
        });

        // Container stream event handlers
        containerStream.on('close', () => {
            log(`Container stream closed for session ${session.sessionId}`);
            safeCloseWsStream(wsStream); // wsStream is captured
            cleanupSession(session.sessionId);
        });
        containerStream.on('error', (err) => {
            logError(`Container stream error for session ${session.sessionId}: ${err.message}`);
            safeCloseWsStream(wsStream);
            cleanupSession(session.sessionId);
        });

    } catch (error) {
        logError(`Failed to attach to container for session ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
        safeCloseWsStream(wsStream);
        if (containerStream) {
            safeCloseWsStream(containerStream); // Close if created before error
        }
        cleanupSession(session.sessionId);
        if (ws.readyState === WebSocket.OPEN) {
           ws.close(1011, 'Failed to attach to container');
        }
    }
}

async function cleanupSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) {
    log(`Cleaning up session ${sessionId}`);
    clearTimeout(session.timeoutId);
    if (
      session.ws.readyState === WebSocket.OPEN ||
      session.ws.readyState === WebSocket.CONNECTING
    ) {
      session.ws.close(1000, "Session cleanup");
    }

    // Close streams safely
    if (session.stdinStream) safeCloseWsStream(session.stdinStream);
    // stdoutStream is the same as stdinStream in TTY mode, but check just in case
    // if (session.stdoutStream && session.stdoutStream !== session.stdinStream) safeCloseWsStream(session.stdoutStream);

    // Stop the container if it exists
    if (session.container) {
      try {
        const containerInfo = await session.container.inspect();
        if (
          containerInfo &&
          (containerInfo.State.Running || containerInfo.State.Paused)
        ) {
          log(`Attempting to stop container ${session.container.id}...`);
          // Added specific catch for stop error
          await session.container.stop({ t: 2 }).catch((stopError: Error) => {
            logError(
              `Error stopping container ${session.container?.id}: ${stopError.message}. Relying on AutoRemove.`,
            );
          });
          log(`Container ${session.container.id} stopped or stop attempted.`);
        }
      } catch (inspectError: unknown) {
        logError(
          `Error inspecting container ${session.container?.id} before stop: ${inspectError instanceof Error ? inspectError.message : String(inspectError)}. May already be stopped or removed.`,
        );
      }
    }

    sessions.delete(sessionId);
    log(`Session ${sessionId} removed. Active sessions: ${sessions.size}`);
  } else {
    log(`Attempted to clean up non-existent session ${sessionId}`);
  }
}

// --- Message Handlers ---

function handleExecResize(
  session: ClientSession,
  data: { cols: number; rows: number },
): void {
  if (session.execInstance) {
    const { cols, rows } = data;
    log(`Resizing TTY for session ${session.sessionId} to ${cols}x${rows}`);
    session.execInstance
      .resize({ h: rows, w: cols })
      .catch((resizeError: Error) => {
        logError(
          `Error resizing TTY for session ${session.sessionId}: ${resizeError.message}`,
        );
      });
  } else {
    logError(
      `Cannot resize TTY: execInstance not found for session ${session.sessionId}`,
    );
  }
}

function handleMessage(session: ClientSession, message: Buffer) {
    // Update last activity time
    session.lastActivityTime = Date.now();

    // Special handling for control commands like resize
    try {
        // First attempt to parse as JSON for control messages (resize)
        try {
            // Only try to parse larger messages (control messages are usually JSON)
            // Skip this for single characters & control keys
            if (message.length > 3) {
                const msgStr = message.toString('utf8');
                // Use a more specific type than 'any'
                let parsed: {
                    type?: string;
                    data?: unknown;
                    cols?: unknown;
                    rows?: unknown;
                    [key: string]: unknown;
                } | null = null;
                try {
                    parsed = JSON.parse(msgStr);
                } catch {
                    // Not JSON, continue with raw input handling
                }

                // Process JSON control messages (resize etc.)
                if (parsed && typeof parsed === 'object' && parsed !== null) {
                    if ('type' in parsed && parsed.type === 'resize') {
                        // Handle resize message in two possible formats
                        if ('data' in parsed && parsed.data && typeof parsed.data === 'object') {
                            // Format 1: { type: 'resize', data: { cols, rows } }
                            const resizeData = parsed.data as { cols?: unknown, rows?: unknown };
                            if (typeof resizeData.cols === 'number' && typeof resizeData.rows === 'number') {
                                handleExecResize(session, { cols: resizeData.cols, rows: resizeData.rows });
                                return;
                            }
                        } else if ('cols' in parsed && 'rows' in parsed) {
                            // Format 2: { type: 'resize', cols, rows }
                            const parsedObj = parsed as { cols?: unknown, rows?: unknown };
                            if (typeof parsedObj.cols === 'number' && typeof parsedObj.rows === 'number') {
                                handleExecResize(session, { cols: parsedObj.cols, rows: parsedObj.rows });
                                return;
                            }
                        }
                    } else if ('type' in parsed && parsed.type === 'data' && 'data' in parsed && // Data messages should be written directly to container
                        session.stdinStream && !session.stdinStream.destroyed) {
                            session.stdinStream.write(parsed.data as string | Buffer);
                            return;
                        }
                }
            }
        } catch {
            // Not JSON, continue with raw input handling
        }

        // Direct pass-through for raw input (both regular characters and control keys)
        if (session.stdinStream && !session.stdinStream.destroyed) {
            log(
                `Received data for session ${session.sessionId}, writing to stdinStream.`,
            );
            // Write the raw message data to the stream
            session.stdinStream.write(message);
        } else {
            // Only log if stream is not available (avoiding noise for normal keypresses)
            logError(`Cannot write input: container stream unavailable for session ${session.sessionId}`);
        }
    } catch (error) {
        logError(`Error processing input for session ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
        // Last resort fallback
        if (session.stdinStream && !session.stdinStream.destroyed) {
            try {
                // Attempt raw write as fallback
                session.stdinStream.write(message);
            } catch (writeError) {
                logError(`Failed to write input as fallback: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
            }
        }
    }
}

// Add session timeout monitoring
function startSessionMonitoring() {
  log("Starting session monitoring for timeouts...");

  const intervalId = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
      // Skip sessions that aren't fully authenticated yet
      if (!session.authenticated) continue;

      // Check for inactivity timeout
      if (now - session.lastActivityTime > MAX_IDLE_TIME_MS) {
        log(`Session ${sessionId} has been inactive for over ${MAX_IDLE_TIME_MS/60000} minutes`);
        terminateSession(sessionId, "Session timed out due to inactivity");
        continue;
      }

      // Check for max duration timeout
      if (now - session.creationTime > MAX_SESSION_DURATION_MS) {
        log(`Session ${sessionId} has reached maximum duration of ${MAX_SESSION_DURATION_MS/60000} minutes`);
        terminateSession(sessionId, "Maximum session duration reached");
      }
    }
  }, 30 * 1000); // Check every 30 seconds

  // Return the interval ID so it can be cleared during shutdown
  return intervalId;
}

/**
 * Create a Docker network with security restrictions
 */
async function createSecureNetwork(): Promise<void> {
    try {
        log('Setting up secure Docker network for containers...');

        // Check if network already exists
        const networks = await docker.listNetworks({
            filters: { name: [DOCKER_NETWORK_NAME] }
        });

        if (networks.length > 0) {
            log(`Network ${DOCKER_NETWORK_NAME} already exists, skipping creation`);
            return;
        }

        // Create a new network with restrictions
        await docker.createNetwork({
            Name: DOCKER_NETWORK_NAME,
            Driver: 'bridge',
            Internal: false, // Allow internet access but we'll restrict with rules
            EnableIPv6: false,
            Options: {
                'com.docker.network.bridge.enable_ip_masquerade': 'true',
                'com.docker.network.driver.mtu': '1500'
            },
            Labels: {
                'managed-by': 'ably-cli-terminal-server',
                'purpose': 'security-hardened-network'
            }
        });

        log(`Created secure network: ${DOCKER_NETWORK_NAME}`);

        // Note: Additional network filtering (like iptables rules or DNS filtering)
        // should be set up in the Docker host or through a custom entrypoint script
        // We'll document this requirement in Security-Hardening.md
    } catch (error) {
        logError(`Error creating secure network: ${error}`);
        // Continue even if network creation fails - we'll fall back to default
    }
}
