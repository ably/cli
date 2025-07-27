import { Page } from 'playwright/test';
import { generateCIAuthToken, shouldUseCIBypass, getCIWebSocketUrl } from './ci-auth';

/**
 * Inject CI authentication configuration into the page
 * This runs before page navigation to ensure the config is available
 */
export async function setupCIAuth(page: Page): Promise<void> {
  if (!shouldUseCIBypass()) {
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log('[CI Auth] Bypass not enabled, skipping setup');
    }
    return;
  }

  const secret = process.env.CI_BYPASS_SECRET!;
  const testGroup = process.env.TEST_GROUP || 'default';
  const runId = process.env.GITHUB_RUN_ID || 'local';

  // Generate the CI auth token
  const ciAuthToken = generateCIAuthToken(secret, {
    timestamp: Date.now(),
    testGroup,
    runId
  });

  // Inject configuration into the page before navigation
  await page.addInitScript((config) => {
    (window as any).__ABLY_CLI_CI_MODE__ = config.ciMode;
    (window as any).__ABLY_CLI_CI_AUTH_TOKEN__ = config.ciAuthToken;
    (window as any).__ABLY_CLI_TEST_GROUP__ = config.testGroup;
    (window as any).__ABLY_CLI_RUN_ID__ = config.runId;
    (window as any).__ABLY_CLI_WEBSOCKET_URL__ = config.websocketUrl;
    (window as any).__VERBOSE_TESTS = config.verboseTests;
    
    // Only log in browser console if in verbose mode
    if ((window as any).__VERBOSE_TESTS) {
      console.log('[CI Auth] Configuration injected', {
        mode: config.ciMode,
        testGroup: config.testGroup,
        runId: config.runId,
        websocketUrl: config.websocketUrl,
        hasToken: !!config.ciAuthToken
      });
    }
  }, {
    ciMode: 'true',  // Always true when CI bypass is enabled
    ciAuthToken,
    testGroup,
    runId,
    websocketUrl: getCIWebSocketUrl(),
    verboseTests: process.env.VERBOSE_TESTS || ''
  });

  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log('[CI Auth] Setup completed', {
      testGroup,
      runId,
      websocketUrl: getCIWebSocketUrl()
    });
  }
}

/**
 * Disable CI auth for specific tests (e.g., rate limit testing)
 */
export async function disableCIAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__ABLY_CLI_CI_MODE__ = 'false';
    (window as any).__ABLY_CLI_CI_AUTH_TOKEN__ = undefined;
    if ((window as any).__VERBOSE_TESTS) {
      console.log('[CI Auth] Disabled for this test');
    }
  });
}

/**
 * Get the WebSocket URL to use for tests
 * This respects the CI configuration or falls back to the public URL
 */
export function getTestWebSocketUrl(): string {
  return getCIWebSocketUrl();
}