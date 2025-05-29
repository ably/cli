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

async function waitForPrompt(page: any, terminalSelector: string, timeout = 60000): Promise<void> {
  const promptText = '$';
  try {
    await page.locator(terminalSelector).getByText(promptText, { exact: true }).first().waitFor({ timeout });
    console.log('Terminal prompt found.');
  } catch (error) {
    console.error('Error waiting for terminal prompt:', error);
    console.log('--- Terminal Content on Prompt Timeout ---');
    try {
      const terminalContent = await page.locator(terminalSelector).textContent();
      console.log(terminalContent);
    } catch (logError) {
      console.error('Could not get terminal content after timeout:', logError);
    }
    console.log('-----------------------------------------');
    throw error;
  }
}

test.describe('Session Resume E2E Tests', () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    console.log('Setting up Session Resume E2E tests...');

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
    console.log('Tearing down Session Resume E2E tests...');
    webServerProcess?.kill('SIGTERM');
    console.log('Web server stopped.');
  });

  test('connects to public server and can resume session after reconnection', async ({ page }) => {
    await page.goto(`http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`, { waitUntil: 'networkidle' });
    const terminal = page.locator('.xterm');

    // Wait for the terminal prompt to appear
    await waitForPrompt(page, '.xterm', 90000);

    // Run a command whose output we can later search for
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    // Simulate a WebSocket disconnection by closing it programmatically
    await page.evaluate(() => {
      const activeConnections = (window as any).__activeWebSockets || [];
      activeConnections.forEach((ws: WebSocket) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(3000, 'Test disconnect');
        }
      });
    });

    // Give the browser a moment to notice the disconnect and attempt reconnection
    await page.waitForTimeout(3_000);

    // Wait for reconnection and CLI to be ready again
    await waitForPrompt(page, '.xterm', 90000);

    // Run another command to ensure the connection works after reconnection
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });
  });

  test('preserves session across page reload when resumeOnReload is enabled', async ({ page }) => {
    await page.goto(`http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`, { waitUntil: 'networkidle' });
    const terminal = page.locator('.xterm');

    await waitForPrompt(page, '.xterm', 90000);

    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    // Capture the sessionId exposed by the example app
    const originalSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(originalSessionId).toBeTruthy();

    // Perform multiple successive reloads to verify robustness
    for (let i = 0; i < 2; i++) {
      await page.reload({ waitUntil: 'networkidle' });
      await waitForPrompt(page, '.xterm', 90000);
    }

    // After multiple reloads, run another command and ensure it succeeds
    await terminal.focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    await page.waitForFunction(() => Boolean((window as any)._sessionId), { timeout: 15000 });
    const resumedSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(resumedSessionId).toBe(originalSessionId);

    // Ensure the terminal still works
    await expect(terminal).toContainText('browser-based CLI', { timeout: 30000 });

    // Check history recall works (ArrowUp should show last command)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await expect(terminal).toContainText('ably --version', { timeout: 10000 });
  });
}); 