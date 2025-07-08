import { test, expect, getTestUrl, log, reloadPageWithRateLimit } from './helpers/base-test';
import { authenticateWebCli } from './auth-helper.js';
import { 
  waitForTerminalReady,
  waitForSessionActive,
  waitForTerminalStable,
  waitForTerminalOutput
} from './wait-helpers.js';

// Public terminal server endpoint
const PUBLIC_TERMINAL_SERVER_URL = 'wss://web-cli.ably.com';

// Removed _waitForPrompt - using wait helpers instead

test.describe('Session Resume E2E Tests', () => {
  test.setTimeout(120_000);

  test('connects to public server and can resume session after reconnection', async ({ page }) => {
    // Longer delay to avoid rate limits for session resume test
    log('Waiting 10 seconds before test to avoid rate limits...');
    await page.waitForTimeout(10000);
    
    // Get API key
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required');
    }
    
    await page.goto(`${getTestUrl()}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`, { waitUntil: 'networkidle' });
    
    // Authenticate first
    await authenticateWebCli(page, apiKey);
    
    const terminal = page.locator('.xterm');

    // Wait for terminal to be ready
    await waitForTerminalReady(page);
    await waitForSessionActive(page);
    await waitForTerminalStable(page);

    // Run a command whose output we can later search for
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('@ably/cli', { timeout: 30000 });

    // Simulate a WebSocket disconnection by closing it programmatically
    await page.evaluate(() => {
      // Use the same approach as reconnection test for consistency
      if ((window as any).ablyCliSocket) {
        (window as any).ablyCliSocket.close();
      }
    });

    // Wait for disconnection to be processed
    await waitForTerminalStable(page, 1000);

    // Wait for reconnection and CLI to be ready again
    await waitForSessionActive(page);
    await waitForTerminalStable(page);

    // Run another command to ensure the connection works after reconnection
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('@ably/cli', { timeout: 30000 });
  });

  test('preserves session across page reload when resumeOnReload is enabled', async ({ page }) => {
    await page.goto(`${getTestUrl()}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`, { waitUntil: 'networkidle' });
    await authenticateWebCli(page);
    const terminal = page.locator('.xterm');

    // Wait for terminal to be ready
    await waitForTerminalReady(page);
    await waitForSessionActive(page);
    await waitForTerminalStable(page);

    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('@ably/cli', { timeout: 30000 });

    // Capture the sessionId exposed by the example app
    const originalSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(originalSessionId).toBeTruthy();

    // Perform multiple successive reloads to verify robustness
    for (let i = 0; i < 2; i++) {
      await reloadPageWithRateLimit(page);
      // Wait for terminal to be ready
    await waitForTerminalReady(page);
    await waitForSessionActive(page);
    await waitForTerminalStable(page);
    }

    // After multiple reloads, run another command and ensure it succeeds
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('@ably/cli', { timeout: 30000 });

    await page.waitForFunction(() => Boolean((window as any)._sessionId), { timeout: 15000 });
    const resumedSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(resumedSessionId).toBe(originalSessionId);

    // Ensure the terminal still works
    await terminal.focus();
    await page.keyboard.type('echo "Session resumed successfully"');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('Session resumed successfully', { timeout: 30000 });
  });

  test('handles session timeout gracefully', async ({ page }) => {
    await page.goto(`${getTestUrl()}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`, { waitUntil: 'networkidle' });
    await authenticateWebCli(page);
    const terminal = page.locator('.xterm');

    // Wait for terminal to be ready
    // Wait for terminal to be ready
    await waitForTerminalReady(page);
    await waitForSessionActive(page);
    await waitForTerminalStable(page);

    // Run a command to establish session
    await terminal.focus();
    await page.keyboard.type('echo "Session established"');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('Session established', { timeout: 30000 });

    // Simulate session timeout by disconnecting for an extended period
    await page.evaluate(() => {
      // Use the same approach as reconnection test for consistency
      if ((window as any).ablyCliSocket) {
        (window as any).ablyCliSocket.close();
      }
    });

    // Wait for a longer period to simulate timeout
    await page.waitForTimeout(5000);

    // Check if the terminal shows a disconnection state
    const state = await page.evaluate(() => (window as any).getAblyCliTerminalReactState?.());
    log('State after disconnect:', state);

    // Terminal should eventually reconnect or show reconnection prompt
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state && (state.componentConnectionStatus === 'connected' || state.showManualReconnectPrompt);
    }, null, { timeout: 30000 });

    // If manual reconnect is needed, trigger it
    if (state?.showManualReconnectPrompt) {
      await page.keyboard.press('Enter');
      await waitForTerminalStable(page);
    }

    // Verify terminal functionality is restored
    // Wait for terminal to be ready
    await waitForTerminalReady(page);
    await waitForSessionActive(page);
    await waitForTerminalStable(page);
    await terminal.focus();
    await page.keyboard.type('echo "Connection restored"');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('Connection restored', { timeout: 30000 });
  });
});

// Re-export window declaration to ensure TypeScript compatibility
declare const window: any;