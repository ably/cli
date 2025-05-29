import * as crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { log, logError } from './logger.js';

/**
 * Compute a deterministic SHA-256 hash of the credentials supplied during
 * authentication. We concatenate the apiKey and accessToken with a pipe so
 * that an empty value is still represented in the input string.
 */
export function computeCredentialHash(apiKey: string | undefined, accessToken: string | undefined): string {
  const input = `${apiKey ?? ''}|${accessToken ?? ''}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Timing-safe comparison of credential hashes to prevent timing attacks
 */
export function isCredentialHashEqual(storedHash: string, incomingHash: string): boolean {
  if (storedHash.length !== incomingHash.length) {
    return false;
  }
  
  try {
    const storedBuffer = Buffer.from(storedHash, 'hex');
    const incomingBuffer = Buffer.from(incomingHash, 'hex');
    return crypto.timingSafeEqual(storedBuffer, incomingBuffer);
  } catch {
    // If conversion fails, fall back to false
    return false;
  }
}

/**
 * Extract client context for session binding
 */
export function extractClientContext(req: IncomingMessage): {
  ip: string;
  userAgent: string;
  fingerprint: string;
} {
  // Extract real IP considering proxies
  const ip = (
    req.headers['x-forwarded-for'] as string ||
    req.headers['x-real-ip'] as string ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  ).split(',')[0].trim();

  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Create a fingerprint for this client context
  const contextInput = `${ip}|${userAgent}`;
  const fingerprint = crypto.createHash('sha256').update(contextInput).digest('hex').slice(0, 16);
  
  return { ip, userAgent, fingerprint };
}

/**
 * Global tracking of resume attempts per session ID to prevent abuse
 */
const resumeAttempts = new Map<string, {
  count: number;
  lastAttempt: number;
  windowStart: number;
}>();

const RESUME_RATE_LIMIT = {
  maxAttempts: 3,          // Max 3 attempts
  windowMs: 60 * 1000,     // Per 60 seconds
  cooldownMs: 5 * 60 * 1000, // 5 minute cooldown after limit exceeded
};

/**
 * Check if resume attempt should be rate limited
 */
export function shouldRateLimitResumeAttempt(sessionId: string): boolean {
  const now = Date.now();
  const attempts = resumeAttempts.get(sessionId);
  
  if (!attempts) {
    // First attempt for this session
    resumeAttempts.set(sessionId, {
      count: 1,
      lastAttempt: now,
      windowStart: now,
    });
    return false;
  }
  
  // Check if we're still in cooldown period
  if (attempts.count >= RESUME_RATE_LIMIT.maxAttempts) {
    const timeSinceLimit = now - attempts.lastAttempt;
    if (timeSinceLimit < RESUME_RATE_LIMIT.cooldownMs) {
      log(`Resume attempt rate limited for session ${sessionId}: still in cooldown (${Math.round((RESUME_RATE_LIMIT.cooldownMs - timeSinceLimit) / 1000)}s remaining)`);
      return true;
    }
    // Cooldown expired, reset counter
    attempts.count = 0;
    attempts.windowStart = now;
  }
  
  // Check if we need to reset the window
  const windowAge = now - attempts.windowStart;
  if (windowAge > RESUME_RATE_LIMIT.windowMs) {
    attempts.count = 0;
    attempts.windowStart = now;
  }
  
  // Increment counter
  attempts.count++;
  attempts.lastAttempt = now;
  
  // Check if we've exceeded the limit
  if (attempts.count > RESUME_RATE_LIMIT.maxAttempts) {
    logError(`Resume attempt rate limit exceeded for session ${sessionId}: ${attempts.count} attempts in ${Math.round(windowAge / 1000)}s`);
    return true;
  }
  
  return false;
}

/**
 * Clean up old resume attempt tracking data
 */
export function cleanupResumeAttemptTracking(): void {
  const now = Date.now();
  const cutoff = now - (RESUME_RATE_LIMIT.cooldownMs + RESUME_RATE_LIMIT.windowMs);
  
  for (const [sessionId, attempts] of resumeAttempts.entries()) {
    if (attempts.lastAttempt < cutoff) {
      resumeAttempts.delete(sessionId);
    }
  }
}

/**
 * Periodic cleanup of resume attempt tracking (call every 10 minutes)
 */
setInterval(cleanupResumeAttemptTracking, 10 * 60 * 1000);

/**
 * Check if client context matches for session security
 */
export function isClientContextCompatible(
  storedContext: { fingerprint: string } | undefined,
  currentContext: { fingerprint: string }
): boolean {
  if (!storedContext) {
    // No stored context means this is legacy session, allow it
    return true;
  }
  
  // For now, allow context changes but log them for monitoring
  if (storedContext.fingerprint !== currentContext.fingerprint) {
    log(`Client context changed for session (stored: ${storedContext.fingerprint}, current: ${currentContext.fingerprint})`);
    // TODO: In production, consider returning false here to be more strict
    return true;
  }
  
  return true;
} 