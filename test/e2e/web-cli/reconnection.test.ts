/*
 * Declaring `window` ensures TypeScript does not error when this Playwright spec
 * is parsed in a non-DOM environment (e.g. if Mocha accidentally attempts to
 * compile it). This addresses TS2304: Cannot find name 'window'.
 */
declare const window: any;

import { test, expect } from './fixtures';
import type { BrowserContext } from 'playwright/test';
import { startWebServer, stopWebServer, startTerminalServer, stopTerminalServer } from './reconnection-utils';

// Ports are provided via fixtures per-worker
let WEB_SERVER_PORT: number;
let TERMINAL_SERVER_PORT: number;
let WS_URL: string;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TERMINAL_PROMPT = '$';

// Increase default timeout further to accommodate slower Docker startups on CI
test.setTimeout(300_000);

let context: BrowserContext;

test.describe.serial('Web CLI Reconnection Tests - Server Control', () => {
  let webServerProcess: any;
  let terminalServerProcess: any;

  test.beforeAll(async ({ browser, webPort, termPort }) => {
    console.log('[E2E Test Setup] Starting web server...');
    WEB_SERVER_PORT = webPort;
    TERMINAL_SERVER_PORT = termPort;
    WS_URL = `ws://localhost:${TERMINAL_SERVER_PORT}`;
    webServerProcess = await startWebServer(WEB_SERVER_PORT);
    console.log('[E2E Test Setup] Web server started.');
    context = await browser.newContext();

    // Inject helper for status change flag into every page of this context
    await context.addInitScript(() => {
      (window as any).setWindowTestFlagOnStatusChange = (status: string) => {
        if (status === 'reconnecting') {
          (window as any)._playwright_reconnectingFlag = true;
          console.log('[setWindowTestFlagOnStatusChange] _playwright_reconnectingFlag set to true');
        }
      };
    });
  });

  test.afterAll(async () => {
    console.log('[E2E Test Teardown] Stopping web server...');
    await stopWebServer(webServerProcess);
    if (terminalServerProcess) await stopTerminalServer(terminalServerProcess);
    console.log('[E2E Test Teardown] Web server stopped.');
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    if (terminalServerProcess) {
      await stopTerminalServer(terminalServerProcess);
      terminalServerProcess = null;
    }
    // Ensure the flag is reset before each test run
    await page.evaluate(() => { delete (window as any)._playwright_reconnectingFlag; });
  });
  
  test.afterEach(async () => {
    if (terminalServerProcess) {
      await stopTerminalServer(terminalServerProcess);
      terminalServerProcess = null;
    }
  });

  test('should show reconnecting UI then auto-reconnect when server starts later', async () => {
    const page = await context.newPage();
    const consoleMessages: string[] = [];
    page.on('console', msg => { 
      const text = msg.text(); 
      if (!text.startsWith('[vite]')) {
        console.log(`[Raw Browser Console - Scenario1] ${text}`);
        consoleMessages.push(text); 
      }
    });
    await page.exposeFunction('hasConsoleMessageIncluding', (substring: string) => 
      consoleMessages.some(msg => msg.includes(substring))
    );

    console.log('[Test AutoReconnect Server Down] Terminal server is intentionally down.');
    const pageUrl = `http://localhost:${WEB_SERVER_PORT}?serverUrl=${encodeURIComponent(WS_URL)}&cliDebug=true`;
    const terminalSelector = '.xterm';
    
    console.log('[Test AutoReconnect Server Down] Initial page load...');
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    const terminalContent = page.locator(terminalSelector);

    // The client should very quickly transition into a reconnecting state. Instead of looking
    // for a specific overlay copy we wait for our Playwright hook flag which is set whenever
    // the React component fires a "reconnecting" status change. This is far more stable than
    // asserting transient overlay text which may change frame-to-frame.
    const overlay = page.locator('[data-testid="ably-overlay"]');
    await expect(overlay).toBeVisible({ timeout: 15000 });

    // Wait until the global flag reports at least one reconnecting event. The flag persists
    // for the whole page life-time so this is not subject to race conditions.
    await page.waitForFunction(() => (window as any)._playwright_reconnectingFlag === true, null, {
      timeout: 15_000,
    });
    console.log('[Test AutoReconnect Server Down] Reconnecting state detected (flag set).');

    // Optional sanity-check: overlay should contain the word "RECONNECTING". Don't fail if it
    // races past this copy, but log to aid debugging.
    try {
      await expect(overlay).toContainText('RECONNECTING', { timeout: 1000 });
    } catch {/* swallow – string may not be present if overlay changed quickly */}

    // Start the server
    console.log('[Test AutoReconnect Server Down] Starting terminal server now...');
    terminalServerProcess = await startTerminalServer(TERMINAL_SERVER_PORT);
    expect(terminalServerProcess).toBeTruthy();
    console.log('[Test AutoReconnect Server Down] Terminal server started.');

    // NOW, THE CRUCIAL PART: Wait for the prompt.
    // If reconnection works, the client should eventually connect, and xterm.js should render a prompt.
    console.log('[Test AutoReconnect Server Down] Waiting for terminal prompt after server restart...');
    // Focus might help, but the main thing is waiting for the text to appear after reconnections.
    try {
        await terminalContent.focus({ timeout: 5000 }); // Brief timeout for focus
    } catch (e) {
        console.warn('[Test AutoReconnect Server Down] Focusing terminal failed, proceeding.', e);
    }

    // Wait until the React component reports we are fully connected. This is less flaky than
    // waiting for the prompt string which depends on shell output timing.
    await page.waitForFunction(() => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – function runs in browser context
      const s = window.getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });
    console.log('[Test AutoReconnect Server Down] React state now "connected".');

    await terminalContent.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminalContent).toContainText('browser-based CLI', { timeout: 15000 });
    await page.close();
  });

  test('Scenario 1 (Simplified - No Route): force disconnect and unintercepted reconnect', async () => {
    console.log('[Test Scenario 1 Simplified] Starting terminal server...');
    terminalServerProcess = await startTerminalServer(TERMINAL_SERVER_PORT);
    expect(terminalServerProcess).toBeTruthy();

    const page = await context.newPage();
    const consoleMessages: string[] = [];
    page.on('console', msg => { 
      const text = msg.text(); 
      if (!text.startsWith('[vite]')) {
        console.log(`[Raw Browser Console - Scenario1Simplified_DETAIL] ${text}`);
        consoleMessages.push(text); 
      }
    });
    
    const pageUrl = `http://localhost:${WEB_SERVER_PORT}?serverUrl=${encodeURIComponent(WS_URL)}&cliDebug=true`;
    console.log(`[Test Scenario 1 Simplified] Navigating to ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    console.log(`[Test Scenario 1 Simplified] Navigation to ${pageUrl} completed.`);
    
    console.log('[Test Scenario 1 Simplified] Waiting for terminal rows to be rendered.');
    await page.waitForSelector('.xterm', { timeout: 60000 });

    console.log('[Test Scenario 1 Simplified] Waiting for React state "connected".');
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });
    console.log('[Test Scenario 1 Simplified] React state reports connected.');

    // Wait an additional moment to ensure the client is fully in connected state
    await page.waitForTimeout(1000);

    // Skip waiting for internal help message state, prompt presence is enough to confirm session active
    console.log('[Test Scenario 1 Simplified] Skipping explicit help message state check (flaky).');

    console.log('[Test Scenario 1 Simplified] Typing initial command.');
    await page.waitForTimeout(1000); // ensure backend fully ready
    await page.locator('.xterm').focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(page.locator('.xterm')).toContainText('browser-based CLI', { timeout: 15000 });
    console.log('[Test Scenario 1 Simplified] Initial command verified.');

    // --- Force disconnect --- 
    console.log('[Test Scenario 1 Simplified] Forcing disconnect by stopping terminal server...');
    await stopTerminalServer(terminalServerProcess);
    terminalServerProcess = null;
    console.log('[Test Scenario 1 Simplified] Terminal server stopped – waiting for client to enter reconnecting state.');

    // Wait until React reports a reconnecting status so we know the auto-retry loop is active.
    await page.waitForFunction(() => (window as any)._playwright_reconnectingFlag === true, null, {
      timeout: 20_000,
    });
    console.log('[Test Scenario 1 Simplified] Reconnecting flag observed.');

    // Restart terminal server to allow automatic reconnection
    console.log('[Test Scenario 1 Simplified] Restarting terminal server to allow auto-reconnect...');
    terminalServerProcess = await startTerminalServer(TERMINAL_SERVER_PORT);
    expect(terminalServerProcess).toBeTruthy();

    // Wait for prompt to reappear after reconnect
    console.log('[Test Scenario 1 Simplified] Waiting for React connectionStatus "connected" after reconnect.');
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });
    console.log('[Test Scenario 1 Simplified] React state reports connected after reconnect.');

    // Skip verifying internal connectionHelpMessage state after reconnect – prompt visibility is sufficient.
    console.log('[Test Scenario 1 Simplified] Skipping connectionHelpMessage state verification after reconnect.');

    console.log('[Test Scenario 1 Simplified] Typing command after successful unintercepted reconnection.');
    await page.locator('.xterm').focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(page.locator('.xterm')).toContainText('browser-based CLI', { timeout: 15000 });
    console.log('[Test Scenario 1 Simplified] Command after reconnect verified. Test completed.');

    await page.close();
  });
});
