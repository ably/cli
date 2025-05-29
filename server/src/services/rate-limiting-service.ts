import { 
  ENABLE_CONNECTION_THROTTLING,
  MAX_CONNECTIONS_PER_IP_PER_MINUTE,
  CONNECTION_THROTTLE_WINDOW_MS,
  MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE
} from "../config/server-config.js";
import { logSecure } from "../utils/logger.js";

// =============================================================================
// RATE LIMITING DATA STRUCTURES
// =============================================================================

interface IPRateLimitEntry {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

interface SessionRateLimitEntry {
  resumeAttempts: number;
  windowStart: number;
  blockedUntil?: number;
}

// In-memory storage for rate limiting
const ipRateLimits = new Map<string, IPRateLimitEntry>();
const sessionRateLimits = new Map<string, SessionRateLimitEntry>();

// Cleanup intervals
let ipCleanupInterval: NodeJS.Timeout | null = null;
let sessionCleanupInterval: NodeJS.Timeout | null = null;

// =============================================================================
// IP-BASED RATE LIMITING
// =============================================================================

/**
 * Check if an IP address is rate limited for connections
 */
export function isIPRateLimited(ipAddress: string): boolean {
  if (!ENABLE_CONNECTION_THROTTLING) {
    return false;
  }

  const now = Date.now();
  const entry = ipRateLimits.get(ipAddress);

  if (!entry) {
    return false;
  }

  // Check if currently blocked
  if (entry.blockedUntil && now < entry.blockedUntil) {
    logSecure("IP connection blocked due to rate limit", {
      ip: ipAddress,
      blockedFor: Math.round((entry.blockedUntil - now) / 1000)
    });
    return true;
  }

  return false;
}

/**
 * Record a connection attempt from an IP address
 */
export function recordConnectionAttempt(ipAddress: string): boolean {
  if (!ENABLE_CONNECTION_THROTTLING) {
    return true; // Allow if throttling disabled
  }

  const now = Date.now();
  let entry = ipRateLimits.get(ipAddress);

  if (!entry) {
    // First connection from this IP
    entry = {
      count: 1,
      windowStart: now
    };
    ipRateLimits.set(ipAddress, entry);
    return true;
  }

  // Check if we need to reset the window
  if (now - entry.windowStart >= CONNECTION_THROTTLE_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
    delete entry.blockedUntil;
    return true;
  }

  // Increment count
  entry.count++;

  // Check if limit exceeded
  if (entry.count > MAX_CONNECTIONS_PER_IP_PER_MINUTE) {
    // Block for the remainder of the current window + one additional window
    entry.blockedUntil = entry.windowStart + (2 * CONNECTION_THROTTLE_WINDOW_MS);
    
    logSecure("IP rate limit exceeded - blocking connections", {
      ip: ipAddress,
      attempts: entry.count,
      limit: MAX_CONNECTIONS_PER_IP_PER_MINUTE,
      blockDurationMs: entry.blockedUntil - now
    });
    
    return false;
  }

  return true;
}

/**
 * Get current rate limit status for an IP
 */
export function getIPRateLimitStatus(ipAddress: string): {
  limited: boolean;
  count: number;
  limit: number;
  windowStart: number;
  blockedUntil?: number;
} {
  const entry = ipRateLimits.get(ipAddress);
  
  if (!entry) {
    return {
      limited: false,
      count: 0,
      limit: MAX_CONNECTIONS_PER_IP_PER_MINUTE,
      windowStart: Date.now()
    };
  }

  return {
    limited: !!entry.blockedUntil && Date.now() < entry.blockedUntil,
    count: entry.count,
    limit: MAX_CONNECTIONS_PER_IP_PER_MINUTE,
    windowStart: entry.windowStart,
    blockedUntil: entry.blockedUntil
  };
}

// =============================================================================
// SESSION-BASED RATE LIMITING
// =============================================================================

/**
 * Check if a session is rate limited for resume attempts
 */
export function isSessionResumeLimited(sessionId: string): boolean {
  const now = Date.now();
  const entry = sessionRateLimits.get(sessionId);

  if (!entry) {
    return false;
  }

  // Check if currently blocked
  if (entry.blockedUntil && now < entry.blockedUntil) {
    logSecure("Session resume blocked due to rate limit", {
      sessionId: sessionId.slice(0, 8),
      blockedFor: Math.round((entry.blockedUntil - now) / 1000)
    });
    return true;
  }

  return false;
}

/**
 * Record a session resume attempt
 */
export function recordSessionResumeAttempt(sessionId: string): boolean {
  const now = Date.now();
  let entry = sessionRateLimits.get(sessionId);

  if (!entry) {
    // First resume attempt for this session
    entry = {
      resumeAttempts: 1,
      windowStart: now
    };
    sessionRateLimits.set(sessionId, entry);
    return true;
  }

  // Check if we need to reset the window (1 minute window)
  if (now - entry.windowStart >= 60000) {
    entry.resumeAttempts = 1;
    entry.windowStart = now;
    delete entry.blockedUntil;
    return true;
  }

  // Increment count
  entry.resumeAttempts++;

  // Check if limit exceeded
  if (entry.resumeAttempts > MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE) {
    // Block for 5 minutes
    entry.blockedUntil = now + (5 * 60 * 1000);
    
    logSecure("Session resume rate limit exceeded - blocking", {
      sessionId: sessionId.slice(0, 8),
      attempts: entry.resumeAttempts,
      limit: MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE,
      blockDurationMs: entry.blockedUntil - now
    });
    
    return false;
  }

  return true;
}

/**
 * Clear rate limiting for a session (when session is properly terminated)
 */
export function clearSessionRateLimit(sessionId: string): void {
  sessionRateLimits.delete(sessionId);
}

// =============================================================================
// BUFFER OVERFLOW PROTECTION
// =============================================================================

/**
 * Validate WebSocket message size
 */
export function validateMessageSize(messageSize: number, maxSize: number): boolean {
  if (messageSize > maxSize) {
    logSecure("Message size limit exceeded", {
      size: messageSize,
      limit: maxSize
    });
    return false;
  }
  return true;
}

/**
 * Validate output buffer size
 */
export function validateBufferSize(bufferSize: number, maxSize: number): boolean {
  if (bufferSize > maxSize) {
    logSecure("Output buffer size limit exceeded", {
      size: bufferSize,
      limit: maxSize
    });
    return false;
  }
  return true;
}

// =============================================================================
// CLEANUP & MONITORING
// =============================================================================

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  
  // Clean up IP rate limits
  for (const [ip, entry] of ipRateLimits.entries()) {
    // Remove entries older than 2 window periods
    if (now - entry.windowStart > (2 * CONNECTION_THROTTLE_WINDOW_MS)) {
      ipRateLimits.delete(ip);
    }
  }
  
  // Clean up session rate limits
  for (const [sessionId, entry] of sessionRateLimits.entries()) {
    // Remove entries older than 10 minutes
    if (now - entry.windowStart > (10 * 60 * 1000)) {
      sessionRateLimits.delete(sessionId);
    }
  }
  
  logSecure("Rate limit cleanup completed", {
    ipEntries: ipRateLimits.size,
    sessionEntries: sessionRateLimits.size
  });
}

/**
 * Initialize rate limiting service
 */
export function initializeRateLimiting(): void {
  logSecure("Initializing rate limiting service", {
    ipRateLimitingEnabled: ENABLE_CONNECTION_THROTTLING,
    maxConnectionsPerIp: MAX_CONNECTIONS_PER_IP_PER_MINUTE,
    windowMs: CONNECTION_THROTTLE_WINDOW_MS,
    maxResumeAttempts: MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE
  });

  // Set up cleanup intervals
  ipCleanupInterval = setInterval(cleanupExpiredEntries, 5 * 60 * 1000); // Every 5 minutes
  sessionCleanupInterval = setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
}

/**
 * Shutdown rate limiting service
 */
export function shutdownRateLimiting(): void {
  if (ipCleanupInterval) {
    clearInterval(ipCleanupInterval);
    ipCleanupInterval = null;
  }
  
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
    sessionCleanupInterval = null;
  }
  
  // Clear all data
  ipRateLimits.clear();
  sessionRateLimits.clear();
  
  logSecure("Rate limiting service shutdown completed");
}

/**
 * Get rate limiting statistics
 */
export function getRateLimitingStats(): {
  ipEntries: number;
  sessionEntries: number;
  blockedIPs: number;
  blockedSessions: number;
} {
  const now = Date.now();
  
  let blockedIPs = 0;
  let blockedSessions = 0;
  
  for (const entry of ipRateLimits.values()) {
    if (entry.blockedUntil && now < entry.blockedUntil) {
      blockedIPs++;
    }
  }
  
  for (const entry of sessionRateLimits.values()) {
    if (entry.blockedUntil && now < entry.blockedUntil) {
      blockedSessions++;
    }
  }
  
  return {
    ipEntries: ipRateLimits.size,
    sessionEntries: sessionRateLimits.size,
    blockedIPs,
    blockedSessions
  };
} 