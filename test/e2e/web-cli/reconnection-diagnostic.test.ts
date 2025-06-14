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
import { navigateAndAuthenticate } from './auth-helper.js';

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
  // Increase timeout significantly for CI environments
  const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.TRAVIS || process.env.CIRCLECI);
  test.setTimeout(isCI ? 300_000 : 120_000); // 5 minutes in CI, 2 minutes locally

  test.beforeAll(async () => {
    console.log('Setting up Web CLI Reconnection Diagnostic E2E tests...');
    
    if (isCI) {
      console.log('Running in CI environment - using extended timeouts');
    }

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
    await navigateAndAuthenticate(page, pageUrl);
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });

    // Test basic functionality
    await page.locator('.xterm').focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(page.locator('.xterm')).toContainText('browser-based CLI', { timeout: 30000 });

    // Collect actual React state as diagnostic data
    const reactState = await page.evaluate(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s || {};
    });
    
    // Verify connection state is available
    expect(reactState.componentConnectionStatus).toBe('connected');
    console.log('Connection diagnostic data:', reactState);
  });

  test('connection state transitions work correctly with public server', async ({ page }) => {
    const pageUrl = `http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`;
    await navigateAndAuthenticate(page, pageUrl);

    // Track status changes by polling React state
    const statusChanges: string[] = [];
    let lastStatus = '';
    
    // Wait for connection to fully establish first
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
    }, null, { timeout: 60_000 });
    
    // Now poll for status changes for a longer period to capture transitions
    const pollInterval = setInterval(async () => {
      try {
        const currentStatus = await page.evaluate(() => {
          const s = (window as any).getAblyCliTerminalReactState?.();
          return s?.componentConnectionStatus || 'initial';
        });
        
        if (currentStatus !== lastStatus) {
          statusChanges.push(currentStatus);
          lastStatus = currentStatus;
        }
      } catch {
        // Ignore evaluation errors
      }
    }, 200);

    // Monitor for 8 seconds to capture state transitions
    await new Promise(resolve => setTimeout(resolve, 8000));
    clearInterval(pollInterval);

    // Verify we captured the connection process
    expect(statusChanges.length).toBeGreaterThan(0);
    // Since we wait for connected state first, it should be captured
    expect(statusChanges).toContain('connected');
  });
}); 