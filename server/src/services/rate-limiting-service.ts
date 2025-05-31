import { 
  ENABLE_CONNECTION_THROTTLING,
  MAX_CONNECTIONS_PER_IP_PER_MINUTE,
  CONNECTION_THROTTLE_WINDOW_MS,
  MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE,
  TRUSTED_PROXY_ENABLED,
  TRUSTED_PROXY_IPS,
  DISABLE_LOCALHOST_EXEMPTIONS
} from "../config/server-config.js";
import { logSecure } from "../utils/logger.js";
import type { IncomingMessage } from 'http';

// =============================================================================
// RATE LIMITING CONFIGURATION
// =============================================================================

// Check if rate limiting should be disabled for tests
const DISABLE_FOR_TESTS = process.env.DISABLE_RATE_LIMITING_FOR_TESTS === 'true';

// Localhost exemption settings - much higher limits for local development/testing
const LOCALHOST_EXEMPTION_ENABLED = !DISABLE_LOCALHOST_EXEMPTIONS && !TRUSTED_PROXY_ENABLED;
const LOCALHOST_CONNECTION_LIMIT = MAX_CONNECTIONS_PER_IP_PER_MINUTE * 50; // 50x higher limit
const LOCALHOST_RESUME_LIMIT = MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE * 50; // 50x higher limit

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Extract the real client IP address from request, handling proxies securely
 */
function extractClientIP(request?: IncomingMessage): string {
  if (!request) {
    return '0.0.0.0';
  }

  // If we're behind a trusted proxy, check X-Forwarded-For
  if (TRUSTED_PROXY_ENABLED) {
    const proxyIP = request.socket.remoteAddress || '0.0.0.0';
    
    // Only trust X-Forwarded-For from whitelisted proxy IPs
    if (TRUSTED_PROXY_IPS.includes(proxyIP)) {
      const forwardedFor = request.headers['x-forwarded-for'];
      
      if (forwardedFor) {
        // Take the first IP in the chain (original client)
        const ips = typeof forwardedFor === 'string' 
          ? forwardedFor.split(',').map(ip => ip.trim())
          : forwardedFor;
        
        const clientIP = ips[0];
        
        if (clientIP && clientIP !== '127.0.0.1' && clientIP !== '::1') {
          logSecure('Using X-Forwarded-For IP from trusted proxy', {
            proxyIP,
            clientIP,
            forwardedFor
          });
          return clientIP;
        }
      }
    } else {
      logSecure('Ignoring X-Forwarded-For from untrusted proxy', {
        proxyIP,
        trustedIPs: TRUSTED_PROXY_IPS
      });
    }
  }

  // Fall back to direct connection IP
  return request.socket.remoteAddress || '0.0.0.0';
}

/**
 * Check if an IP address is localhost
 */
function isLocalhostIP(ipAddress: string): boolean {
  const localhost = [
    '127.0.0.1',
    '::1',
    'localhost',
    '::ffff:127.0.0.1', // IPv6-mapped IPv4 localhost
    '0.0.0.0' // Sometimes used in containers
  ];
  return localhost.includes(ipAddress) || ipAddress.startsWith('127.') || ipAddress.startsWith('::ffff:127.');
}

/**
 * Check if localhost exemptions should be applied for this IP and request
 * SECURITY: Only apply exemptions for direct localhost connections, not proxied ones
 */
function shouldApplyLocalhostExemption(ipAddress: string, request?: IncomingMessage): boolean {
  // Never apply exemptions if disabled or behind proxy
  if (!LOCALHOST_EXEMPTION_ENABLED) {
    return false;
  }

  // If we're behind a trusted proxy, never apply localhost exemptions
  // (all traffic appears to come from proxy IP)
  if (TRUSTED_PROXY_ENABLED) {
    return false;
  }

  // Only apply if it's actually localhost AND we have no proxy headers
  if (!isLocalhostIP(ipAddress)) {
    return false;
  }

  // Extra security: if we see proxy headers, don't apply exemptions
  if (request?.headers['x-forwarded-for'] || request?.headers['x-real-ip']) {
    logSecure('Refusing localhost exemption due to proxy headers detected', {
      ip: ipAddress,
      xForwardedFor: request.headers['x-forwarded-for'],
      xRealIp: request.headers['x-real-ip']
    });
    return false;
  }

  return true;
}

/**
 * Get the effective rate limit for an IP address
 */
function getEffectiveConnectionLimit(ipAddress: string, request?: IncomingMessage): number {
  if (shouldApplyLocalhostExemption(ipAddress, request)) {
    logSecure('Applying localhost rate limit exemption', {
      ip: ipAddress,
      limit: LOCALHOST_CONNECTION_LIMIT,
      baseLimit: MAX_CONNECTIONS_PER_IP_PER_MINUTE
    });
    return LOCALHOST_CONNECTION_LIMIT;
  }
  return MAX_CONNECTIONS_PER_IP_PER_MINUTE;
}

/**
 * Get the effective resume limit for sessions (same for all currently)
 */
function getEffectiveResumeLimit(): number {
  return LOCALHOST_RESUME_LIMIT; // Apply higher limits globally for resume attempts
}

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
export function isIPRateLimited(ipAddress: string, request?: IncomingMessage): boolean {
  if (!ENABLE_CONNECTION_THROTTLING || DISABLE_FOR_TESTS) {
    return false;
  }

  // Use secure IP extraction
  const clientIP = request ? extractClientIP(request) : ipAddress;
  const now = Date.now();
  const entry = ipRateLimits.get(clientIP);

  if (!entry) {
    return false;
  }

  // Check if currently blocked
  if (entry.blockedUntil && now < entry.blockedUntil) {
    const isLocalhost = shouldApplyLocalhostExemption(clientIP, request);
    logSecure("IP connection blocked due to rate limit", {
      ip: clientIP,
      originalIP: ipAddress,
      isLocalhost,
      blockedFor: Math.round((entry.blockedUntil - now) / 1000)
    });
    return true;
  }

  return false;
}

/**
 * Record a connection attempt from an IP address
 */
export function recordConnectionAttempt(ipAddress: string, request?: IncomingMessage): boolean {
  if (!ENABLE_CONNECTION_THROTTLING || DISABLE_FOR_TESTS) {
    return true; // Allow if throttling disabled or in test mode
  }

  // Use secure IP extraction
  const clientIP = request ? extractClientIP(request) : ipAddress;
  const now = Date.now();
  const effectiveLimit = getEffectiveConnectionLimit(clientIP, request);
  const isLocalhost = shouldApplyLocalhostExemption(clientIP, request);
  let entry = ipRateLimits.get(clientIP);

  if (!entry) {
    // First connection from this IP
    entry = {
      count: 1,
      windowStart: now
    };
    ipRateLimits.set(clientIP, entry);
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
  if (entry.count > effectiveLimit) {
    // Block for the remainder of the current window + one additional window
    entry.blockedUntil = entry.windowStart + (2 * CONNECTION_THROTTLE_WINDOW_MS);
    
    logSecure("IP rate limit exceeded - blocking connections", {
      ip: clientIP,
      originalIP: ipAddress,
      isLocalhost,
      attempts: entry.count,
      limit: effectiveLimit,
      baseLimit: MAX_CONNECTIONS_PER_IP_PER_MINUTE,
      blockDurationMs: entry.blockedUntil - now,
      proxyMode: TRUSTED_PROXY_ENABLED
    });
    
    return false;
  }

  return true;
}

/**
 * Get current rate limit status for an IP
 */
export function getIPRateLimitStatus(ipAddress: string, request?: IncomingMessage): {
  limited: boolean;
  count: number;
  limit: number;
  windowStart: number;
  blockedUntil?: number;
} {
  // Use secure IP extraction
  const clientIP = request ? extractClientIP(request) : ipAddress;
  const entry = ipRateLimits.get(clientIP);
  const effectiveLimit = getEffectiveConnectionLimit(clientIP, request);
  
  if (!entry) {
    return {
      limited: false,
      count: 0,
      limit: effectiveLimit,
      windowStart: Date.now()
    };
  }

  return {
    limited: !!entry.blockedUntil && Date.now() < entry.blockedUntil,
    count: entry.count,
    limit: effectiveLimit,
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
  if (DISABLE_FOR_TESTS) {
    return false; // Disable rate limiting in test mode
  }
  
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
  if (DISABLE_FOR_TESTS) {
    return true; // Allow all attempts in test mode
  }
  
  const now = Date.now();
  const effectiveLimit = getEffectiveResumeLimit();
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
  if (entry.resumeAttempts > effectiveLimit) {
    // Block for 5 minutes
    entry.blockedUntil = now + (5 * 60 * 1000);
    
    logSecure("Session resume rate limit exceeded - blocking", {
      sessionId: sessionId.slice(0, 8),
      attempts: entry.resumeAttempts,
      limit: effectiveLimit,
      baseLimit: MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE,
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
    ipRateLimitingEnabled: ENABLE_CONNECTION_THROTTLING && !DISABLE_FOR_TESTS,
    testModeDisabled: DISABLE_FOR_TESTS,
    localhostExemptionEnabled: LOCALHOST_EXEMPTION_ENABLED,
    maxConnectionsPerIp: MAX_CONNECTIONS_PER_IP_PER_MINUTE,
    localhostConnectionLimit: LOCALHOST_CONNECTION_LIMIT,
    windowMs: CONNECTION_THROTTLE_WINDOW_MS,
    maxResumeAttempts: MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE,
    localhostResumeLimit: LOCALHOST_RESUME_LIMIT,
    // Security configuration
    trustedProxyEnabled: TRUSTED_PROXY_ENABLED,
    trustedProxyIPs: TRUSTED_PROXY_IPS,
    localhostExemptionsDisabled: DISABLE_LOCALHOST_EXEMPTIONS
  });

  if (DISABLE_FOR_TESTS) {
    logSecure("Rate limiting DISABLED for testing mode");
  } else if (TRUSTED_PROXY_ENABLED) {
    logSecure("Running behind trusted proxy - localhost exemptions disabled", {
      trustedProxyIPs: TRUSTED_PROXY_IPS
    });
  } else if (LOCALHOST_EXEMPTION_ENABLED) {
    logSecure("Localhost connections have elevated rate limits for development/testing");
  }

  // Security warnings
  if (TRUSTED_PROXY_ENABLED && TRUSTED_PROXY_IPS.length === 0) {
    logSecure("⚠️  WARNING: Trusted proxy enabled but no proxy IPs configured!");
  }

  if (!DISABLE_LOCALHOST_EXEMPTIONS && TRUSTED_PROXY_ENABLED) {
    logSecure("⚠️  WARNING: Localhost exemptions enabled while behind proxy - this may bypass rate limiting!");
  }

  // Set up cleanup intervals (still useful even in test mode for cleanup)
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

// =============================================================================
// EXPORTED UTILITY FUNCTIONS
// =============================================================================

/**
 * Extract client IP from request (exported for use by other services)
 * This function handles proxy detection securely
 */
export function getClientIPFromRequest(request: IncomingMessage): string {
  return extractClientIP(request);
}

/**
 * Check if an IP should get localhost exemptions (exported for debugging)
 */
export function checkLocalhostExemption(ipAddress: string, request?: IncomingMessage): boolean {
  return shouldApplyLocalhostExemption(ipAddress, request);
} 