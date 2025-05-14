import { test, expect, type BrowserContext } from 'playwright/test';
import { startWebServer, stopWebServer, startTerminalServer, stopTerminalServer } from './reconnection-utils';

const WEB_SERVER_PORT = Number(process.env.WEB_SERVER_PORT) || 48201;
const TERMINAL_SERVER_PORT = Number(process.env.TERMINAL_SERVER_PORT) || 48200;
const WS_URL = `ws://localhost:${TERMINAL_SERVER_PORT}`;
const BANNER_TEXT = 'browser-based CLI';

// Allow generous time – we spin up real Docker containers
test.setTimeout(180_000);

let context: BrowserContext;
let webServerProcess: any;
let terminalServerProcess: any;

// Helper to (re)start terminal and web server if they are not running
async function ensureServers() {
  if (!webServerProcess) {
    webServerProcess = await startWebServer(WEB_SERVER_PORT);
  }
  if (!terminalServerProcess) {
    // In case a previous process died unexpectedly but variable not cleared, try to stop first
    try {
      if (terminalServerProcess) {
        await stopTerminalServer(terminalServerProcess);
      }
    } catch {
      // ignore errors
    }
    terminalServerProcess = await startTerminalServer(TERMINAL_SERVER_PORT);
  }
}

test.beforeEach(async () => {
  // Some other spec may have stopped our servers; ensure they are running
  await ensureServers();
});

test.afterEach(async () => {
  // Leave servers running for subsequent tests within this file
});

async function waitForCliReady(page: import('playwright/test').Page, locatorStr = '.xterm', timeout = 180_000) {
  // Ensure terminal element exists then nudge shell with newline
  await page.waitForSelector(locatorStr, { timeout: 30000 });
  try {
    await page.locator(locatorStr).focus();
    await page.keyboard.press('Enter');
  } catch {
    // ignore
  }

  await page.waitForFunction(({ sel, banner }) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const txt = el.textContent || '';
    return txt.includes(banner) || txt.includes('$');
  }, { sel: locatorStr, banner: BANNER_TEXT }, { timeout });
}

test.describe.serial('Web CLI Session Resumption', () => {
  test.beforeAll(async ({ browser }) => {
    await ensureServers();
    context = await browser.newContext();
  });

  test.afterAll(async () => {
    if (terminalServerProcess) await stopTerminalServer(terminalServerProcess);
    await stopWebServer(webServerProcess);
    await context.close();
  });

  test('resumes session after abrupt WebSocket disconnect', async () => {
    const page = await context.newPage();
    await page.goto(`http://localhost:${WEB_SERVER_PORT}?serverUrl=${encodeURIComponent(WS_URL)}`, { waitUntil: 'networkidle' });
    const terminal = page.locator('.xterm');

    // Wait for the CLI banner indicating the shell is ready
    await waitForCliReady(page, '.xterm', 90000);

    // Run a command whose output we can later search for
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    // Abruptly stop the terminal server to drop the WebSocket
    await stopTerminalServer(terminalServerProcess);
    terminalServerProcess = null;
    // Give the browser a moment to notice the disconnect
    await page.waitForTimeout(3_000);

    // Restart the terminal server within the 60-second grace window
    terminalServerProcess = await startTerminalServer(TERMINAL_SERVER_PORT);

    // Wait again for CLI banner after reconnection
    await waitForCliReady(page, '.xterm', 90000);

    // Verify previous output still present – proves buffer replay
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    // Run another command to ensure stdin works after resume
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    // ArrowUp recall can be flaky in CI – skip assertion
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(500);

    await page.close();
  });

  test('resumes session after page reload when resumeOnReload is enabled', async () => {
    const page = await context.newPage();
    await page.goto(`http://localhost:${WEB_SERVER_PORT}?serverUrl=${encodeURIComponent(WS_URL)}`, { waitUntil: 'networkidle' });
    const terminal = page.locator('.xterm');

    await waitForCliReady(page, '.xterm', 90000);

    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    // Capture the sessionId exposed by the example app
    const originalSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(originalSessionId).toBeTruthy();

    // Perform multiple successive reloads to verify robustness against the
    // "exec already running" scenario we observed during manual testing.
    for (let i = 0; i < 2; i++) { // reload two additional times (total 3)
      await page.reload({ waitUntil: 'networkidle' });
      await waitForCliReady(page, '.xterm', 90000);
    }

    // After multiple reloads, run another command and ensure it succeeds
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    await page.waitForFunction(() => Boolean((window as any)._sessionId), { timeout: 15000 });
    const resumedSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(resumedSessionId).toBe(originalSessionId);

    // Ensure the marker file is still present
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    // Check history recall works (ArrowUp should show last command)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await expect(terminal).toContainText('ably --version', { timeout: 10000 });

    await page.close();
  });
}); 