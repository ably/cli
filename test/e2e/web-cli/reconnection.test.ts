/*
 * Declaring `window` ensures TypeScript does not error when this Playwright spec
 * is parsed in a non-DOM environment (e.g. if Mocha accidentally attempts to
 * compile it). This addresses TS2304: Cannot find name 'window'.
 */
declare const window: any;

import { test, expect, getTestUrl, log } from './helpers/base-test';
import { authenticateWebCli } from './auth-helper.js';
import { waitForTerminalReady } from './wait-helpers.js';

// Public terminal server endpoint
const PUBLIC_TERMINAL_SERVER_URL = 'wss://web-cli.ably.com';

async function _waitForPrompt(page: any, terminalSelector: string, timeout = 60000): Promise<void> {
  log('Waiting for terminal prompt...');
  
  // Alternative approach: wait for either the prompt text OR the connected status
  // This handles both cases where server sends status message or prompt appears
  try {
    await Promise.race([
      // Option 1: Wait for prompt text to appear
      page.waitForSelector(`${terminalSelector} >> text=/\\$/`, { timeout }),
      
      // Option 2: Wait for React component to report connected status
      page.waitForFunction(() => {
        const state = (window as any).getAblyCliTerminalReactState?.();
        return state?.componentConnectionStatus === 'connected' && state?.isSessionActive === true;
      }, null, { timeout })
    ]);
    
    log('Terminal is ready (prompt detected or connected status).');
    
    // Small delay to ensure terminal is fully ready
    await page.waitForTimeout(500);
    
  } catch (_error) {
    console.error('Terminal did not become ready within timeout.');
    
    // Get debug information
    const debugInfo = await page.evaluate(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      const socketStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
      const socketState = (window as any).ablyCliSocket?.readyState;
      const logs = (window as any).__consoleLogs || [];
      
      return {
        reactState: state,
        socketReadyState: socketState,
        socketStateText: socketStates[socketState] || 'UNKNOWN',
        sessionId: (window as any)._sessionId,
        hasStateFunction: typeof (window as any).getAblyCliTerminalReactState === 'function',
        recentConsoleLogs: logs.slice(-20)
      };
    });
    
    console.log('--- Terminal Debug Info ---');
    console.log('Debug state:', JSON.stringify(debugInfo, null, 2));
    
    const terminalContent = await page.locator(terminalSelector).textContent();
    console.log('Terminal content:', terminalContent?.slice(0, 500) || 'No content');
    console.log('-----------------------------------------');
    
    throw new Error(`Terminal not ready: ${debugInfo.reactState?.componentConnectionStatus || 'unknown state'}`);
  }
}

test.describe('Web CLI Reconnection E2E Tests', () => {
  // Increase timeout significantly for CI environments
  const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.TRAVIS || process.env.CIRCLECI);
  test.setTimeout(isCI ? 300_000 : 120_000); // 5 minutes in CI, 2 minutes locally

  test.beforeEach(() => {
    log('Using Public Terminal Server:', PUBLIC_TERMINAL_SERVER_URL);
    if (isCI) {
      log('Running in CI environment - using extended timeouts');
    }
  });

  test('should handle disconnection and reconnection gracefully', async ({ page }) => {
    // Enable console logging to see what's happening
    page.on('console', msg => {
      if (msg.type() === 'log' || msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[Browser ${msg.type()}] ${msg.text()}`);
      }
    });
    
    // Longer delay to avoid rate limits for reconnection test
    log('Waiting 10 seconds before test to avoid rate limits...');
    await page.waitForTimeout(10000);
    
    // 1. Navigate to the Web CLI app
    log('Navigating to Web CLI app...');
    await page.goto(getTestUrl());

    // 2. Authenticate using API key
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required');
    }
    
    log('Authenticating with API key...');
    await authenticateWebCli(page, apiKey); // Use default query param authentication

    // 3. Wait for terminal to be ready
    const terminalSelector = '.xterm';
    await expect(page.locator(terminalSelector)).toBeVisible({ timeout: 30000 });
    
    // 4. Wait for terminal to be ready using proper helper
    await waitForTerminalReady(page);
    
    // Additional delay to ensure terminal is fully connected
    log('Waiting 5 seconds for terminal to fully stabilize...');
    await page.waitForTimeout(5000);

    // 5. Type initial command to establish session state
    log('Testing initial terminal functionality...');
    await page.locator(terminalSelector).click();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    
    // Wait for command output
    await expect(page.locator(terminalSelector)).toContainText('@ably/cli/', { timeout: 15000 });

    // Capture the session ID from the page for debugging
    const sessionInfo = await page.evaluate(() => {
      return {
        sessionId: (window as any)._sessionId,
        connectionStatus: (window as any).getAblyCliTerminalReactState?.()?.componentConnectionStatus,
        socketState: (window as any).ablyCliSocket?.readyState
      };
    });
    log('Session info before disconnect:', sessionInfo);

    // 6. Simulate network disconnection
    log('Simulating network disconnection...');
    await page.evaluate(() => {
      // Force disconnect the WebSocket if available
      if ((window as any).ablyCliSocket) {
        // Calling close() without parameters simulates an unexpected disconnection
        // This will trigger a close event with code 1005 which should now
        // trigger automatic reconnection (not manual)
        (window as any).ablyCliSocket.close();
      }
    });
    
    // 7. Verify disconnection or reconnecting state
    log('Waiting for disconnection/reconnecting state...');
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      // Component might go directly to 'reconnecting' without stopping at 'disconnected'
      return state?.componentConnectionStatus === 'disconnected' || state?.componentConnectionStatus === 'reconnecting';
    }, { timeout: 10000 });
    log('Disconnection/reconnection initiated');
    
    // 8. Verify the component starts attempting to reconnect
    log('Waiting for reconnection to complete...');
    
    // First check if it shows manual reconnect prompt (which would be the bug)
    await page.waitForTimeout(2000); // Give it time to decide
    const requiresManualReconnect = await page.evaluate(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.showManualReconnectPrompt === true;
    });
    
    if (requiresManualReconnect) {
      throw new Error('Test failed: Terminal requires manual reconnection (Enter key) instead of automatically reconnecting. This is a bug!');
    }
    
    // Wait for automatic reconnection to complete
    log('Waiting for automatic reconnection...');
    
    // Simply wait for the connection status to become 'connected'
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'connected';
    }, { timeout: 30000 });
    
    // Give a moment for the session to stabilize
    log('Connection restored, waiting for session to stabilize...');
    await page.waitForTimeout(2000);
    
    // Get reconnection info for logging
    const reconnectionInfo = await page.evaluate(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return {
        status: 'reconnected',
        sessionId: (window as any)._sessionId,
        componentConnectionStatus: state?.componentConnectionStatus,
        isSessionActive: state?.isSessionActive
      };
    });
    
    log('Reconnection result:', reconnectionInfo);
    
    // Verify reconnection was successful
    expect(reconnectionInfo.status).toBe('reconnected');
    expect(reconnectionInfo.componentConnectionStatus).toBe('connected');
    expect(reconnectionInfo.isSessionActive).toBe(true);
    
    // 9. Verify reconnection succeeded and terminal is operational
    await expect(page.locator(terminalSelector)).toBeVisible();
    
    // Give terminal time to stabilize
    await page.waitForTimeout(2000);
    
    // 10. Test that terminal is functional after reconnection
    log('Testing terminal after reconnection...');
    await page.locator(terminalSelector).click();
    await page.keyboard.type('ably --help');
    await page.keyboard.press('Enter');
    
    // Verify command output appears
    await expect(page.locator(terminalSelector)).toContainText('COMMON COMMANDS', { timeout: 30000 });
    
    // 11. Verify session continuity - should see both commands
    const terminalText = await page.locator(terminalSelector).textContent();
    expect(terminalText).toContain('@ably/cli/');
    expect(terminalText).toContain('COMMON COMMANDS');
    
    log('Reconnection test completed successfully.');
  });

  test('should show reconnection status messages', async ({ page }) => {
    // Longer delay to avoid rate limits for reconnection test
    log('Waiting 10 seconds before test to avoid rate limits...');
    await page.waitForTimeout(10000);
    
    // Navigate and authenticate
    await page.goto(getTestUrl());
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required');
    }
    
    await authenticateWebCli(page, apiKey); // Use default query param authentication
    
    // Wait for terminal
    const terminalSelector = '.xterm';
    await expect(page.locator(terminalSelector)).toBeVisible({ timeout: 30000 });
    await waitForTerminalReady(page);
    
    // Additional delay to ensure terminal is fully connected
    log('Waiting 5 seconds for terminal to fully stabilize...');
    await page.waitForTimeout(5000);
    
    // Simulate disconnection
    await page.evaluate(() => {
      if ((window as any).ablyCliSocket) {
        (window as any).ablyCliSocket.close();
      }
    });
    
    // Should see disconnection or reconnecting state
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'disconnected' || state?.componentConnectionStatus === 'reconnecting';
    }, { timeout: 10000 });
    
    // Check disconnected or reconnecting status is shown to user
    // The status is in a nested span with class status-disconnected or status-reconnecting
    
    // Wait for either disconnected or reconnecting status to appear
    const statusVisible = await Promise.race([
      page.locator('.App-header span.status-disconnected').waitFor({ state: 'visible', timeout: 5000 }).then(() => 'disconnected'),
      page.locator('.App-header span.status-reconnecting').waitFor({ state: 'visible', timeout: 5000 }).then(() => 'reconnecting')
    ]).catch(() => null);
    
    if (!statusVisible) {
      throw new Error('Neither disconnected nor reconnecting status appeared');
    }
    
    // If we saw disconnected first, wait for reconnecting
    if (statusVisible === 'disconnected') {
      await expect(page.locator('.App-header span.status-reconnecting')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.App-header span.status-reconnecting')).toHaveText('reconnecting');
    } else {
      // Already in reconnecting state
      await expect(page.locator('.App-header span.status-reconnecting')).toHaveText('reconnecting');
    }
    
    // Wait for reconnection to complete
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60000 });
    
    // Verify connected status is shown to user
    await expect(page.locator('.App-header span.status-connected')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.App-header span.status-connected')).toHaveText('connected');
  });

  test('should handle disconnection gracefully', async ({ page }) => {
    // Small delay for test stability
    log('Waiting 2 seconds for test stability...');
    await page.waitForTimeout(2000);
    
    // Navigate and authenticate
    await page.goto(getTestUrl());
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required');
    }
    
    await authenticateWebCli(page, apiKey); // Use default query param authentication
    
    // Wait for terminal
    const terminalSelector = '.xterm';
    await expect(page.locator(terminalSelector)).toBeVisible({ timeout: 30000 });
    await waitForTerminalReady(page);
    
    // Additional delay to ensure terminal is fully connected
    log('Waiting 5 seconds for terminal to fully stabilize...');
    await page.waitForTimeout(5000);
    
    // Run initial command
    await page.locator(terminalSelector).click();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(page.locator(terminalSelector)).toContainText('@ably/cli/', { timeout: 15000 });
    
    // Simulate ONE disconnection and verify reconnection
    log('Simulating disconnection...');
    
    await page.evaluate(() => {
      if ((window as any).ablyCliSocket) {
        (window as any).ablyCliSocket.close();
      }
    });
    
    // Wait for reconnection
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60000 });
    
    log('Reconnection completed.');
    
    // Verify terminal still works after disconnection
    await page.locator(terminalSelector).click();
    await page.keyboard.type('ably --help');
    await page.keyboard.press('Enter');
    await expect(page.locator(terminalSelector)).toContainText('COMMON COMMANDS', { timeout: 30000 });
    
    // Session should be maintained
    const terminalText = await page.locator(terminalSelector).textContent();
    expect(terminalText).toContain('@ably/cli/');
    expect(terminalText).toContain('COMMON COMMANDS');
  });
});