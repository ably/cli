import { Page } from 'playwright/test';
import { generateCIAuthToken, shouldUseCIBypass, getCIWebSocketUrl } from './ci-auth';

/**
 * Inject CI authentication configuration into the page
 * This runs before page navigation to ensure the config is available
 */
export async function setupCIAuth(page: Page): Promise<void> {
  // Always log CI auth status in CI environment
  if (process.env.CI) {
    console.log('[CI Auth] Environment check:', {
      CI: process.env.CI,
      CI_BYPASS_SECRET: process.env.CI_BYPASS_SECRET ? 'SET' : 'NOT SET',
      CI_BYPASS_SECRET_LENGTH: process.env.CI_BYPASS_SECRET?.length || 0,
      GITHUB_RUN_ID: process.env.GITHUB_RUN_ID || 'not set',
      TEST_GROUP: process.env.TEST_GROUP || 'not set'
    });
  }

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

  // Log token generation in CI
  if (process.env.CI) {
    console.log('[CI Auth] Token generated:', {
      tokenLength: ciAuthToken.length,
      tokenGenerated: true,
      testGroup,
      runId
    });
  }

  // Inject configuration into the page before navigation
  await page.addInitScript((config) => {
    // Use a properly typed window extension
    interface CIWindow extends Window {
      __ABLY_CLI_CI_MODE__?: string;
      __ABLY_CLI_CI_AUTH_TOKEN__?: string;
      __ABLY_CLI_TEST_GROUP__?: string;
      __ABLY_CLI_RUN_ID__?: string;
      __ABLY_CLI_WEBSOCKET_URL__?: string;
      __VERBOSE_TESTS?: string;
    }
    const win = window as CIWindow;
    
    win.__ABLY_CLI_CI_MODE__ = config.ciMode;
    win.__ABLY_CLI_CI_AUTH_TOKEN__ = config.ciAuthToken;
    win.__ABLY_CLI_TEST_GROUP__ = config.testGroup;
    win.__ABLY_CLI_RUN_ID__ = config.runId;
    win.__ABLY_CLI_WEBSOCKET_URL__ = config.websocketUrl;
    win.__VERBOSE_TESTS = config.verboseTests;
    
    // Always log in CI to debug auth issues
    if (win.__VERBOSE_TESTS || config.ciMode === 'true') {
      console.log('[CI Auth] Configuration injected', {
        mode: config.ciMode,
        testGroup: config.testGroup,
        runId: config.runId,
        websocketUrl: config.websocketUrl,
        hasToken: !!config.ciAuthToken,
        tokenLength: config.ciAuthToken ? config.ciAuthToken.length : 0
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
    // Use a properly typed window extension
    interface CIWindow extends Window {
      __ABLY_CLI_CI_MODE__?: string;
      __ABLY_CLI_CI_AUTH_TOKEN__?: string;
      __VERBOSE_TESTS?: string;
    }
    const win = window as CIWindow;
    
    win.__ABLY_CLI_CI_MODE__ = 'false';
    win.__ABLY_CLI_CI_AUTH_TOKEN__ = undefined;
    if (win.__VERBOSE_TESTS) {
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