import { WebSocket, WebSocketServer } from "ws";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Duplex } from "node:stream";
import * as stream from "node:stream";
import * as crypto from "node:crypto";
import * as http from "node:http";
import * as jwt from "jsonwebtoken";
import { execSync } from "node:child_process";
// Import Dockerode with type import for type checking
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");
import process from 'node:process';
import * as fs from "node:fs"; // Import fs
import { ChildProcess } from "node:child_process";
import { computeCredentialHash } from './session-utils.js';
import { pathToFileURL } from 'node:url';
import type * as DockerodeTypes from "dockerode";

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
const MAX_IDLE_TIME_MS = process.env.TERMINAL_IDLE_TIMEOUT_MS
  ? Number(process.env.TERMINAL_IDLE_TIMEOUT_MS)
  : 5 * 60 * 1000;      // 5 minutes of inactivity
const MAX_SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes total
// Max lines of recent output retained per session for reconnection resumes
const OUTPUT_BUFFER_MAX_LINES = 1000;
// Time window during which a disconnected session may be resumed (ms)
const RESUME_GRACE_MS = 60_000;

// Type definitions for Docker objects
type DockerContainer = DockerodeTypes.Container;
type DockerExec = DockerodeTypes.Exec;

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
  // SHA-256 hash of apiKey|accessToken captured at first auth, used to validate resume attempts
  credentialHash?: string;
  // Ring buffer of recent stdout/stderr lines for resume support
  outputBuffer?: string[];
  // timer started when ws disconnects; if it fires the session is cleaned
  orphanTimer?: NodeJS.Timeout;
  // Debugging flag for incoming client keystrokes
  _debugLoggedFirstKey?: boolean;
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
  } catch (error) {
      log(`AppArmor check command failed, assuming profile not loaded: ${error instanceof Error ? error.message : String(error)}`);
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

async function ensureDockerImage(): Promise<void> {
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
      } catch (error) {
        log(`Failed to build using Docker CLI: ${error}. Falling back to Docker SDK.`);
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

  log(`[Server] terminateSession called for sessionId=${sessionId}, reason=${reason}`);
  clearTimeout(session.timeoutId);

  // Send disconnected status message
  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    try {
      const statusMsg: ServerStatusMessage = { type: "status", payload: "disconnected", reason };
      session.ws.send(JSON.stringify(statusMsg));
      log(`Sent 'disconnected' status to session ${sessionId}`);
    } catch (error) {
      logError(`Error sending 'disconnected' status to ${sessionId}: ${error}`);
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
    // stdoutStream is readable, typically doesn't need end(); just destroy
    session.stdoutStream.destroy();
    log(`stdoutStream for session ${sessionId} destroyed.`);
  }

  // Stop and remove the container if it exists
  if (session.container) {
    log(`Stopping and removing container for session ${sessionId}...`);
    try {
      await session.container.stop({ t: 5 }); // Allow 5 seconds to stop
      log(`Container for session ${sessionId} stopped.`);
    } catch (error: unknown) {
      // Ignore "container already stopped" or "no such container" errors
      if (
        !(
          error instanceof Error &&
          (/already stopped/i.test(error.message) ||
            /no such container/i.test(error.message))
        )
      ) {
        logError(
          `Error stopping container for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    try {
      await session.container.remove();
      log(`Container for session ${sessionId} removed.`);
    } catch (error: unknown) {
      // Ignore "no such container" errors
      if (
        !(
          error instanceof Error &&
          /no such container/i.test(error.message)
        )
      ) {
        logError(
          `Error removing container for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
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
        log(`[Server] New connection. Assigned sessionId: ${sessionId}`);

        // Immediately send a "connecting" status message
        try {
          const connectingMsg: ServerStatusMessage = { type: "status", payload: "connecting" };
          ws.send(JSON.stringify(connectingMsg));
          log(`Sent 'connecting' status to new session ${sessionId}`);
        } catch (error) {
          logError(`Error sending 'connecting' status to ${sessionId}: ${error}`);
          // If we can't send 'connecting', close the connection
          ws.close(1011, "Failed to send initial status");
          // Note: No session object to cleanup here yet if this fails immediately.
          return;
        }

        if (sessions.size >= maxSessions) {
            log("Max session limit reached. Rejecting new connection.");
            // Send structured error status before closing so client can handle gracefully
            const busyMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Server busy. Please try again later." };
            try { ws.send(JSON.stringify(busyMsg)); } catch (_error) { /* ignore */ }
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
                     const timeoutMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Authentication timeout" };
                     try { ws.send(JSON.stringify(timeoutMsg)); } catch (_error) { /* ignore */ }
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
                let authPayload: { apiKey?: string; accessToken?: string; environmentVariables?: Record<string, string>; sessionId?: string };
                try {
                    authPayload = JSON.parse(message.toString());
                } catch (_error) {
                    void _error;
                    logError(`[${sessionId}] Failed to parse auth message JSON.`);
                    const invalidAuthMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Invalid auth message format" };
                    try { ws.send(JSON.stringify(invalidAuthMsg)); } catch (_error) { /* ignore */ }
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
                    if (sessions.has(resumeAttemptId)) {
                        const existing = sessions.get(resumeAttemptId)!;
                        log(`[Server] Resume attempt: incoming sessionId=${resumeAttemptId}, credentialHash=${incomingCredentialHash}`);

                        if (existing.credentialHash !== incomingCredentialHash) {
                            logError(`[${sessionId}] Resume rejected: credential mismatch`);
                            try {
                              const errMsg: ServerStatusMessage = { type: 'status', payload: 'error', reason: 'Credentials do not match original session' };
                              ws.send(JSON.stringify(errMsg));
                            } catch (_error) { /* ignore */ }
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
                              try { ws.send(line); } catch (_error) { /* ignore send errors */ }
                           }
                        }

                        // Attach streams (new exec) so input/output resumes
                        try {
                           await attachToContainer(existing, ws);
                           ws.on('message', (msg) => handleMessage(existing, msg as Buffer));
                           log(`[Server] attemptCrossProcessResume: SUCCESS. sessionId=${resumeAttemptId}`);
                        } catch (error) {
                           logError(`[Server] attemptCrossProcessResume: FAILED. sessionId=${resumeAttemptId}`);
                           terminateSession(existing.sessionId, 'Failed cross-process resume');
                        }
                        return; // In-memory resume handled
                    }

                    // Fallback: try to restore session by locating existing container
                    const restored = await attemptCrossProcessResume(resumeAttemptId, incomingCredentialHash, ws);
                    if (restored) {
                        log(`[Server] attemptCrossProcessResume: SUCCESS. sessionId=${resumeAttemptId}`);

                        // Clean up the placeholder session for this connection just as we do in the
                        // in-memory resume path.
                        if (sessionId !== resumeAttemptId && sessions.has(sessionId)) {
                          const placeholder = sessions.get(sessionId)!;
                          clearTimeout(placeholder.timeoutId);
                          sessions.delete(sessionId);
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
                    try { ws.send(JSON.stringify(missingCredMsg)); } catch (_error) { /* ignore */ }
                    ws.close(4001, 'Missing credentials');
                    if (sessionId) cleanupSession(sessionId);
                    return;
                }

                // If an access token is supplied and *looks* like a JWT, run structural validation; otherwise accept as-is.
                const accessTokenStr = hasAccessToken ? String(authPayload.accessToken) : null;
                if (accessTokenStr && accessTokenStr.split('.').length === 3 && !isValidToken(accessTokenStr as string)) {
                    logError(`[${sessionId}] Supplied JWT access token failed validation.`);
                    const invalidTokenMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Invalid or expired access token" };
                    try { ws.send(JSON.stringify(invalidTokenMsg)); } catch (_error) { /* ignore */ }
                    ws.close(4001, 'Invalid token');
                    if (sessionId) cleanupSession(sessionId);
                    return;
                }
                const { apiKey, accessToken, environmentVariables } = authPayload;

                // --- Auth Success -> Container Creation Phase ---
                log(`[Server] Authentication successful.`);

                // Clear the auth timeout since we've authenticated successfully
                clearTimeout(initialSession.timeoutId);

                let container: DockerContainer;
                try {
                   // Pass credentials to createContainer
                   container = await createContainer(apiKey ?? '', accessToken ?? '', environmentVariables || {}, sessionId);
                   log(`[Server] Container created successfully: ${container.id}`);

                   // Start the container before attempting to attach
                   await container.start();
                   log(`[Server] Container started successfully: ${container.id}`);

                } catch (error) {
                    logError(`[Server] Failed to create or start container: ${error instanceof Error ? error.message : String(error)}`);
                    const containerErrorMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Failed to create session environment" };
                    try { ws.send(JSON.stringify(containerErrorMsg)); } catch (_error) { /* ignore */ }
                    ws.close(1011, 'Container creation failed');
                    if (sessionId) cleanupSession(sessionId); // Cleanup partial session
                    return;
                }

                // Compute credential hash for later resume validation
                const credentialHash = computeCredentialHash(apiKey, accessToken);
                log(`[Server] credentialHash=${credentialHash.slice(0, 8)}...`);

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
                sessions.set(sessionId, fullSession); // Update session map with full data
                log(`[Server] Full session object created.`);

                // --- Attachment Phase ---
                try {
                    // Wait for attachment to complete before setting up message handlers
                    await attachToContainer(fullSession, ws);
                    log(`[Server] Successfully attached to container.`);

                    // --- Set up Main Message Handler ---
                    // Only set up *after* successful attachment
                    ws.on('message', (msg) => handleMessage(fullSession, msg as Buffer));
                    log(`[Server] Main message handler attached.`);
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
            log(`[Server] WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);

            const existing = sessions.get(sessionId);
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
            const existing = sessions.get(sessionId);
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

// Determine if this file is being executed directly via `node scripts/terminal-server.js` (or compiled variant)
// versus being imported as a library (e.g. from unit tests). When imported we must NOT automatically
// start a WebSocket server, otherwise tests will spawn background processes that occupy port 8080
// and prevent the Mocha runner from exiting within its watchdog timeout.
const __isDirectRun = import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined);

// --- Server Initialization (using top-level await) ---

if (__isDirectRun) {
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
        // Disable the debugger on first SIGINT to allow clean exit
        if (nodeProcess._debugEnd) {
          nodeProcess._debugEnd();
        }
      });
    }
  } catch (error) {
    logError("Server failed unexpectedly:");
    logError(error);
    process.exit(1);
  }
}

function pipeStreams(
  ws: WebSocket,
  containerStream: Duplex,
  session?: ClientSession,
  isRawTty = false,
): void {
  try {
    log('Setting up bidirectional piping between WebSocket and container stream');
    let firstChunkReceived = false; // Flag to log only the first chunk

    if (isRawTty) {
      // Handle potential fragmented handshake JSON that appears **once**
      let handshakeHandled = false;

      containerStream.on('data', (chunk: Buffer) => {
        // Fast path once handshake removed
        if (handshakeHandled) {
          if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
          if (session) {
            const txt = chunk.toString('utf8');
            if (!session.outputBuffer) session.outputBuffer = [];
            session.outputBuffer.push(txt);
          }
          return;
        }

        // Still looking for handshake
        const text = chunk.toString('utf8');
        const handshakeRegex = /\{[^}]*stream[^}]*stdin[^}]*stdout[^}]*stderr[^}]*hijack[^}]*\}/;
        const match = text.match(handshakeRegex);

        if (match) {
          log('Swallowed Docker attach handshake JSON (regex match)');
          handshakeHandled = true;
          const before = text.slice(0, match.index);
          const after = text.slice(match.index! + match[0].length);

          if (before.length > 0 && ws.readyState === WebSocket.OPEN) ws.send(before);
          if (after.length > 0 && ws.readyState === WebSocket.OPEN) ws.send(after);

          if (session) {
            if (!session.outputBuffer) session.outputBuffer = [];
            if (before.length > 0) session.outputBuffer.push(before);
            if (after.length > 0) session.outputBuffer.push(after);
          }
        } else {
          // No handshake in this chunk → forward as-is
          if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
          if (session) {
            if (!session.outputBuffer) session.outputBuffer = [];
            session.outputBuffer.push(text);
          }
        }
      });
    } else {
      // Demultiplexed stream (non-TTY exec)
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
            log(`First chunk received from container (type ${streamType}, size ${payloadSize})`);
            firstChunkReceived = true;
          }

          if (streamType === 1 || streamType === 2) {
            if (ws.readyState === WebSocket.OPEN) ws.send(payload);

            if (session) {
              const text = payload.toString('utf8');
              if (!session.outputBuffer) session.outputBuffer = [];
              session.outputBuffer.push(text);
              if (session.outputBuffer.length > OUTPUT_BUFFER_MAX_LINES) {
                session.outputBuffer.splice(0, session.outputBuffer.length - OUTPUT_BUFFER_MAX_LINES);
              }
            }
          }

          processingBuffer = processingBuffer.slice(8 + payloadSize);
        }
      });
    }

    // ------------------------------------------------------------------
    // Detect when the user terminates the shell (e.g. by typing `exit`).
    // When the underlying container stream ends we notify the client and
    // close the WebSocket with an application-specific code (4000). This is
    // treated as a *non-recoverable* disconnect by the React component so
    // it will show a prompt instead of auto-reconnecting.
    // ------------------------------------------------------------------
    const handleStreamTermination = (label: string) => {
      try {
        log(`Container stream ${label} – signalling session end to client`);
        if (ws.readyState === WebSocket.OPEN) {
          const endMsg: ServerStatusMessage = {
            type: 'status',
            payload: 'disconnected',
            reason: 'Session ended by user',
          };
          ws.send(JSON.stringify(endMsg));
          // Give the message a moment to flush before closing
          setTimeout(() => {
            try {
              ws.close(4000, 'user-exit');
            } catch { /* ignore */ }
          }, 10);
        }
      } catch (error) {
        logError(`Error while handling stream termination: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Ensure container/session cleanup (graceful=false because CLI already exited)
      if (session) {
        void terminateSession(session.sessionId, 'User exit', false, 4000);
      }
    };

    containerStream.on('end', () => handleStreamTermination('end'));
    containerStream.on('close', () => handleStreamTermination('close'));
    containerStream.on('error', (error) => {
      logError(`Container stream error: ${error}`);
      handleStreamTermination('error');
    });

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
        } catch (_error) { logError('Failed to send error status for container not found'); }
        await terminateSession(session.sessionId, "Container not found", false);
        return;
    }

    // Mark that attachment is starting
    session.isAttaching = true;

    // If we're re-attaching during a session resume we must close the old
    // streams first; otherwise Docker will keep the previous hijacked
    // connection open which steals STDIN and leaves the new attachment
    // read-only.
    if (session.stdinStream && !session.stdinStream.destroyed) {
      // Detach termination listeners so that destroying the old stream while
      // re-attaching doesn't trigger the "user exit" path that would
      // otherwise call terminateSession and kill the container.
      session.stdinStream.removeAllListeners('end');
      session.stdinStream.removeAllListeners('close');
      session.stdinStream.removeAllListeners('error');
      safeCloseWsStream(session.stdinStream);
    }
    if (session.stdoutStream && session.stdoutStream !== session.stdinStream && !session.stdoutStream.destroyed) {
      session.stdoutStream.removeAllListeners('end');
      session.stdoutStream.removeAllListeners('close');
      session.stdoutStream.removeAllListeners('error');
      safeCloseWsStream(session.stdoutStream as unknown as Duplex);
    }

    // Attach directly to the container's main TTY so that the same shell
    // process stays alive across WebSocket reconnects. Docker allows
    // multiple attachments to a running container provided TTY=true.

    let containerStream = await session.container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true,
    }) as stream.Duplex;

    session.stdinStream = containerStream;
    session.stdoutStream = containerStream;
    // We are no longer using per-resume exec instances
    session.execInstance = undefined;
    // Reset per-attach debug flag so we can log the first keystroke again
    session._debugLoggedFirstKey = false;

    log(`Attached stream to container ${session.container.id} for session ${session.sessionId}`);
    session.isAttaching = false;

    // Send "connected" status message AFTER streams are attached but BEFORE piping starts
    try {
        if (ws.readyState === WebSocket.OPEN) {
            const connectedMsg: ServerStatusMessage = { type: "status", payload: "connected" };
            log(`[Server] Sending 'connected' status to session ${session.sessionId}`);
            ws.send(JSON.stringify(connectedMsg));

            // Immediately follow with a hello that contains the sessionId for the client to log/store
            const helloMsg = { type: "hello", sessionId: session.sessionId };
            ws.send(JSON.stringify(helloMsg));
        }
    } catch (error) {
        logError(`Error sending 'connected' status to ${session.sessionId}: ${error}`);
        await terminateSession(session.sessionId, "Failed to confirm connection status", false);
        return;
    }
    
    // Add a small delay before piping to allow client to process "connected" status
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // Now start piping after sending connected status and adding delay
    pipeStreams(ws, containerStream, session, true);

    // NOTE: We no longer inject an extra "\n" after attach because it caused
    // double prompts both on first load and on every resume. The restricted
    // shell prints its banner and prompt unconditionally, so an extra newline
    // is unnecessary and confusing.

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
        scheduleOrphanCleanup(session);
    });

    ws.on("error", async (error: Error) => {
        logError(`WebSocket stream error for session ${session.sessionId}: ${error.message}`);
        if (containerStream) safeCloseWsStream(containerStream);
        if (session.authenticated) {
            scheduleOrphanCleanup(session);
        } else {
            cleanupSession(session.sessionId);
        }
    });

    containerStream.on('close', () => {
        log(`Container stream closed for session ${session.sessionId}`);
        safeCloseWsStream(containerStream);
        if (session.authenticated) {
            scheduleOrphanCleanup(session);
        } else {
            cleanupSession(session.sessionId);
        }
    });
    containerStream.on('error', (error) => {
        logError(`Container stream error for session ${session.sessionId}: ${error.message}`);
        safeCloseWsStream(containerStream);
        if (session.authenticated) {
            scheduleOrphanCleanup(session);
        } else {
            cleanupSession(session.sessionId);
        }
    });
}

async function cleanupSession(sessionId: string) {
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
    } catch (_error) { /* ignore */ }
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
function scheduleOrphanCleanup(session: ClientSession): void {
  if (session.orphanTimer) clearTimeout(session.orphanTimer);
  session.orphanTimer = setTimeout(() => {
    log(`Orphan timer fired – cleaning session ${session.sessionId}`);
    terminateSession(session.sessionId, 'Session resume window expired');
  }, RESUME_GRACE_MS);
  log(`Scheduled orphan cleanup for session ${session.sessionId} in ${RESUME_GRACE_MS}ms`);
}

// --- Message Handlers ---

function handleExecResize(
  session: ClientSession,
  data: { cols: number; rows: number },
): void {
  const { cols, rows } = data;
  log(`Resizing TTY for session ${session.sessionId} to ${cols}x${rows}`);
  if (session.execInstance) {
    session.execInstance
      .resize({ h: rows, w: cols })
      .catch((error: Error) => {
        logError(`Error resizing exec TTY for session ${session.sessionId}: ${error.message}`);
      });
  } else if (session.container) {
    session.container
      .resize({ h: rows, w: cols })
      .catch((error: Error) => {
        logError(`Container resize failed for session ${session.sessionId}: ${error.message}`);
      });
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
                } catch (_error) {
                    void _error; // Not JSON, continue with raw input handling
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
        } catch (_error) {
            void _error; // Not JSON, continue with raw input handling
        }

        // Direct pass-through for raw input (both regular characters and control keys)
        if (session.stdinStream && !session.stdinStream.destroyed) {
            // Debug: log the very first keystroke we receive after an attach to
            // confirm that STDIN is reaching the server side. We store a flag
            // on the session so we only log once per attachment.
            if (!(session as any)._debugLoggedFirstKey) {
              const preview = message.subarray(0, 20).toString('utf8');
              log(`First client input after attach for session ${session.sessionId}: ${JSON.stringify(preview)}`);
              (session as any)._debugLoggedFirstKey = true;
            }

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
            } catch (error) {
                logError(`Failed to write input as fallback: ${error instanceof Error ? error.message : String(error)}`);
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

/**
 * Helper to replace the WebSocket on an existing session when a valid resume
 * request arrives. Closes the old socket, clears orphan timer, reassigns ws.
 */
function takeoverSession(existing: ClientSession, newWs: WebSocket): void {
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

function canResumeSession(resumeId: string | null, credentialHash: string): boolean {
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
async function attemptCrossProcessResume(resumeId: string, incomingCredentialHash: string, ws: WebSocket): Promise<boolean> {
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
        try { ws.send(line); } catch (_error) { /* ignore */ }
        newSession.outputBuffer!.push(line);
      }
    } catch (error) {
      logError(`[Server] attemptCrossProcessResume: Failed to fetch logs for replay: ${error}`);
    }

    // Attach a fresh exec so that stdin/stdout continue
    try {
      await attachToContainer(newSession, ws);
      ws.on('message', (msg) => handleMessage(newSession, msg as Buffer));
      log(`[Server] attemptCrossProcessResume: SUCCESS. sessionId=${resumeId}`);
    } catch (error) {
      logError(`[Server] attemptCrossProcessResume: FAILED. sessionId=${resumeId}`);
      await terminateSession(resumeId, 'Failed cross-process resume');
      return true; // handled (but failed)
    }

    return true;
  } catch (error) {
    logError(`[Server] attemptCrossProcessResume: Error during cross-process resume attempt: ${error}`);
    return false; // Fall back to fresh session
  }
}

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
