import * as crypto from 'node:crypto';
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
export function isCredentialHashEqual(hash1: string, hash2: string): boolean {
  if (hash1.length !== hash2.length) {
    return false;
  }
  
  // Use crypto.timingSafeEqual for constant-time comparison
  const buffer1 = Buffer.from(hash1, 'utf8');
  const buffer2 = Buffer.from(hash2, 'utf8');
  
  return crypto.timingSafeEqual(buffer1, buffer2);
}

/**
 * Extract client context for session fingerprinting
 */
export function extractClientContext(request: IncomingMessage): { ip: string; userAgent: string; fingerprint: string } {
  const ip = request.socket.remoteAddress || 'unknown';
  const userAgent = request.headers['user-agent'] || 'unknown';
  
  // Create a simple fingerprint from IP and User-Agent
  const fingerprint = crypto.createHash('sha256')
    .update(`${ip}:${userAgent}`)
    .digest('hex')
    .slice(0, 16); // Use first 16 chars for readability
  
  return { ip, userAgent, fingerprint };
}

/**
 * Global tracking of resume attempts per session ID to prevent abuse
 */
const resumeAttempts = new Map<string, {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
}>();

const RESUME_RATE_LIMIT = {
  maxAttempts: 3,
  windowMs: 60 * 1000, // 1 minute
  cooldownMs: 5 * 60 * 1000, // 5 minutes after exceeding limit
};

/**
 * Check if a resume attempt should be rate limited
 */
export function shouldRateLimitResumeAttempt(sessionId: string): boolean {
  const now = Date.now();
  const existing = resumeAttempts.get(sessionId);
  
  if (!existing) {
    // First attempt for this session
    resumeAttempts.set(sessionId, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now
    });
    return false;
  }
  
  const windowAge = now - existing.firstAttempt;
  
  // If we're outside the window, reset the counter
  if (windowAge > RESUME_RATE_LIMIT.windowMs) {
    resumeAttempts.set(sessionId, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now
    });
    return false;
  }
  
  // If we're in cooldown period after exceeding limit, block all attempts
  const timeSinceLastAttempt = now - existing.lastAttempt;
  if (existing.count > RESUME_RATE_LIMIT.maxAttempts && timeSinceLastAttempt < RESUME_RATE_LIMIT.cooldownMs) {
    logError(`Resume attempt blocked during cooldown for session ${sessionId}: ${Math.round(timeSinceLastAttempt / 1000)}s remaining`);
    return true;
  }
  
  // Update the attempt count
  existing.count++;
  existing.lastAttempt = now;
  
  // Check if we've exceeded the limit
  if (existing.count > RESUME_RATE_LIMIT.maxAttempts) {
    logError(`Resume attempt rate limit exceeded for session ${sessionId}: ${existing.count} attempts in ${Math.round(windowAge / 1000)}s`);
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
 * Only runs in production environments to avoid keeping test processes alive
 */
if (process.env.NODE_ENV === 'production') {
  setInterval(cleanupResumeAttemptTracking, 10 * 60 * 1000);
}

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