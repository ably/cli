import { test, expect, type Page as _Page, type Browser as _Browser } from 'playwright/test';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { authenticateWebCli } from './auth-helper.js';
import { waitForTerminalReady } from './wait-helpers.js';

// Type for browser context in evaluate() calls
type BrowserContext = {
  localStorage: Storage;
  innerHeight: number;
};

const execAsync = promisify(exec);

// For ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const EXAMPLE_DIR = path.resolve(__dirname, '../../../examples/web-cli');
const WEB_CLI_DIST = path.join(EXAMPLE_DIR, 'dist');
const DRAWER_OPEN_KEY = "ablyCliDrawerOpen";

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

/**
 * Wait for the terminal prompt to appear, indicating the terminal is ready
 * @param page Playwright Page object
 * @param terminalSelector Selector for the terminal element
 * @param timeout Maximum time to wait in milliseconds
 */
async function waitForPrompt(page: _Page, terminalSelector: string, timeout = 60000): Promise<void> {
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

// --- Test Suite ---
test.describe('Web CLI E2E Tests', () => {
  test.setTimeout(120_000); // Overall test timeout

  test.beforeAll(async () => {
    console.log('Setting up Web CLI E2E tests...');

    // 1. Build the example app
    console.log('Building Web CLI example app...');
    try {
      // Run build directly in the example directory
      console.log(`Running build in: ${EXAMPLE_DIR}`);
      await execAsync('pnpm build', { cwd: EXAMPLE_DIR });
      console.log('Web CLI example app built.');

      // Check for dist dir
      if (!fs.existsSync(WEB_CLI_DIST)) {
        throw new Error(`Build finished but dist directory not found: ${WEB_CLI_DIST}`);
      }
      console.log(`Verified dist directory exists: ${WEB_CLI_DIST}`);

    } catch (error) {
      console.error('Failed to build Web CLI example app:', error);
      throw error; // Fail fast if build fails
    }

    // 2. Find free port for web server
    const getPortModule = await import('get-port');
    const getPort = getPortModule.default;
    webServerPort = await getPort();
    console.log(`Using Web Server Port: ${webServerPort}`);
    console.log(`Using Public Terminal Server: ${PUBLIC_TERMINAL_SERVER_URL}`);

    // 3. Start a web server for the example app using 'vite preview'
    console.log('Starting web server for example app with vite preview...');
    const { spawn } = await import('node:child_process');
    // Use npx vite preview directly
    webServerProcess = spawn('npx', ['vite', 'preview', '--port', webServerPort.toString(), '--strictPort'], { // Using npx vite preview
      stdio: 'pipe',
      cwd: EXAMPLE_DIR // Run command within the example directory
    });

    webServerProcess.stdout?.on('data', (data: Buffer) => console.log(`[Web Server]: ${data.toString().trim()}`));
    webServerProcess.stderr?.on('data', (data: Buffer) => console.error(`[Web Server ERR]: ${data.toString().trim()}`));

    // Use the original waitForServer for the root URL with 'serve'
    await waitForServer(`http://localhost:${webServerPort}`);
    console.log('Web server started.');

    console.log('Web CLI E2E setup complete.');
  });

  test.afterAll(async () => {
    console.log('Tearing down Web CLI E2E tests...');
    webServerProcess?.kill('SIGTERM');
    console.log('Web server stopped.');
  });

  test('should load the terminal, connect to public server, and run basic commands', async ({ page }) => {
    // Capture browser console messages
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const logMessage = `[Browser Console] ${msg.type()}: ${msg.text()}`;
      console.log(logMessage);
      consoleLogs.push(logMessage);
    });
    page.on('pageerror', error => {
      const errorMessage = `[Browser Page Error]: ${error}`;
      console.error(errorMessage);
      consoleLogs.push(errorMessage);
    });
    
    // Expose console logs to the page for debugging
    await page.addInitScript(() => {
      (window as any).__consoleLogs = [];
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      console.log = (...args) => {
        (window as any).__consoleLogs.push({ type: 'log', args, time: new Date().toISOString() });
        originalLog.apply(console, args);
      };
      console.error = (...args) => {
        (window as any).__consoleLogs.push({ type: 'error', args, time: new Date().toISOString() });
        originalError.apply(console, args);
      };
      console.warn = (...args) => {
        (window as any).__consoleLogs.push({ type: 'warn', args, time: new Date().toISOString() });
        originalWarn.apply(console, args);
      };
    });

    // Use the public terminal server
    const pageUrl = `http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`;
    console.log(`Navigating to: ${pageUrl}`);

    await page.goto(pageUrl);

    // Handle authentication if needed
    await authenticateWebCli(page);

    // Wait for the terminal element to be present
    const terminalSelector = '.xterm'; // Adjust if the selector changes in the React component
    const _terminalElement = await page.waitForSelector(terminalSelector, { timeout: 15000 });
    console.log('Terminal element found.');
    
    // Add a small delay to ensure React has mounted and exposed the state function
    await page.waitForTimeout(1000);
    
    // Check if the React state function is available
    const hasStateFunction = await page.evaluate(() => {
      return typeof (window as any).getAblyCliTerminalReactState === 'function';
    });
    console.log('React state function available:', hasStateFunction);

    // Wait for the terminal to be ready
    await waitForTerminalReady(page);

    // --- Run 'ably --help' ---
    console.log('Executing: ably --help');
    await page.locator(terminalSelector).focus(); // Explicitly focus terminal
    await page.keyboard.type('ably --help');
    await page.keyboard.press('Enter');

    // Wait for specific output from 'ably --help' using toContainText
    await expect(page.locator(terminalSelector)).toContainText('COMMANDS', { timeout: 15000 });
    console.log("'ably --help' output verified.");

    // --- Run 'ably --version' ---
    console.log('Executing: ably --version');
    await page.locator(terminalSelector).focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');

    // Wait for specific output from 'ably --version'
    const versionOutputText = 'browser-based CLI'; // substring expected from version output
    await expect(page.locator(terminalSelector)).toContainText(versionOutputText, { timeout: 15000 });
    console.log("'ably --version' output verified.");

    // Add a small delay to ensure output is fully rendered if needed
    await page.waitForTimeout(500);
  });

  // --- NEW TESTS FOR DRAWER AND STATE ---

  test.describe('Drawer Functionality and State Persistence', () => {
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    
    const drawerButtonSelector = 'button:has-text("Ably CLI")'; // Selector for the button that opens the drawer
    // Make the selector more specific by adding another class
    const drawerSelector = 'div.fixed.bottom-0.left-0.right-0.bg-zinc-900'; // Selector for the main drawer panel
    const toggleGroupSelector = '.toggle-group';
    const fullscreenButtonSelector = `${toggleGroupSelector} button:has-text("Fullscreen")`;
    const drawerModeButtonSelector = `${toggleGroupSelector} button:has-text("Drawer")`;
    const terminalSelector = '.xterm'; // Common terminal selector

    test.beforeEach(async ({ page }) => {
      if (!apiKey) {
        throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
      }
      
      // Start fresh for each test in this group
      await page.goto(`http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`);
      
      // Handle authentication if needed
      const authScreenVisible = await page.locator('input[placeholder="your_app.key_name:key_secret"]').isVisible().catch(() => false);
      if (authScreenVisible) {
        console.log('Auth screen detected, logging in...');
        await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
        await page.click('button:has-text("Connect to Terminal")');
        console.log('Authentication submitted.');
      }
      
      await page.waitForSelector(fullscreenButtonSelector);
      // Clear localStorage before each test
      await page.evaluate(() => {
        const ctx = window as unknown as BrowserContext;
        ctx.localStorage.clear();
      });
      await page.reload();
      
      // Re-authenticate after reload
      const authScreenVisibleAfterReload = await page.locator('input[placeholder="your_app.key_name:key_secret"]').isVisible().catch(() => false);
      if (authScreenVisibleAfterReload) {
        console.log('Re-authenticating after reload...');
        await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
        await page.click('button:has-text("Connect to Terminal")');
      }
    });

    // Test 1 & 5: View Mode Switching, URL Persistence, Basic Rendering
    test('should switch between fullscreen and drawer modes, update URL, and render terminal correctly', async ({ page }) => {
      const terminalFullscreenContainer = 'main.App-main > div.Terminal-container';
      const terminalDrawerContainer = `${drawerSelector} div.flex-grow`; // Container inside drawer

      // Initial state: Fullscreen
      await expect(page).toHaveURL(/mode=fullscreen|(?!.*mode=).*$/); // Allow no mode param or fullscreen mode
      await expect(page.locator(terminalFullscreenContainer)).toBeVisible();
      await expect(page.locator(terminalFullscreenContainer).locator(terminalSelector)).toBeVisible();
      await expect(page.locator(drawerSelector)).not.toBeVisible();

      // Switch to Drawer mode
      await page.locator(drawerModeButtonSelector).click();
      await expect(page).toHaveURL(/mode=drawer/);
      await expect(page.locator(drawerButtonSelector)).toBeVisible(); // Tab button should show
      await expect(page.locator(drawerSelector)).not.toBeVisible(); // Drawer panel still closed
      await expect(page.locator(terminalFullscreenContainer)).not.toBeVisible();

      // Open Drawer
      await page.locator(drawerButtonSelector).click();
      await expect(page.locator(drawerSelector)).toBeVisible();
      await expect(page.locator(terminalDrawerContainer).locator(terminalSelector)).toBeVisible();
      await expect(page.locator(drawerButtonSelector)).not.toBeVisible(); // Tab button hidden

      // Switch back to Fullscreen mode
      await page.locator(fullscreenButtonSelector).click();
      await expect(page).toHaveURL(/mode=fullscreen/);
      await expect(page.locator(terminalFullscreenContainer)).toBeVisible();
      await expect(page.locator(terminalFullscreenContainer).locator(terminalSelector)).toBeVisible();
      await expect(page.locator(drawerSelector)).not.toBeVisible();
      await expect(page.locator(drawerButtonSelector)).not.toBeVisible(); // Tab button should not appear in fullscreen

      // Test reload persistence (Fullscreen)
      await page.reload();
      await expect(page.locator(fullscreenButtonSelector)).toBeVisible(); // Wait for UI
      await expect(page).toHaveURL(/mode=fullscreen/);
      await expect(page.locator(terminalFullscreenContainer)).toBeVisible();
      await expect(page.locator(drawerSelector)).not.toBeVisible();

      // Test reload persistence (Drawer - closed)
      await page.locator(drawerModeButtonSelector).click();
      await page.evaluate((key) => {
        const ctx = window as unknown as BrowserContext;
        ctx.localStorage.removeItem(key);
      }, DRAWER_OPEN_KEY);
      await page.reload();
      await page.waitForURL(/mode=drawer/);
      await expect(page.locator(toggleGroupSelector)).toBeVisible({ timeout: 10000 });

      // Check that the drawer panel is NOT visible (more robust default state check)
      await expect(page.locator(drawerSelector)).toHaveCount(0);

      // Test reload persistence (Drawer - open)
      await page.locator(drawerButtonSelector).click(); // Open it
      await page.evaluate((key) => { 
        const ctx = window as unknown as BrowserContext;
        ctx.localStorage.setItem(key, JSON.stringify(true)); 
      }, DRAWER_OPEN_KEY);
      await page.reload();
      await expect(page.locator(drawerModeButtonSelector)).toBeVisible(); // Wait for UI
      await expect(page).toHaveURL(/mode=drawer/);
      await expect(page.locator(drawerSelector)).toBeVisible(); // Should be open due to localStorage
      await expect(page.locator(drawerButtonSelector)).not.toBeVisible();
    });

    // Test 2 & 3: Drawer State Persistence (Open/Closed, Height) & Default Height
    test('should persist drawer open/closed state and height via localStorage, defaulting height correctly', async ({ page }) => {
      // Ensure starting in drawer mode
      await page.locator(drawerModeButtonSelector).click();
      await expect(page).toHaveURL(/mode=drawer/);

      // 1. Test Default Height
      await page.locator(drawerButtonSelector).click(); // Open drawer
      const initialBoundingBox = await page.locator(drawerSelector).boundingBox();
      const viewportHeight = await page.evaluate(() => {
        const ctx = window as unknown as BrowserContext;
        return ctx.innerHeight;
      });
      expect(initialBoundingBox?.height).toBeCloseTo(viewportHeight * 0.4, 0); // Check initial height is approx 40%

      // 2. Test Height Persistence
      // const dragHandle = page.locator(`${drawerSelector} [data-testid="drag-handle"]`); // Removed unused variable
      // Note: Playwright dragTo doesn't work well with restricted movement, simulate manually
      const drawerBox = await page.locator(drawerSelector).boundingBox();
      if (!drawerBox) throw new Error("Drawer bounding box not found");

      const startY = drawerBox.y + 5; // Top edge of drawer + handle half-height
      const targetY = startY - 100; // Drag up by 100px

      await page.mouse.move(drawerBox.x + drawerBox.width / 2, startY);
      await page.mouse.down();
      await page.mouse.move(drawerBox.x + drawerBox.width / 2, targetY, { steps: 5 });
      await page.mouse.up();

      const newHeightBox = await page.locator(drawerSelector).boundingBox();
      const newHeight = newHeightBox?.height;
      expect(newHeight).toBeGreaterThan(initialBoundingBox?.height ?? 0);

      await page.reload();
      await expect(page.locator(drawerModeButtonSelector)).toBeVisible(); // Wait for UI
      await expect(page.locator(drawerSelector)).toBeVisible(); // Should reopen automatically due to localStorage

      const persistedHeightBox = await page.locator(drawerSelector).boundingBox();
      const persistedHeight = persistedHeightBox?.height;
      expect(persistedHeight).toBeCloseTo(newHeight ?? 0, 0); // Height should be persisted

      // 3. Test Closed State Persistence
      await page.locator(`${drawerSelector} button[aria-label="Close drawer"]`).click();
      await expect(page.locator(drawerButtonSelector)).toBeVisible(); // Should be closed
      await page.reload();
      await expect(page.locator(drawerModeButtonSelector)).toBeVisible(); // Wait for UI
      await expect(page.locator(drawerButtonSelector)).toBeVisible(); // Should remain closed
      await expect(page.locator(drawerSelector)).not.toBeVisible();
    });
  });

  test('should handle connection interruptions gracefully', async ({ page }) => {
    // Connect to the terminal using the public server
    const url = `http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`;
    await page.goto(url);
    
    // Handle authentication if needed
    await authenticateWebCli(page);
    console.log('Authentication submitted.');
    
    // Wait for the terminal to connect and show a prompt
    const _terminalElement = await page.waitForSelector('.xterm', { timeout: 15000 });
    
    // Wait for the initial prompt to appear
    await waitForPrompt(page, '.xterm');
    
    console.log('Terminal connected. Simulating WebSocket disconnection...');

    // Simulate a WebSocket disconnection using browser DevTools Protocol
    await page.evaluate(() => {
      // Script to intercept and close WebSocket connections
      const originalWebSocket = window.WebSocket;
      const activeConnections: WebSocket[] = [];
      
      // Mock WebSocket to track connections
      window.WebSocket = function(url, protocols) {
        const ws = new originalWebSocket(url, protocols);
        activeConnections.push(ws);
        return ws;
      } as any;
      
      // Close all active WebSockets to simulate network interruption
      activeConnections.forEach(ws => {
        // Use code 3000 to indicate application-specific closure (network error simulation)
        if (ws.readyState === WebSocket.OPEN) {
          // Access the internal close method
          // @ts-expect-error  internal close method exists in chrome implementation
          ws._close?.(3000, 'Test connection interruption');
        }
      });
      
      return activeConnections.length;
    });
    
    console.log('Waiting for reconnection message...');
    
    // Use a more general selector to catch connection-related messages
    // Give it more time to appear as WebSocket close and reconnection might take longer
    await page.waitForTimeout(3000);
    
    console.log('Connection should have been closed. Waiting for reconnection...');
    
    // Wait for reconnection attempt to complete (prompt visible again)
    await page.waitForTimeout(5000);
    await waitForPrompt(page, '.xterm');

    // Type a test command to verify we reconnected successfully
    await page.locator('.xterm').focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    
    // Verify the command output is visible, indicating successful reconnection
    await page.waitForSelector(
      '.xterm:has-text("browser-based CLI")',
      { timeout: 60000 }
    );
    
    console.log('Reconnection test completed successfully');
  });

}); // End of main describe block
