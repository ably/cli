/**
 * Browser-compatible CI authentication utilities
 * This module provides HMAC-based authentication for bypassing rate limits in CI
 */

/**
 * Payload structure for CI authentication
 */
export interface CIAuthPayload {
  timestamp: number;
  testGroup?: string;
  runId?: string;
}

/**
 * Generate HMAC-SHA256 signature using Web Crypto API
 * @param message - Message to sign
 * @param secret - Secret key
 * @returns Hex-encoded signature
 */
async function generateHMAC(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  // Import the secret key
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Generate the signature
  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a HMAC-based authentication token for CI rate limit bypass
 * @param secret - Shared secret from environment
 * @param payload - Authentication payload containing timestamp and metadata
 * @returns Base64 encoded token containing payload and signature
 */
export async function generateCIAuthToken(
  secret: string,
  payload: CIAuthPayload
): Promise<string> {
  // Create a canonical string representation
  const message = JSON.stringify({
    timestamp: payload.timestamp,
    testGroup: payload.testGroup || 'default',
    runId: payload.runId || 'local'
  });

  // Generate HMAC signature
  const signature = await generateHMAC(message, secret);

  // Return base64 encoded token
  const token = {
    payload,
    signature
  };

  return btoa(JSON.stringify(token));
}

/**
 * Check if CI bypass mode should be used
 * @returns true if CI mode is enabled and bypass secret is available
 */
export function shouldUseCIBypass(): boolean {
  // In browser environment, these would be injected during build
  const ciMode = (window as any).__ABLY_CLI_CI_MODE__;
  const hasSecret = !!(window as any).__ABLY_CLI_CI_BYPASS_SECRET__;
  
  return ciMode === 'true' && hasSecret;
}

/**
 * Get CI authentication configuration from window object
 * These values are injected during the build process
 */
export function getCIConfig(): {
  secret?: string;
  testGroup?: string;
  runId?: string;
  websocketUrl?: string;
} {
  const win = window as any;
  return {
    secret: win.__ABLY_CLI_CI_BYPASS_SECRET__,
    testGroup: win.__ABLY_CLI_TEST_GROUP__,
    runId: win.__ABLY_CLI_RUN_ID__,
    websocketUrl: win.__ABLY_CLI_WEBSOCKET_URL__
  };
}

/**
 * Log CI authentication status for debugging
 */
export function logCIAuthStatus(): void {
  const config = getCIConfig();
  
  if (shouldUseCIBypass()) {
    console.log('[CI Auth] Rate limit bypass enabled', {
      websocketUrl: config.websocketUrl || 'default',
      testGroup: config.testGroup || 'default',
      runId: config.runId || 'local'
    });
  } else {
    console.log('[CI Auth] Rate limit bypass disabled');
  }
}