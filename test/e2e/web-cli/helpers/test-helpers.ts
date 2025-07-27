import { Page } from 'playwright/test';

// Helper to suppress console output unless tests fail
let consoleMessages: Array<{ type: string; text: string; time: Date }> = [];
let isTestFailing = false;

export function setupConsoleCapture(page: Page): void {
  consoleMessages = [];
  
  page.on('console', msg => {
    const entry = {
      type: msg.type(),
      text: msg.text(),
      time: new Date(),
    };
    consoleMessages.push(entry);
    
    // Only output immediately if verbose mode
    if (process.env.VERBOSE_TESTS) {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    } else if (!process.env.CI && msg.type() === 'error') {
      // In non-CI environments, still show errors
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    }
  });
  
  page.on('pageerror', error => {
    // Only log page errors that aren't rate limiting in CI
    if (!process.env.CI || !error.message?.includes('429') || process.env.VERBOSE_TESTS) {
      console.error('[Page Error]', error);
    }
    isTestFailing = true;
  });
}

export function dumpConsoleOnFailure(): void {
  if (isTestFailing && consoleMessages.length > 0) {
    console.log('\n=== Browser Console Output (Test Failed) ===');
    consoleMessages.forEach(msg => {
      console.log(`[${msg.time.toISOString()}] [${msg.type}] ${msg.text}`);
    });
    console.log('===========================================\n');
  }
  consoleMessages = [];
  isTestFailing = false;
}

export function markTestAsFailing(): void {
  isTestFailing = true;
}

// Helper to get the base URL from environment
export function getTestUrl(): string {
  const baseUrl = process.env.WEB_CLI_TEST_URL;
  if (!baseUrl) {
    throw new Error('WEB_CLI_TEST_URL not set. Is the global setup running?');
  }
  
  // If a custom terminal server URL is set, append it as a query param
  const terminalServerUrl = process.env.TERMINAL_SERVER_URL;
  if (terminalServerUrl) {
    const url = new URL(baseUrl);
    url.searchParams.set('serverUrl', terminalServerUrl);
    return url.toString();
  }
  
  return baseUrl;
}

// Helper to build URL with query params
export function buildTestUrl(params?: Record<string, string>): string {
  const url = new URL(getTestUrl());
  // Always clear credentials in tests to ensure consistent state
  url.searchParams.set('clearCredentials', 'true');
  
  // Use custom terminal server URL if provided
  const terminalServerUrl = process.env.TERMINAL_SERVER_URL;
  if (terminalServerUrl) {
    url.searchParams.set('serverUrl', terminalServerUrl);
  }
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
}

// Helper to track reload connections
export async function reloadPageWithRateLimit(page: Page): Promise<void> {
  const { incrementConnectionCount, waitForRateLimitIfNeeded } = await import('../test-rate-limiter');
  const { waitForRateLimitLock } = await import('../rate-limit-lock');
  
  // ALWAYS wait for any ongoing rate limit pause before proceeding
  await waitForRateLimitLock();
  
  // Check if the page will auto-connect after reload (has credentials or apiKey in URL)
  const currentUrl = page.url();
  const willAutoConnect = currentUrl.includes('apiKey=') || 
    await page.evaluate(() => {
      return !!(sessionStorage.getItem('ably.web-cli.apiKey') || localStorage.getItem('ably.web-cli.apiKey'));
    });
  
  if (willAutoConnect) {
    await waitForRateLimitIfNeeded();
    incrementConnectionCount();
  }
  
  await page.reload();
}

// Quiet console log that only outputs in verbose mode
export function log(...args: unknown[]): void {
  if (process.env.VERBOSE_TESTS) {
    console.log(...args);
  }
}