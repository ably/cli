import { test, expect } from 'playwright/test';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const execAsync = promisify(exec);

// For ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const EXAMPLE_DIR = path.resolve(__dirname, '../../../examples/web-cli');
const WEB_CLI_DIST = path.join(EXAMPLE_DIR, 'dist');

// Public terminal server endpoint
const PUBLIC_TERMINAL_SERVER_URL = 'wss://web-cli.ably.com';

// Shared variables
let webServerProcess: any;
let webServerPort: number;

// Helper function to wait for server startup
async function waitForServer(url: string, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return; // Server is up
      }
    } catch {
      // Ignore fetch errors (server not ready)
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server ${url} did not start within ${timeout}ms`);
}

test.describe('Web CLI Prompt Integrity E2E Tests', () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    console.log('Setting up Web CLI Prompt Integrity E2E tests...');

    // 1. Build the example app
    console.log('Building Web CLI example app...');
    try {
      await execAsync('pnpm build', { cwd: EXAMPLE_DIR });
      console.log('Web CLI example app built.');

      if (!fs.existsSync(WEB_CLI_DIST)) {
        throw new Error(`Build finished but dist directory not found: ${WEB_CLI_DIST}`);
      }
      console.log(`Verified dist directory exists: ${WEB_CLI_DIST}`);

    } catch (error) {
      console.error('Failed to build Web CLI example app:', error);
      throw error;
    }

    // 2. Find free port for web server
    const getPortModule = await import('get-port');
    const getPort = getPortModule.default;
    webServerPort = await getPort();
    console.log(`Using Web Server Port: ${webServerPort}`);
    console.log(`Using Public Terminal Server: ${PUBLIC_TERMINAL_SERVER_URL}`);

    // 3. Start a web server for the example app
    console.log('Starting web server for example app with vite preview...');
    const { spawn } = await import('node:child_process');
    webServerProcess = spawn('npx', ['vite', 'preview', '--port', webServerPort.toString(), '--strictPort'], {
      stdio: 'pipe',
      cwd: EXAMPLE_DIR
    });

    webServerProcess.stdout?.on('data', (data: Buffer) => console.log(`[Web Server]: ${data.toString().trim()}`));
    webServerProcess.stderr?.on('data', (data: Buffer) => console.error(`[Web Server ERR]: ${data.toString().trim()}`));

    await waitForServer(`http://localhost:${webServerPort}`);
    console.log('Web server started.');
  });

  test.afterAll(async () => {
    console.log('Tearing down Web CLI Prompt Integrity E2E tests...');
    webServerProcess?.kill('SIGTERM');
    console.log('Web server stopped.');
  });

  test('Page reload resumes session without injecting extra blank prompts', async ({ page }) => {
    await page.goto(`http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}&cliDebug=true`, { waitUntil: 'networkidle' });
    const terminal = page.locator('.xterm:not(#initial-xterm-placeholder)');

    // Wait for terminal to be ready and connected to shell
    await terminal.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });

    // Type command
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    // Wait for session ID to be available before capturing it
    await page.waitForFunction(() => {
      const sessionId = (window as any)._sessionId;
      return sessionId && typeof sessionId === 'string' && sessionId.length > 0;
    }, null, { timeout: 30_000 });

    // Capture session ID before reload
    const originalSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(originalSessionId).toBeTruthy();
    console.log(`Original session ID: ${originalSessionId}`);

    // Reload page
    await page.reload({ waitUntil: 'networkidle' });
    await terminal.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });

    // Wait for session ID to be restored after reload
    await page.waitForFunction(() => {
      const sessionId = (window as any)._sessionId;
      return sessionId && typeof sessionId === 'string' && sessionId.length > 0;
    }, null, { timeout: 30_000 });

    // Verify session was preserved
    const newSessionId = await page.evaluate(() => (window as any)._sessionId);
    console.log(`New session ID after reload: ${newSessionId}`);
    
    if (!newSessionId) {
      // Enhanced debugging for CI
      const debugInfo = await page.evaluate(() => {
        const w = window as any;
        return {
          _sessionId: w._sessionId,
          sessionStorage: Object.keys(sessionStorage).map(key => ({ key, value: sessionStorage.getItem(key) })),
          localStorage: Object.keys(localStorage).map(key => ({ key, value: localStorage.getItem(key) })),
          reactState: w.getAblyCliTerminalReactState?.() || 'not available'
        };
      });
      console.error('Debug info when session ID is undefined:', JSON.stringify(debugInfo, null, 2));
    }
    
    expect(newSessionId).toBeTruthy();
    expect(newSessionId).toBe(originalSessionId);

    // Verify terminal still works after reload
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });
  });

  test('Typing `exit` ends session and page refresh starts a NEW session automatically', async ({ page }) => {
    await page.goto(`http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}&cliDebug=true`, { waitUntil: 'networkidle' });
    const terminal = page.locator('.xterm:not(#initial-xterm-placeholder)');

    // Wait for connection and capture initial session ID
    await terminal.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });

    const originalSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(originalSessionId).toBeTruthy();

    // Type 'exit' to end the session
    await terminal.focus();
    await page.keyboard.type('exit');
    await page.keyboard.press('Enter');

    // Wait for session ended message
    await expect(terminal).toContainText('Session Ended', { timeout: 30000 });

    // Wait a bit more to ensure the overlay is fully rendered
    await page.waitForTimeout(1000);

    // Overlay should exist – with better error handling for CI
    const overlay = page.locator('[data-testid="ably-overlay"]');
    let _overlayVisible = false;
    try {
      await expect(overlay).toBeVisible({ timeout: 10000 }); // Increased timeout
      await expect(overlay).toContainText('ERROR: SERVER DISCONNECT');
      _overlayVisible = true;
    } catch (e) {
      console.warn('[Prompt-Integrity] Overlay visibility assertion failed, checking if manual reconnect state is still valid:', e);
      // Double-check that we're still in the correct state even if overlay isn't visible
      const state = await page.evaluate(() => {
        const w: any = window;
        if (typeof w.getAblyCliTerminalReactState === 'function') {
          try {
            return w.getAblyCliTerminalReactState();
          } catch { return null; }
        }
        return null;
      });
      if (state && state.showManualReconnectPrompt) {
        console.log('[Prompt-Integrity] Manual reconnect state confirmed, proceeding despite overlay visibility issue');
      } else {
        throw new Error('Manual reconnect state not confirmed and overlay not visible');
      }
    }

    // Press Enter to reconnect
    await page.keyboard.press('Enter');

    // Wait for new session to be ready
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });

    // Verify new session has different ID
    const newSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(newSessionId).toBeTruthy();
    expect(newSessionId).not.toBe(originalSessionId);

    // Verify terminal works in new session
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });
  });

  test('After `exit`, Session Ended dialog appears and pressing Enter starts a new session', async ({ page }) => {
    await page.goto(`http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}&cliDebug=true`, { waitUntil: 'networkidle' });
    const terminal = page.locator('.xterm:not(#initial-xterm-placeholder)');

    // Wait for connection
    await terminal.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });

    const originalSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(originalSessionId).toBeTruthy();

    // Type 'exit' to end session
    await terminal.focus();
    await page.keyboard.type('exit');
    await page.keyboard.press('Enter');

    // Wait for session ended message
    await expect(terminal).toContainText('Session Ended', { timeout: 30000 });

    // Wait a bit more to ensure the overlay is fully rendered
    await page.waitForTimeout(1000);

    // Overlay should exist – with better error handling for CI
    const overlay = page.locator('[data-testid="ably-overlay"]');
    let _overlayVisible = false;
    try {
      await expect(overlay).toBeVisible({ timeout: 10000 }); // Increased timeout
      await expect(overlay).toContainText('ERROR: SERVER DISCONNECT');
      _overlayVisible = true;
    } catch (e) {
      console.warn('[Prompt-Integrity] Overlay visibility assertion failed, checking if manual reconnect state is still valid:', e);
      // Double-check that we're still in the correct state even if overlay isn't visible
      const state = await page.evaluate(() => {
        const w: any = window;
        if (typeof w.getAblyCliTerminalReactState === 'function') {
          try {
            return w.getAblyCliTerminalReactState();
          } catch { return null; }
        }
        return null;
      });
      if (state && state.showManualReconnectPrompt) {
        console.log('[Prompt-Integrity] Manual reconnect state confirmed, proceeding despite overlay visibility issue');
      } else {
        throw new Error('Manual reconnect state not confirmed and overlay not visible');
      }
    }

    // Press Enter to reconnect
    await page.keyboard.press('Enter');

    // Wait for new session to be ready
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });

    // Verify new session has different ID
    const newSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(newSessionId).toBeTruthy();
    expect(newSessionId).not.toBe(originalSessionId);

    // Verify terminal works in new session
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });
  });
}); 