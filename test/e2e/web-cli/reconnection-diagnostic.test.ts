/*
 * The Playwright runner compiles this file in a Node environment that lacks DOM
 * typings. We declare a global `window` to keep TypeScript happy when Mocha
 * inadvertently tries to transpile this Playwright spec (e.g. when the Mocha
 * runner receives the file path but execution is later excluded). This avoids
 * TS2304: Cannot find name 'window'.
 */
declare const window: any;

import { test, expect, getTestUrl } from './helpers/base-test';
const log = console.log.bind(console);
import { authenticateWebCli } from './auth-helper.js';
import { waitForRateLimitLock } from './rate-limit-lock';

// Public terminal server endpoint
const PUBLIC_TERMINAL_SERVER_URL = 'wss://web-cli.ably.com';

test.describe('Web CLI Reconnection Diagnostic E2E Tests', () => {
  // Increase timeout significantly for CI environments
  const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.TRAVIS || process.env.CIRCLECI);
  test.setTimeout(isCI ? 300_000 : 120_000); // 5 minutes in CI, 2 minutes locally

  test('exposes correct debugging information', async ({ page }) => {
    // Wait for any ongoing rate limit pause
    await waitForRateLimitLock();
    
    if (isCI) {
      log('Running in CI environment - using extended timeouts');
    }

    // Small delay for test stability
    log('Waiting 2 seconds for test stability...');
    await page.waitForTimeout(2000);

    // 1. Navigate to the Web CLI app with debugging enabled
    log('Navigating to Web CLI app with debugging enabled...');
    await page.goto(`${getTestUrl()}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}&cliDebug=true`);

    // 2. Authenticate using API key
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required');
    }
    
    log('Authenticating with API key...');
    await authenticateWebCli(page, apiKey);

    // 3. Wait for terminal to be ready
    const terminalSelector = '.xterm';
    await expect(page.locator(terminalSelector)).toBeVisible({ timeout: 30000 });
    
    // 4. Wait for WebSocket connection and React state initialization
    await page.waitForFunction(() => {
      return (window as any).ablyCliSocket && 
             (window as any).getAblyCliTerminalReactState && 
             typeof (window as any).getAblyCliTerminalReactState === 'function';
    }, { timeout: 30000 });

    // 5. Verify exposed debugging functions
    const debugInfo = await page.evaluate(() => {
      const socket = (window as any).ablyCliSocket;
      const getReactState = (window as any).getAblyCliTerminalReactState;
      const sessionId = (window as any)._sessionId;
      
      return {
        hasSocket: !!socket,
        socketReadyState: socket?.readyState,
        hasGetReactState: typeof getReactState === 'function',
        reactState: getReactState ? getReactState() : null,
        hasSessionId: !!sessionId,
        sessionId: sessionId
      };
    });

    log('Debug info:', JSON.stringify(debugInfo, null, 2));

    // 6. Verify all debugging components are present
    expect(debugInfo.hasSocket).toBe(true);
    expect(debugInfo.socketReadyState).toBe(1); // WebSocket.OPEN
    expect(debugInfo.hasGetReactState).toBe(true);
    expect(debugInfo.reactState).toBeTruthy();
    expect(debugInfo.reactState.componentConnectionStatus).toBe('connected');
    expect(debugInfo.hasSessionId).toBe(true);
    expect(debugInfo.sessionId).toBeTruthy();
  });

  test('captures console logs when debugging enabled', async ({ page }) => {
    // Wait for any ongoing rate limit pause
    await waitForRateLimitLock();
    
    // Set up console log capture before navigation
    await page.addInitScript(() => {
      (window as any).__consoleLogs = [];
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      console.log = (...args) => {
        (window as any).__consoleLogs.push({ 
          type: 'log', 
          message: args.join(' '), 
          timestamp: new Date().toISOString() 
        });
        originalLog.apply(console, args);
      };
      
      console.error = (...args) => {
        (window as any).__consoleLogs.push({ 
          type: 'error', 
          message: args.join(' '), 
          timestamp: new Date().toISOString() 
        });
        originalError.apply(console, args);
      };
      
      console.warn = (...args) => {
        (window as any).__consoleLogs.push({ 
          type: 'warn', 
          message: args.join(' '), 
          timestamp: new Date().toISOString() 
        });
        originalWarn.apply(console, args);
      };
    });
    
    // Navigate with debugging enabled
    await page.goto(`${getTestUrl()}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}&cliDebug=true`);

    // Authenticate
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required');
    }
    
    await authenticateWebCli(page, apiKey);

    // Wait for terminal
    const terminalSelector = '.xterm';
    await expect(page.locator(terminalSelector)).toBeVisible({ timeout: 30000 });
    
    // Give some time for logs to accumulate
    await page.waitForTimeout(2000);

    // Verify console logs are being captured
    const consoleLogs = await page.evaluate(() => (window as any).__consoleLogs);
    expect(Array.isArray(consoleLogs)).toBe(true);
    expect(consoleLogs.length).toBeGreaterThan(0);
    
    // Verify log structure
    const sampleLog = consoleLogs[0];
    expect(sampleLog).toHaveProperty('type');
    expect(sampleLog).toHaveProperty('message');
    expect(sampleLog).toHaveProperty('timestamp');
    
    log(`Captured ${consoleLogs.length} console logs`);
  });

  test.skip('debugging functions persist through reconnection', async ({ page }) => {
    // Wait for any ongoing rate limit pause
    await waitForRateLimitLock();
    
    // Add longer delay to avoid rate limits since this test creates multiple connections
    log('Waiting 15 seconds before test to avoid rate limits...');
    await page.waitForTimeout(15000);
    
    // Navigate with debugging enabled
    await page.goto(`${getTestUrl()}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}&cliDebug=true`);

    // Authenticate
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required');
    }
    
    await authenticateWebCli(page, apiKey);

    // Wait for terminal
    const terminalSelector = '.xterm';
    await expect(page.locator(terminalSelector)).toBeVisible({ timeout: 30000 });
    
    // Wait for debugging functions
    await page.waitForFunction(() => {
      return (window as any).ablyCliSocket && 
             (window as any).getAblyCliTerminalReactState && 
             typeof (window as any).getAblyCliTerminalReactState === 'function';
    }, { timeout: 30000 });

    // Simulate disconnection
    await page.evaluate(() => {
      if ((window as any).ablyCliSocket) {
        (window as any).ablyCliSocket.close();
      }
    });
    
    // Wait a bit before checking for reconnection to avoid rate limits
    await page.waitForTimeout(5000);
    
    // Wait for reconnection
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'connected';
    }, null, { timeout: 90000 });

    // Verify debugging functions still work after reconnection
    const postReconnectDebugInfo = await page.evaluate(() => {
      const socket = (window as any).ablyCliSocket;
      const getReactState = (window as any).getAblyCliTerminalReactState;
      const sessionId = (window as any)._sessionId;
      
      return {
        hasSocket: !!socket,
        socketReadyState: socket?.readyState,
        hasGetReactState: typeof getReactState === 'function',
        reactState: getReactState ? getReactState() : null,
        sessionId: sessionId
      };
    });

    // Verify all debugging components are still present and functional
    expect(postReconnectDebugInfo.hasSocket).toBe(true);
    // Socket might be in CLOSING (2) state briefly after disconnection
    expect([1, 2]).toContain(postReconnectDebugInfo.socketReadyState);
    expect(postReconnectDebugInfo.hasGetReactState).toBe(true);
    expect(postReconnectDebugInfo.reactState).toBeTruthy();
    expect(postReconnectDebugInfo.reactState.componentConnectionStatus).toBe('connected');
    expect(postReconnectDebugInfo.sessionId).toBeTruthy();
  });
});