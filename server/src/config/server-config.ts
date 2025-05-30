import { config as loadDotEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load .env file from server directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverDir = resolve(__dirname, '../..');

// Load .env file if it exists
loadDotEnv({ path: resolve(serverDir, '.env') });

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

export const DEFAULT_PORT = 8080;
export const PORT = Number.parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

// =============================================================================
// SESSION LIMITS & DOS PROTECTION  
// =============================================================================

// Legacy total session limit (for backward compatibility)
export const DEFAULT_MAX_SESSIONS = 100;
export const MAX_SESSIONS = Number.parseInt(process.env.MAX_SESSIONS || String(DEFAULT_MAX_SESSIONS), 10);

// New separate limits for anonymous vs authenticated users
export const DEFAULT_MAX_ANONYMOUS_SESSIONS = 50;
export const MAX_ANONYMOUS_SESSIONS = Number.parseInt(
  process.env.MAX_ANONYMOUS_SESSIONS || String(DEFAULT_MAX_ANONYMOUS_SESSIONS), 
  10
);

export const DEFAULT_MAX_AUTHENTICATED_SESSIONS = 50;
export const MAX_AUTHENTICATED_SESSIONS = Number.parseInt(
  process.env.MAX_AUTHENTICATED_SESSIONS || String(DEFAULT_MAX_AUTHENTICATED_SESSIONS), 
  10
);

// Rate limiting configuration
export const DEFAULT_MAX_CONNECTIONS_PER_IP_PER_MINUTE = 10;
export const MAX_CONNECTIONS_PER_IP_PER_MINUTE = Number.parseInt(
  process.env.MAX_CONNECTIONS_PER_IP_PER_MINUTE || String(DEFAULT_MAX_CONNECTIONS_PER_IP_PER_MINUTE),
  10
);

export const DEFAULT_MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE = 3;
export const MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE = Number.parseInt(
  process.env.MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE || String(DEFAULT_MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE),
  10
);

// Session timeout configuration
export const DEFAULT_TERMINAL_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const MAX_IDLE_TIME_MS = process.env.TERMINAL_IDLE_TIMEOUT_MS
  ? Number(process.env.TERMINAL_IDLE_TIMEOUT_MS)
  : DEFAULT_TERMINAL_IDLE_TIMEOUT_MS;

// Session duration limits
export const DEFAULT_MAX_SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
export const MAX_SESSION_DURATION_MS = process.env.MAX_SESSION_DURATION_MS
  ? Number(process.env.MAX_SESSION_DURATION_MS)
  : DEFAULT_MAX_SESSION_DURATION_MS;

// Session resume configuration
export const DEFAULT_RESUME_GRACE_MS = 5 * 60 * 1000; // 5 minutes
export const RESUME_GRACE_MS = process.env.RESUME_GRACE_MS
  ? Number(process.env.RESUME_GRACE_MS)
  : DEFAULT_RESUME_GRACE_MS;

// Output buffer configuration
export const DEFAULT_OUTPUT_BUFFER_MAX_LINES = 1000;
export const OUTPUT_BUFFER_MAX_LINES = Number.parseInt(
  process.env.OUTPUT_BUFFER_MAX_LINES || String(DEFAULT_OUTPUT_BUFFER_MAX_LINES),
  10
);

// Authentication timeout
export const AUTH_TIMEOUT_MS = 10000; // 10 seconds for authentication

// Shutdown grace period
export const SHUTDOWN_GRACE_PERIOD_MS = 5000; // 5 seconds

// =============================================================================
// CONTAINER RESOURCE LIMITS
// =============================================================================

export const CONTAINER_LIMITS = {
  memory: Number.parseInt(process.env.CONTAINER_MEMORY_LIMIT || '268435456'), // 256MB
  memorySwap: Number.parseInt(process.env.CONTAINER_MEMORY_LIMIT || '268435456'), // Same as memory (no swap)
  nanoCpus: Number.parseInt(process.env.CONTAINER_CPU_LIMIT || '1000000000'), // 1 CPU
  pidsLimit: Number.parseInt(process.env.CONTAINER_PIDS_LIMIT || '50'), // 50 processes
  tmpfsSize: Number.parseInt(process.env.CONTAINER_TMPFS_SIZE || '67108864'), // 64MB
  configDirSize: Number.parseInt(process.env.CONTAINER_CONFIG_SIZE || '10485760'), // 10MB
} as const;

// =============================================================================
// DOCKER CONFIGURATION
// =============================================================================

export const DOCKER_IMAGE_NAME = process.env.DOCKER_IMAGE_NAME || 'ably-cli-sandbox';
export const DOCKER_NETWORK_NAME = process.env.DOCKER_NETWORK_NAME || 'ably_cli_restricted';
export const FORCE_REBUILD_SANDBOX_IMAGE = process.env.FORCE_REBUILD_SANDBOX_IMAGE === 'true';

// =============================================================================
// SECURITY & MONITORING
// =============================================================================

export const DEBUG_MODE = process.env.DEBUG === 'true';
export const SECURITY_AUDIT_LOG = process.env.SECURITY_AUDIT_LOG === 'true';

// Buffer overflow protection
export const DEFAULT_MAX_WEBSOCKET_MESSAGE_SIZE = 64 * 1024; // 64KB
export const MAX_WEBSOCKET_MESSAGE_SIZE = Number.parseInt(
  process.env.MAX_WEBSOCKET_MESSAGE_SIZE || String(DEFAULT_MAX_WEBSOCKET_MESSAGE_SIZE),
  10
);

export const DEFAULT_MAX_OUTPUT_BUFFER_SIZE = 1024 * 1024; // 1MB
export const MAX_OUTPUT_BUFFER_SIZE = Number.parseInt(
  process.env.MAX_OUTPUT_BUFFER_SIZE || String(DEFAULT_MAX_OUTPUT_BUFFER_SIZE),
  10
);

// Connection throttling
export const ENABLE_CONNECTION_THROTTLING = process.env.ENABLE_CONNECTION_THROTTLING !== 'false';
export const DEFAULT_CONNECTION_THROTTLE_WINDOW_MS = 60000; // 1 minute
export const CONNECTION_THROTTLE_WINDOW_MS = Number.parseInt(
  process.env.CONNECTION_THROTTLE_WINDOW_MS || String(DEFAULT_CONNECTION_THROTTLE_WINDOW_MS),
  10
);

// =============================================================================
// CI/CD & TESTING
// =============================================================================

export const TERMINAL_SERVER_URL = process.env.TERMINAL_SERVER_URL || `ws://localhost:${PORT}`;
export const IS_CI = !!(
  process.env.CI || 
  process.env.GITHUB_ACTIONS || 
  process.env.TRAVIS || 
  process.env.CIRCLECI
);

// Development mode detection (includes CI and local development)
export const IS_DEVELOPMENT = !!(
  IS_CI ||
  process.env.NODE_ENV === 'development' ||
  process.env.NODE_ENV === 'test' ||
  DEBUG_MODE ||
  // Detect common development indicators
  process.env.npm_lifecycle_event === 'test' ||
  process.env.npm_command === 'test' ||
  // Detect if running from source (not production build)
  process.argv[1]?.includes('ts-node') ||
  process.argv[1]?.includes('mocha') ||
  // Detect macOS development environment (AppArmor not available)
  process.platform === 'darwin'
);

// =============================================================================
// ADVANCED CONFIGURATION
// =============================================================================

// Resource monitoring
export const ENABLE_RESOURCE_MONITORING = process.env.ENABLE_RESOURCE_MONITORING !== 'false';
export const DEFAULT_RESOURCE_MONITORING_INTERVAL_MS = 30000; // 30 seconds
export const RESOURCE_MONITORING_INTERVAL_MS = Number.parseInt(
  process.env.RESOURCE_MONITORING_INTERVAL_MS || String(DEFAULT_RESOURCE_MONITORING_INTERVAL_MS),
  10
);

// Cleanup configuration
export const DEFAULT_CLEANUP_GRACE_PERIOD_MS = 300000; // 5 minutes
export const CLEANUP_GRACE_PERIOD_MS = Number.parseInt(
  process.env.CLEANUP_GRACE_PERIOD_MS || String(DEFAULT_CLEANUP_GRACE_PERIOD_MS),
  10
);

// JWT validation mode
export const JWT_VALIDATION_MODE = process.env.JWT_VALIDATION_MODE || 'strict';

// =============================================================================
// SESSION TYPE HELPER FUNCTIONS
// =============================================================================

/**
 * Determine if a session is authenticated based on credentials
 */
export function isAuthenticatedSession(accessToken?: string): boolean {
  return !!(accessToken && accessToken.trim().length > 0);
}

/**
 * Get appropriate session limit based on authentication status
 */
export function getSessionLimit(isAuthenticated: boolean): number {
  return isAuthenticated ? MAX_AUTHENTICATED_SESSIONS : MAX_ANONYMOUS_SESSIONS;
}

/**
 * Get session type string for logging
 */
export function getSessionType(isAuthenticated: boolean): string {
  return isAuthenticated ? 'authenticated' : 'anonymous';
}

// =============================================================================
// CONFIGURATION VALIDATION
// =============================================================================

/**
 * Validate all configuration values and log any issues
 */
export function validateConfiguration(): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Validate port range
  if (PORT < 1 || PORT > 65535) {
    issues.push(`Invalid PORT: ${PORT} (must be 1-65535)`);
  }

  // Validate session limits
  if (MAX_ANONYMOUS_SESSIONS < 0) {
    issues.push(`Invalid MAX_ANONYMOUS_SESSIONS: ${MAX_ANONYMOUS_SESSIONS} (must be >= 0)`);
  }
  
  if (MAX_AUTHENTICATED_SESSIONS < 0) {
    issues.push(`Invalid MAX_AUTHENTICATED_SESSIONS: ${MAX_AUTHENTICATED_SESSIONS} (must be >= 0)`);
  }

  // Validate container limits
  if (CONTAINER_LIMITS.memory < 1024 * 1024) { // 1MB minimum
    issues.push(`Invalid CONTAINER_MEMORY_LIMIT: ${CONTAINER_LIMITS.memory} (must be >= 1MB)`);
  }

  if (CONTAINER_LIMITS.pidsLimit < 1) {
    issues.push(`Invalid CONTAINER_PIDS_LIMIT: ${CONTAINER_LIMITS.pidsLimit} (must be >= 1)`);
  }

  // Validate rate limiting
  if (MAX_CONNECTIONS_PER_IP_PER_MINUTE < 1) {
    issues.push(`Invalid MAX_CONNECTIONS_PER_IP_PER_MINUTE: ${MAX_CONNECTIONS_PER_IP_PER_MINUTE} (must be >= 1)`);
  }

  // Validate buffer sizes
  if (MAX_WEBSOCKET_MESSAGE_SIZE < 1024) { // 1KB minimum
    issues.push(`Invalid MAX_WEBSOCKET_MESSAGE_SIZE: ${MAX_WEBSOCKET_MESSAGE_SIZE} (must be >= 1KB)`);
  }

  if (MAX_OUTPUT_BUFFER_SIZE < 1024) { // 1KB minimum
    issues.push(`Invalid MAX_OUTPUT_BUFFER_SIZE: ${MAX_OUTPUT_BUFFER_SIZE} (must be >= 1KB)`);
  }

  // Validate JWT validation mode
  if (!['strict', 'permissive'].includes(JWT_VALIDATION_MODE)) {
    issues.push(`Invalid JWT_VALIDATION_MODE: ${JWT_VALIDATION_MODE} (must be 'strict' or 'permissive')`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

// =============================================================================
// CONFIGURATION SUMMARY
// =============================================================================

/**
 * Get a summary of current configuration for logging
 */
export function getConfigurationSummary(): Record<string, unknown> {
  return {
    server: {
      port: PORT,
      debugMode: DEBUG_MODE,
      securityAuditLog: SECURITY_AUDIT_LOG,
      isCI: IS_CI
    },
    sessionLimits: {
      anonymous: MAX_ANONYMOUS_SESSIONS,
      authenticated: MAX_AUTHENTICATED_SESSIONS,
      legacy: MAX_SESSIONS
    },
    rateLimiting: {
      enabled: ENABLE_CONNECTION_THROTTLING,
      connectionsPerIpPerMinute: MAX_CONNECTIONS_PER_IP_PER_MINUTE,
      resumeAttemptsPerSessionPerMinute: MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE,
      windowMs: CONNECTION_THROTTLE_WINDOW_MS
    },
    containerLimits: {
      memoryMB: Math.round(CONTAINER_LIMITS.memory / 1024 / 1024),
      cpus: CONTAINER_LIMITS.nanoCpus / 1000000000,
      pidsLimit: CONTAINER_LIMITS.pidsLimit,
      tmpfsSizeMB: Math.round(CONTAINER_LIMITS.tmpfsSize / 1024 / 1024)
    },
    security: {
      maxMessageSizeKB: Math.round(MAX_WEBSOCKET_MESSAGE_SIZE / 1024),
      maxBufferSizeMB: Math.round(MAX_OUTPUT_BUFFER_SIZE / 1024 / 1024),
      jwtValidationMode: JWT_VALIDATION_MODE
    },
    monitoring: {
      resourceMonitoring: ENABLE_RESOURCE_MONITORING,
      monitoringIntervalMs: RESOURCE_MONITORING_INTERVAL_MS
    }
  };
} 