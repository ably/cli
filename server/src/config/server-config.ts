// Constants for Docker configuration
export const DOCKER_IMAGE_NAME = process.env.DOCKER_IMAGE_NAME || 'ably-cli-sandbox';
export const DOCKER_NETWORK_NAME = 'ably_cli_restricted';
// Note: Allowed domains are defined in docker/network-security.sh and applied at container runtime

// --- Configuration ---
export const SESSION_TIMEOUT_MS = 1000 * 60 * 15; // 15 minutes
export const DEFAULT_PORT = 8080;
export const DEFAULT_MAX_SESSIONS = 50;
export const AUTH_TIMEOUT_MS = 10_000; // 10 seconds
export const SHUTDOWN_GRACE_PERIOD_MS = 10_000; // 10 seconds for graceful shutdown

// Add session timeout constants
export const MAX_IDLE_TIME_MS = process.env.TERMINAL_IDLE_TIMEOUT_MS
  ? Number(process.env.TERMINAL_IDLE_TIMEOUT_MS)
  : 5 * 60 * 1000;      // 5 minutes of inactivity
export const MAX_SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes total

// Max lines of recent output retained per session for reconnection resumes
export const OUTPUT_BUFFER_MAX_LINES = 1000;

// Time window during which a disconnected session may be resumed (ms)
export const RESUME_GRACE_MS = 60_000; 