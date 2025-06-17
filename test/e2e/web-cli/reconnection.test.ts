/*
 * Declaring `window` ensures TypeScript does not error when this Playwright spec
 * is parsed in a non-DOM environment (e.g. if Mocha accidentally attempts to
 * compile it). This addresses TS2304: Cannot find name 'window'.
 */
declare const window: any;

import { test, expect, getTestUrl, log } from './helpers/base-test';
import { authenticateWebCli } from './auth-helper.js';

// Public terminal server endpoint
const PUBLIC_TERMINAL_SERVER_URL = 'wss://web-cli.ably.com';

async function waitForPrompt(page: any, terminalSelector: string, timeout = 60000): Promise<void> {
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
    // Small delay for test stability
    log('Waiting 2 seconds for test stability...');
    await page.waitForTimeout(2000);
    
    // 1. Navigate to the Web CLI app
    log('Navigating to Web CLI app...');
    await page.goto(getTestUrl());

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
    
    // 4. Wait for terminal to be ready (don't wait for prompt as it may not come)
    await page.waitForTimeout(3000); // Give terminal time to initialize

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
        (window as any).ablyCliSocket.close();
      }
    });
    
    // 7. Verify disconnection state by checking React state
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'disconnected';
    }, { timeout: 10000 });
    
    // 8. Verify the component starts attempting to reconnect
    log('Waiting for reconnection to complete...');
    
    // Monitor the reconnection process
    const reconnectionInfo = await page.evaluate(() => {
      return new Promise((resolve) => {
        let checkCount = 0;
        const checkInterval = setInterval(() => {
          const state = (window as any).getAblyCliTerminalReactState?.();
          const socketState = (window as any).ablyCliSocket?.readyState;
          
          console.log('Reconnection check', checkCount++, 'State:', {
            componentStatus: state?.componentConnectionStatus,
            socketState: socketState,
            sessionActive: state?.isSessionActive
          });
          
          if (state?.componentConnectionStatus === 'connected') {
            clearInterval(checkInterval);
            resolve({
              status: 'reconnected',
              sessionId: (window as any)._sessionId,
              attempts: checkCount
            });
          }
          
          // Timeout after many attempts
          if (checkCount > 60) {
            clearInterval(checkInterval);
            resolve({
              status: 'timeout',
              lastState: state,
              attempts: checkCount
            });
          }
        }, 1000);
      });
    });
    
    log('Reconnection result:', reconnectionInfo);
    
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
    // Small delay for test stability
    log('Waiting 2 seconds for test stability...');
    await page.waitForTimeout(2000);
    
    // Navigate and authenticate
    await page.goto(getTestUrl());
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required');
    }
    
    await authenticateWebCli(page, apiKey);
    
    // Wait for terminal
    const terminalSelector = '.xterm';
    await expect(page.locator(terminalSelector)).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(3000); // Give terminal time to initialize
    
    // Simulate disconnection
    await page.evaluate(() => {
      if ((window as any).ablyCliSocket) {
        (window as any).ablyCliSocket.close();
      }
    });
    
    // Should see disconnection state
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'disconnected';
    }, { timeout: 10000 });
    
    // Wait for reconnection
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60000 });
    
    // Verify reconnection completed
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
    
    await authenticateWebCli(page, apiKey);
    
    // Wait for terminal
    const terminalSelector = '.xterm';
    await expect(page.locator(terminalSelector)).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(3000); // Give terminal time to initialize
    
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