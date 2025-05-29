/*
 * The Playwright runner compiles this file in a Node environment that lacks DOM
 * typings. We declare a global `window` to keep TypeScript happy when Mocha
 * inadvertently tries to transpile this Playwright spec (e.g. when the Mocha
 * runner receives the file path but execution is later excluded). This avoids
 * TS2304: Cannot find name 'window'.
 */
declare const window: any;

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

test.describe('Web CLI Reconnection Diagnostic E2E Tests', () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    console.log('Setting up Web CLI Reconnection Diagnostic E2E tests...');

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
    console.log('Tearing down Web CLI Reconnection Diagnostic E2E tests...');
    webServerProcess?.kill('SIGTERM');
    console.log('Web server stopped.');
  });

  test.beforeEach(async ({ page }) => {
    // Install diagnostic hooks for monitoring connection state
    await page.addInitScript(() => {
      (window as any).__diagnosticData = {
        connectionEvents: [],
        statusChanges: [],
        wsEvents: [],
      };

      // Hook into connection status changes
      (window as any).__logConnectionEvent = (event: string, data?: any) => {
        (window as any).__diagnosticData.connectionEvents.push({
          timestamp: Date.now(),
          event,
          data,
        });
      };
    });
  });

  test('can diagnose connection behavior against public server', async ({ page }) => {
    const pageUrl = `http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`;
    await page.goto(pageUrl);

    // Wait for initial connection
    await page.waitForSelector('.xterm', { timeout: 30000 });
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });

    // Test basic functionality
    await page.locator('.xterm').focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(page.locator('.xterm')).toContainText('browser-based CLI', { timeout: 30000 });

    // Collect diagnostic data
    const diagnosticData = await page.evaluate(() => (window as any).__diagnosticData);
    expect(diagnosticData.connectionEvents.length).toBeGreaterThan(0);

    console.log('Connection diagnostic data:', diagnosticData);
  });

  test('connection state transitions work correctly with public server', async ({ page }) => {
    const pageUrl = `http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`;
    await page.goto(pageUrl);

    // Track status changes
    const statusChanges: string[] = [];
    await page.exposeFunction('recordStatusChange', (status: string) => {
      statusChanges.push(status);
      console.log(`Status change: ${status}`);
    });

    // Inject status monitoring
    await page.evaluate(() => {
      const originalState = (window as any).getAblyCliTerminalReactState;
      if (originalState) {
        let lastStatus = '';
        setInterval(() => {
          const state = originalState();
          if (state && state.componentConnectionStatus !== lastStatus) {
            lastStatus = state.componentConnectionStatus;
            (window as any).recordStatusChange(lastStatus);
          }
        }, 100);
      }
    });

    // Wait for connection and verify initial state
    await page.waitForSelector('.xterm', { timeout: 30000 });
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });

    // Wait a bit to collect status changes
    await page.waitForTimeout(2000);

    // Verify we captured the connection process
    expect(statusChanges.length).toBeGreaterThan(0);
    expect(statusChanges).toContain('connected');
  });
}); 