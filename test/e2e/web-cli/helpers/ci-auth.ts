import crypto from 'node:crypto';

/**
 * Payload structure for CI authentication
 */
export interface CIAuthPayload {
  timestamp: number;
  testGroup?: string;
  runId?: string;
}

/**
 * Generate a HMAC-based authentication token for CI rate limit bypass
 * @param secret - Shared secret from environment
 * @param payload - Authentication payload containing timestamp and metadata
 * @returns Base64 encoded token containing payload and signature
 */
export function generateCIAuthToken(secret: string, payload: CIAuthPayload): string {
  // Create a canonical string representation
  const message = JSON.stringify({
    timestamp: payload.timestamp,
    testGroup: payload.testGroup || 'default',
    runId: payload.runId || 'local'
  });

  // Generate HMAC-SHA256
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  const signature = hmac.digest('hex');

  // Return base64 encoded token
  return Buffer.from(JSON.stringify({
    payload,
    signature
  })).toString('base64');
}

/**
 * Check if CI bypass mode should be used
 * @returns true if CI mode is enabled and bypass secret is available
 */
export function shouldUseCIBypass(): boolean {
  return !!process.env.CI_BYPASS_SECRET;
}

/**
 * Get the WebSocket URL to use (production or local)
 * @returns WebSocket URL from environment or default production URL
 */
export function getCIWebSocketUrl(): string {
  return process.env.TERMINAL_SERVER_URL || 'wss://web-cli.ably.com';
}

/**
 * Log CI authentication status for debugging
 */
export function logCIAuthStatus(): void {
  if (shouldUseCIBypass()) {
    console.log('[CI Auth] Rate limit bypass enabled', {
      websocketUrl: getCIWebSocketUrl(),
      testGroup: process.env.TEST_GROUP || 'default',
      runId: process.env.GITHUB_RUN_ID || 'local'
    });
  } else {
    console.log('[CI Auth] Rate limit bypass disabled', {
      hasSecret: !!process.env.CI_BYPASS_SECRET
    });
  }
}

/**
 * Get CI auth token if bypass is enabled
 * @returns CI auth token or undefined
 */
export function getCIAuthToken(): string | undefined {
  const secret = process.env.CI_BYPASS_SECRET;
  if (!secret) {
    return undefined;
  }
  
  const payload: CIAuthPayload = {
    timestamp: Date.now(),
    testGroup: process.env.TEST_GROUP || 'e2e-web-cli',
    runId: process.env.GITHUB_RUN_ID || `local-${Date.now()}`
  };
  
  return generateCIAuthToken(secret, payload);
}