import { WebSocketServer, WebSocket } from "ws";
import { createWebSocketStream } from "ws";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Duplex } from "node:stream";
import * as stream from "node:stream";
import * as crypto from "node:crypto";
import * as http from "node:http";
import * as jwt from "jsonwebtoken";
import { execSync } from "node:child_process";
// Import Dockerode with type import for type checking
import type * as DockerodeTypes from "dockerode";
// For ES Module compatibility
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");
import process from 'node:process';
import * as fs from "node:fs"; // Import fs
import { ChildProcess } from "node:child_process";

// Constants for Docker configuration
const DOCKER_IMAGE_NAME = process.env.DOCKER_IMAGE_NAME || 'ably-cli-sandbox';
const DOCKER_NETWORK_NAME = 'ably_cli_restricted';
// Note: Allowed domains are defined in docker/network-security.sh and applied at container runtime

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

// Define the message structure for server-to-client status updates
type ServerStatusMessage = {
  type: "status";
  payload: "connecting" | "connected" | "disconnected" | "error";
  reason?: string;
  details?: unknown;
};

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
  // Add flag to track if attachment is in progress
  isAttaching: boolean;
};

// Variable to store AppArmor profile status - checked once on startup
let isAppArmorProfileLoaded = false;

const sessions = new Map<string, ClientSession>();
const docker = new Dockerode();

// Read seccomp profile content once on startup
const projectRoot = process.cwd(); // Get project root
const seccompProfilePath = path.resolve(projectRoot, 'docker/seccomp-profile.json');
let seccompProfileContent: string;
try {
  const seccompProfileContentRaw = fs.readFileSync(seccompProfilePath, 'utf8');
  seccompProfileContent = JSON.stringify(JSON.parse(seccompProfileContentRaw));
  log("Seccomp profile loaded successfully.");
} catch (error) {
  logError(`Failed to load or parse seccomp profile at ${seccompProfilePath}: ${error}`);
  seccompProfileContent = '{}';
}

// Shared variables
let terminalServerProcess: ChildProcess | undefined;
let webServerProcess: ChildProcess | undefined;

function log(message: string): void {
    console.log(`[TerminalServer ${new Date().toISOString()}] ${message}`);
}

function logError(message: unknown): void {
    console.error(`[TerminalServerError ${new Date().toISOString()}] ${message instanceof Error ? message.message : String(message)}`);
    if (message instanceof Error && message.stack) {
        console.error(message.stack);
    }
}

// Function to check AppArmor profile status ONCE on startup
function checkAppArmorProfileStatus(): void {
  try {
      log("Checking AppArmor profile status...");
      // Check if our AppArmor profile exists in the standard location
      const appArmorCheck = execSync('apparmor_parser -QT /etc/apparmor.d/docker-ably-cli-sandbox 2>/dev/null || echo "notfound"').toString().trim();

      if (appArmorCheck === 'notfound') {
          log('AppArmor profile not found or not loaded, will use unconfined.');
          isAppArmorProfileLoaded = false;
      } else {
          log('AppArmor profile found and seems loaded.');
          isAppArmorProfileLoaded = true;
      }
  } catch (appArmorError) {
      log(`AppArmor check command failed, assuming profile not loaded: ${appArmorError instanceof Error ? appArmorError.message : String(appArmorError)}`);
      isAppArmorProfileLoaded = false;
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
    // First check if the image exists
    const images = await docker.listImages({
      filters: { reference: [DOCKER_IMAGE_NAME] },
    });

    if (images.length === 0) {
      log(`Image ${DOCKER_IMAGE_NAME} not found. Will attempt to build it.`);

      // Get the location of the Dockerfile - should be in project root
      const dockerfilePath = path.resolve(__dirname, "../../", "Dockerfile");

      // Check if Dockerfile exists
      if (!fs.existsSync(dockerfilePath)) {
        throw new Error(`Dockerfile not found at ${dockerfilePath}`);
      }

      log(`Building Docker image ${DOCKER_IMAGE_NAME} from ${dockerfilePath}...`);

      // Try building via Docker CLI first (more reliable than SDK)
      try {
        log(`Building with docker command: docker build -t ${DOCKER_IMAGE_NAME} ${path.resolve(__dirname, "../../")}`);
        const output = execSync(`docker build -t ${DOCKER_IMAGE_NAME} ${path.resolve(__dirname, "../../")}`, {
          stdio: ['ignore', 'pipe', 'pipe']
        }).toString();
        log(`Docker build output: ${output.slice(0, 200)}...`);
        log(`Docker image ${DOCKER_IMAGE_NAME} built successfully using CLI.`);
        return;
      } catch (cliError) {
        log(`Failed to build using Docker CLI: ${cliError}. Falling back to Docker SDK.`);
      }

      // Fallback to Docker SDK if CLI approach fails
      try {
        log("Attempting to build image using Docker SDK...");
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

        log(`Docker image ${DOCKER_IMAGE_NAME} built successfully using SDK.`);
      } catch (buildError) {
        logError(`Failed to build Docker image ${DOCKER_IMAGE_NAME}: ${buildError}`);
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

async function createContainer(
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

    // Configure security options using file content
    const securityOpt = [
      'no-new-privileges',
      `seccomp=${seccompProfileContent}` // Pass profile content directly
    ];

    // Use the pre-checked AppArmor status
    if (isAppArmorProfileLoaded) {
      log('Applying AppArmor profile: ably-cli-sandbox-profile');
      securityOpt.push('apparmor=ably-cli-sandbox-profile');
    } else {
      log('Applying AppArmor profile: unconfined');
      securityOpt.push('apparmor=unconfined');
    }

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
    log(`- AppArmor profile: ${isAppArmorProfileLoaded ? 'yes' : 'no'}`);

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
  graceful = true,
  code = 1000,
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    log(`Session ${sessionId} not found for termination.`);
    return;
  }

  log(`Terminating session ${sessionId}. Reason: ${reason}`);
  clearTimeout(session.timeoutId);

  // Send disconnected status message
  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    try {
      const statusMsg: ServerStatusMessage = { type: "status", payload: "disconnected", reason };
      session.ws.send(JSON.stringify(statusMsg));
      log(`Sent 'disconnected' status to session ${sessionId}`);
    } catch (sendError) {
      logError(`Error sending 'disconnected' status to ${sessionId}: ${sendError}`);
    }
  }

  if (graceful && session.ws && session.ws.readyState === WebSocket.OPEN) {
    session.ws.close(code, reason.slice(0, 120)); // Ensure reason is not too long
  }

  // Detach and cleanup streams
  if (session.stdinStream) {
    session.stdinStream.end();
    session.stdinStream.destroy(); // Ensure stream is fully destroyed
    log(`stdinStream for session ${sessionId} ended and destroyed.`);
  }
  if (session.stdoutStream) {
    // session.stdoutStream.end(); // stdoutStream is readable, typically doesn't need end()
    session.stdoutStream.destroy(); // Ensure stream is fully destroyed
    log(`stdoutStream for session ${sessionId} destroyed.`);
  }

  // Stop and remove the container if it exists
  if (session.container) {
    log(`Stopping and removing container for session ${sessionId}...`);
    try {
      await session.container.stop({ t: 5 }); // Allow 5 seconds to stop
      log(`Container for session ${sessionId} stopped.`);
    } catch (stopError: unknown) {
      // Ignore "container already stopped" or "no such container" errors
      if (
        !(
          stopError instanceof Error &&
          (/already stopped/i.test(stopError.message) ||
            /no such container/i.test(stopError.message))
        )
      ) {
        logError(
          `Error stopping container for session ${sessionId}: ${stopError instanceof Error ? stopError.message : String(stopError)}`,
        );
      }
    }
    try {
      await session.container.remove();
      log(`Container for session ${sessionId} removed.`);
    } catch (removeError: unknown) {
      // Ignore "no such container" errors
      if (
        !(
          removeError instanceof Error &&
          /no such container/i.test(removeError.message)
        )
      ) {
        logError(
          `Error removing container for session ${sessionId}: ${removeError instanceof Error ? removeError.message : String(removeError)}`,
        );
      }
    }
  }

  sessions.delete(sessionId);
  log(`Session ${sessionId} terminated and removed. Active sessions: ${sessions.size}`);

  // If not a graceful shutdown (e.g., an error), ensure WebSocket is forcefully closed
  if (!graceful && session.ws && session.ws.readyState !== WebSocket.CLOSED) {
    session.ws.terminate();
    log(`WebSocket connection for session ${sessionId} forcefully terminated.`);
  }
}

async function cleanupAllSessions(): Promise<void> {
  log("Cleaning up all active sessions...");
  const cleanupPromises = [...sessions.keys()].map((sessionId) =>
    terminateSession(sessionId, "Server shutting down."),
  );
  await Promise.allSettled(cleanupPromises);

  // Properly wait for processes to terminate
  if (terminalServerProcess || webServerProcess) {
    await Promise.allSettled([
      new Promise(r => terminalServerProcess?.once('exit', r)),
      new Promise(r => webServerProcess?.once('exit', r)),
    ]);
  }
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
    checkAppArmorProfileStatus(); // Check AppArmor status ONCE here

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

    // A keep-alive interval to prevent the process from exiting
    const keepAliveInterval = setInterval(() => {
        // No-op, just keeps the event loop active
    }, 60000);

    wss.on("connection", (ws: WebSocket, _req: http.IncomingMessage) => {
        const sessionId = generateSessionId();
        log(`Client connected, assigned session ID: ${sessionId}`);

        // Immediately send a "connecting" status message
        try {
          const connectingMsg: ServerStatusMessage = { type: "status", payload: "connecting" };
          ws.send(JSON.stringify(connectingMsg));
          log(`Sent 'connecting' status to new session ${sessionId}`);
        } catch (sendError) {
          logError(`Error sending 'connecting' status to ${sessionId}: ${sendError}`);
          // If we can't send 'connecting', close the connection
          ws.close(1011, "Failed to send initial status");
          // Note: No session object to cleanup here yet if this fails immediately.
          return;
        }

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
             isAttaching: false,
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
                   container = await createContainer(apiKey, accessToken, environmentVariables || {}, sessionId);
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
                    isAttaching: false, // Will be set to true by attachToContainer
                    timeoutId: setTimeout(() => {}, 0), // Dummy timeout, immediately cleared
                    container: container,
                    // execInstance, stdinStream, stdoutStream added by attachToContainer
                };
                clearTimeout(fullSession.timeoutId); // Clear the dummy timeout
                sessions.set(sessionId, fullSession); // Update session map with full data
                log(`[${sessionId}] Full session object created.`);

                // --- Attachment Phase ---
                try {
                    // Wait for attachment to complete before setting up message handlers
                    await attachToContainer(fullSession, ws);
                    log(`[${sessionId}] Successfully attached to container.`);

                    // --- Set up Main Message Handler ---
                    // Only set up *after* successful attachment
                    ws.on('message', (msg) => handleMessage(fullSession, msg as Buffer));
                    log(`[${sessionId}] Main message handler attached.`);
                } catch (attachError) {
                    // Attachment failed, but we'll let the error handling in attachToContainer handle it
                    logError(`[${sessionId}] Attachment error: ${String(attachError)}`);
                    // Don't attempt to cleanup here as attachToContainer will have done it already
                }
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
    let firstChunkReceived = false; // Flag to log only the first chunk

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

        if (!firstChunkReceived) {
          // Keep first chunk logging as it's useful for debugging
          log(`First chunk received from container (type ${streamType}, size ${payloadSize})`);
          firstChunkReceived = true;
        }

        if (streamType === 1 || streamType === 2) {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              // Remove verbose logging of every payload sent
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
    if (!session.container) {
        logError(`Container not found for session ${session.sessionId} during attach.`);
        try {
            const errorMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Internal server error: Container not found" };
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(errorMsg));
        } catch { logError('Failed to send error status for container not found'); }
        await terminateSession(session.sessionId, "Container not found", false);
        return;
    }

    // Mark that attachment is starting
    session.isAttaching = true;

    const wsStream = createWebSocketStream(ws, {
        encoding: 'utf8',
        decodeStrings: false, // Don't convert strings to buffers
        defaultEncoding: 'utf8'
    });
    let containerStream: stream.Duplex | null = null;

    try {
        // Ensure container exists on session before proceeding
        if (!session.container) {
            session.isAttaching = false; // Clear flag on error
            throw new Error('Container not associated with session during attach');
        }

        // Add a minimal delay just in case, but rely on container being started correctly
        log(`Waiting briefly for container ${session.container.id}...`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Reduced delay

        log(`Attaching to container ${session.container.id} for session ${session.sessionId}`);

        // Optional: Final quick state check before exec
        try {
            const containerInfo = await session.container.inspect();
            if (!containerInfo.State.Running) { // Only check for Running now
                session.isAttaching = false;
                throw new Error(`Container ${session.container.id} is not Running. State: ${containerInfo.State.Status}`);
            }
        } catch (inspectError) {
            session.isAttaching = false;
            throw new Error(`Failed to inspect container state before attach: ${inspectError instanceof Error ? inspectError.message : String(inspectError)}`);
        }

        const execOptions: DockerExecCreateOptions = {
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Cmd: ['/bin/bash', '/scripts/restricted-shell.sh'],
            Env: [
                'TERM=xterm-256color',
                'COLORTERM=truecolor',
                'LANG=en_US.UTF-8',
                'LC_ALL=en_US.UTF-8',
                'LC_CTYPE=en_US.UTF-8',
                'CLICOLOR=1',
                'PS1=$ ',
                'LC_TERMINAL=xterm-256color',
                'LC_TERMINAL_VERSION=3.4.0'
            ],
            Tty: true,
        };

        // Attempt to execute the command inside the container
        const exec = await session.container.exec(execOptions);
        session.execInstance = exec;

        const streamOpts = { hijack: true, stdin: true };
        containerStream = await exec.start(streamOpts) as stream.Duplex;

        session.stdinStream = containerStream;
        session.stdoutStream = containerStream;

        log(`Attached stream to container ${session.container.id} for session ${session.sessionId}`);
        session.isAttaching = false;

        // Send "connected" status message AFTER streams are attached but BEFORE piping starts
        try {
            if (ws.readyState === WebSocket.OPEN) {
                const connectedMsg: ServerStatusMessage = { type: "status", payload: "connected" };
                log(`[attachToContainer] Sending 'connected' status to session ${session.sessionId}`); // Log before sending
                ws.send(JSON.stringify(connectedMsg));
            }
        } catch (sendError) {
            logError(`Error sending 'connected' status to ${session.sessionId}: ${sendError}`);
            await terminateSession(session.sessionId, "Failed to confirm connection status", false);
            return;
        }
        
        // Add a small delay before piping to allow client to process "connected" status
        await new Promise(resolve => setTimeout(resolve, 50)); 

        // Now start piping after sending connected status and adding delay
        pipeStreams(ws, containerStream);

        ws.on("close", async (code, reason) => {
            log(
                `WebSocket closed for session ${session.sessionId}. Code: ${code}, Reason: ${reason && reason.length > 0 ? reason.toString() : "No reason given"}. isAttaching: ${session.isAttaching}`,
            );
            // If attachment was in progress and ws closed, it's an abrupt client disconnect
            if (session.isAttaching) {
                log(`Client ${session.sessionId} disconnected during attachment process.`);
            }
            // Ensure session is cleaned up. terminateSession handles sending 'disconnected' if ws is still open,
            // but here ws is already closing/closed.
            await cleanupSession(session.sessionId); // Changed from terminateSession to cleanupSession
        });

        ws.on("error", async (error: Error) => {
            logError(`WebSocket stream error for session ${session.sessionId}: ${error.message}`);
            if (containerStream) safeCloseWsStream(containerStream);
            cleanupSession(session.sessionId);
        });

        containerStream.on('close', () => {
            log(`Container stream closed for session ${session.sessionId}`);
            safeCloseWsStream(wsStream);
            cleanupSession(session.sessionId);
        });
        containerStream.on('error', (err) => {
            logError(`Container stream error for session ${session.sessionId}: ${err.message}`);
            safeCloseWsStream(wsStream);
            cleanupSession(session.sessionId);
        });

    } catch (error) {
        session.isAttaching = false;
        logError(`Failed to attach to container for session ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
        safeCloseWsStream(wsStream);
        if (containerStream) {
            safeCloseWsStream(containerStream);
        }
        cleanupSession(session.sessionId);
        if (ws.readyState === WebSocket.OPEN) {
           ws.close(1011, 'Failed to attach to container');
        }
    }
}

async function cleanupSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }
  log(`Cleaning up session ${sessionId}...`);

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
    } catch {
      // logError(`Error sending 'disconnected' status during cleanup for ${sessionId}: ${sendError}`);
      // Suppress error logging here to avoid noise if ws is closing.
    }
  }

  clearTimeout(session.timeoutId);

  if (session.stdinStream) {
    session.stdinStream.end();
    session.stdinStream.destroy(); // Ensure stream is fully destroyed
    log(`stdinStream for session ${sessionId} ended and destroyed.`);
  }
  if (session.stdoutStream) {
    // session.stdoutStream.end(); // stdoutStream is readable, typically doesn't need end()
    session.stdoutStream.destroy(); // Ensure stream is fully destroyed
    log(`stdoutStream for session ${sessionId} destroyed during cleanup.`);
  }

  // Remove container if it exists and isn't already being removed
  if (session.container) {
    try {
      log(`Removing container ${session.container.id}...`);
      await session.container.remove({ force: true }).catch((removeError: Error) => {
        log(`Note: Error removing container ${session.container?.id}: ${removeError.message}.`);
      });
      log(`Container ${session.container.id} removed.`);
    } catch (removeError) {
      log(`Note: Error during container removal: ${removeError}.`);
    }
  }

  sessions.delete(sessionId);
  log(`Session ${sessionId} removed. Active sessions: ${sessions.size}`);
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
            // Remove verbose logging for every keystroke
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
function startSessionMonitoring(): NodeJS.Timeout {
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

/**
 * Check if the specified Docker network exists
 */
async function containerNetworkExists(): Promise<boolean> {
    try {
        log(`Checking if network ${DOCKER_NETWORK_NAME} exists...`);
        const networks = await docker.listNetworks({
            filters: { name: [DOCKER_NETWORK_NAME] }
        });
        return networks.length > 0;
    } catch (error) {
        logError(`Error checking network existence: ${error}`);
        return false; // Fallback to default network on error
    }
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
