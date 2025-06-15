/*
 * Declaring `window` ensures TypeScript does not error when this Playwright spec
 * is parsed in a non-DOM environment (e.g. if Mocha accidentally attempts to
 * compile it). This addresses TS2304: Cannot find name 'window'.
 */
declare const window: any;

import { test, expect } from 'playwright/test';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { authenticateWebCli } from './auth-helper.js';

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
  console.log('Waiting for terminal prompt...');
  
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
    
    console.log('Terminal is ready (prompt detected or connected status).');
    
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

  test.beforeAll(async () => {
    console.log('Setting up Web CLI Reconnection E2E tests...');
    
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
    console.log('Tearing down Web CLI Reconnection E2E tests...');
    webServerProcess?.kill('SIGTERM');
    console.log('Web server stopped.');
  });

  test.beforeEach(async ({ page }) => {
    // Install WebSocket interceptor for testing
    await page.addInitScript(() => {
      const originalWebSocket = window.WebSocket;
      const activeConnections: any[] = [];

      (window as any).__wsControl = {
        closeAll: () => {
          activeConnections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
              ws.close(3000, 'Test disconnect');
    }
  });
        },
        count: () => activeConnections.length,
      };

      class InterceptedWebSocket extends originalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          activeConnections.push(this);
          this.addEventListener('close', () => {
            const index = activeConnections.indexOf(this);
            if (index !== -1) activeConnections.splice(index, 1);
          });
      }
      }

      window.WebSocket = InterceptedWebSocket as any;
    });
  });

  test('connects to public server and handles client-side disconnection', async ({ page }) => {
    const pageUrl = `http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`;
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    await authenticateWebCli(page);

    // Wait for initial connection and prompt
    await waitForPrompt(page, '.xterm');

    // Verify initial connection works
    await page.locator('.xterm').focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(page.locator('.xterm')).toContainText('browser-based CLI', { timeout: 30000 });

    // Simulate client-side WebSocket disconnection
    const wsCount = await page.evaluate(() => (window as any).__wsControl.count());
    expect(wsCount).toBeGreaterThan(0);

    await page.evaluate(() => (window as any).__wsControl.closeAll());

    // Give some time for reconnection attempt
    await page.waitForTimeout(5000);

    // Check if manual reconnect is needed
    const state = await page.evaluate(() => (window as any).getAblyCliTerminalReactState?.());
    if (state?.componentConnectionStatus === 'disconnected' && state?.showManualReconnectPrompt) {
      console.log('Manual reconnect prompt shown, pressing Enter...');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Verify reconnection works
    await waitForPrompt(page, '.xterm');
    await page.locator('.xterm').focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(page.locator('.xterm')).toContainText('browser-based CLI', { timeout: 30000 });
  });

  test('handles multiple disconnections gracefully', async ({ page }) => {
    const pageUrl = `http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`;
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    await authenticateWebCli(page);
    await expect(page.locator('.xterm')).toContainText('ably', { timeout: 30000 });

    // Wait for prompt
    await page.waitForFunction(() => {
      const terminalElement = document.querySelector('.xterm');
      return terminalElement?.textContent?.includes('$');
    }, null, { timeout: 30000 });

    // Test multiple disconnection cycles - fewer cycles in CI due to network stability
    const maxCycles = isCI ? 2 : 3;
    const connectionTimeout = isCI ? 60000 : 30000; // Longer timeouts in CI
    const commandTimeout = isCI ? 30000 : 15000;
    
    for (let i = 0; i < maxCycles; i++) {
      console.log(`Testing disconnection cycle ${i + 1}/${maxCycles}`);
      
      // Disconnect by closing WebSocket connections
      await page.evaluate(() => {
        const activeConnections = (window as any).__activeWebSockets || [];
        activeConnections.forEach((ws: WebSocket) => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(3000, 'Test disconnect');
          }
        });
      });

      // Wait for reconnection to complete - look for a fresh terminal state
    await page.waitForFunction(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return s?.componentConnectionStatus === 'connected';
      }, null, { timeout: connectionTimeout });

      // Wait for the terminal to be ready for commands (look for prompt)
      await page.waitForFunction(() => {
        const terminalElement = document.querySelector('.xterm');
        const content = terminalElement?.textContent || '';
        // Look for the command prompt at the end of content
        return content.includes('$') && !content.includes('Reconnection attempts cancelled');
      }, null, { timeout: connectionTimeout });

      // Test that we can run commands after reconnection
      await page.locator('.xterm').click();
      await page.keyboard.type(`echo "test-${i + 1}"`);
      await page.keyboard.press('Enter');
      await expect(page.locator('.xterm')).toContainText(`test-${i + 1}`, { timeout: commandTimeout });
    }
  });

  test('preserves session across page reload', async ({ page }) => {
    const pageUrl = `http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`;
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    await authenticateWebCli(page);

    // Wait for initial connection
    await waitForPrompt(page, '.xterm');

    // Run a command to create some state
    await page.locator('.xterm').focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(page.locator('.xterm')).toContainText('browser-based CLI', { timeout: 30000 });

    // Get session ID before reload
    const originalSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(originalSessionId).toBeTruthy();

    // Reload the page
    await page.reload();
    await waitForPrompt(page, '.xterm');

    // Verify session was preserved
    const newSessionId = await page.evaluate(() => (window as any)._sessionId);
    expect(newSessionId).toBe(originalSessionId);

    // Verify the terminal still works
    await page.locator('.xterm').focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(page.locator('.xterm')).toContainText('browser-based CLI', { timeout: 30000 });
  });
});
