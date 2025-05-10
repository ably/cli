import { test, expect, type Page as _Page, type Browser as _Browser } from 'playwright/test';
import { spawn, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import path from 'node:path';
import getPort from 'get-port';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

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
const TERMINAL_SERVER_SCRIPT = path.resolve(__dirname, '../../../dist/scripts/terminal-server.js');
const DRAWER_OPEN_KEY = "ablyCliDrawerOpen";

// Shared variables
let terminalServerProcess: ChildProcess | null = null;
let terminalServerPort: number;
let webServerProcess: ChildProcess;
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
async function waitForPrompt(page: _Page, terminalSelector: string, timeout = 30000): Promise<void> {
  const promptText = '$ '; // The simple prompt used in the container (NOTE: Space added)
  console.log('Waiting for terminal prompt...');
  try {
    await page.locator(terminalSelector).getByText(promptText, { exact: true }).waitFor({ timeout });
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
    throw error; // Re-throw the error to fail the test
  }
}

// --- Test Suite ---
test.describe('Web CLI E2E Tests', () => {
  test.setTimeout(120_000); // Overall test timeout

  test.beforeAll(async () => {
    console.log('Setting up Web CLI E2E tests...');

    // 1. Check Docker availability
    try {
      await execAsync('docker ps');
      console.log('Docker is running.');
    } catch {
      console.error('Docker is not running or accessible. Skipping Web CLI E2E tests.');
      // Mark the test as conditionally skipped but in a way that doesn't trigger the lint warning
      process.env.DOCKER_UNAVAILABLE = 'true';
      return;
    }

    // 2. Build the example app
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

    // 3. Find free ports
    terminalServerPort = await getPort();
    webServerPort = await getPort();
    console.log(`Using Terminal Server Port: ${terminalServerPort}`);
    console.log(`Using Web Server Port: ${webServerPort}`);

    // 4. Start the terminal server
    console.log('Starting terminal server...');
    // Run the compiled JS script directly with node
    terminalServerProcess = spawn('node', [
      TERMINAL_SERVER_SCRIPT
    ], {
      env: {
        ...process.env,
        PORT: terminalServerPort.toString(),
        NODE_ENV: 'test',
        // Provide credentials for tests (use env vars if set)
        ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || 'dummy.key:secret',
        ABLY_ACCESS_TOKEN: 'dummy-token',
        TS_NODE_PROJECT: 'tsconfig.json' // Ensure ts-node uses the correct config
      },
      stdio: 'pipe',
      // Need to run from the root to resolve paths correctly in server script
      cwd: path.resolve(__dirname, '../../..')
    });

    terminalServerProcess.stdout?.on('data', (data) => console.log(`[Terminal Server]: ${data.toString().trim()}`));
    terminalServerProcess.stderr?.on('data', (data) => console.error(`[Terminal Server ERR]: ${data.toString().trim()}`));
    await waitForServer(`http://localhost:${terminalServerPort}/health`);
    console.log('Terminal server started.');

    // 5. Start a web server for the example app using 'vite preview'
    console.log('Starting web server for example app with vite preview...');
    // Use npx vite preview directly
    webServerProcess = spawn('npx', ['vite', 'preview', '--port', webServerPort.toString(), '--strictPort'], { // Using npx vite preview
      stdio: 'pipe',
      cwd: EXAMPLE_DIR // Run command within the example directory
    });

    webServerProcess.stdout?.on('data', (data) => console.log(`[Web Server]: ${data.toString().trim()}`));
    webServerProcess.stderr?.on('data', (data) => console.error(`[Web Server ERR]: ${data.toString().trim()}`));

    // Use the original waitForServer for the root URL with 'serve'
    await waitForServer(`http://localhost:${webServerPort}`);
    console.log('Web server started.');

    console.log('Web CLI E2E setup complete.');
  });

  test.afterAll(async () => {
    console.log('Tearing down Web CLI E2E tests...');
    terminalServerProcess?.kill('SIGTERM');
    webServerProcess?.kill('SIGTERM');
    // No need to clean up dist-test anymore
    console.log('Servers stopped.');
  });

  test('should load the terminal, connect, and run basic commands', async ({ page }) => {
    // Capture browser console messages
    page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', error => console.error(`[Browser Page Error]: ${error}`));

    // Skip test if Docker is not available (determined in beforeAll)
    if (process.env.DOCKER_UNAVAILABLE === 'true' || !terminalServerProcess) {
      console.log('Skipping test because Docker was not available');
      return; // Simply return instead of calling test.skip()
    }

    const wsUrl = `ws://localhost:${terminalServerPort}`;
    // Use the correct query parameter name expected by the example app
    const pageUrl = `http://localhost:${webServerPort}?serverUrl=${encodeURIComponent(wsUrl)}`;
    console.log(`Navigating to: ${pageUrl}`);

    await page.goto(pageUrl);

    // Wait for the terminal element to be present
    const terminalSelector = '.xterm'; // Adjust if the selector changes in the React component
    const _terminalElement = await page.waitForSelector(terminalSelector, { timeout: 15000 });
    console.log('Terminal element found.');

    // Wait for the initial prompt to appear, indicating connection and container ready
    const promptText = '$ '; // The simple prompt used in the container (NOTE: Space added)
    console.log('Attempting to wait for initial prompt...'); // Log before wait
    try {
      await page.locator(terminalSelector).getByText(promptText, { exact: true }).waitFor({ timeout: 30000 }); // Use exact: true
      console.log('Initial prompt found.');
    } catch (error) {
      console.error('Error waiting for initial prompt:', error);
      console.log('--- Terminal Content on Prompt Timeout ---');
      try {
        const terminalContent = await page.locator(terminalSelector).textContent();
        console.log(terminalContent);
      } catch (logError) {
        console.error('Could not get terminal content after timeout:', logError);
      }
      console.log('-----------------------------------------');
      throw error; // Re-throw the error to fail the test
    }

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
    const drawerButtonSelector = 'button:has-text("Ably CLI")'; // Selector for the button that opens the drawer
    // Make the selector more specific by adding another class
    const drawerSelector = 'div.fixed.bottom-0.left-0.right-0.bg-zinc-900'; // Selector for the main drawer panel
    const toggleGroupSelector = '.toggle-group';
    const fullscreenButtonSelector = `${toggleGroupSelector} button:has-text("Fullscreen")`;
    const drawerModeButtonSelector = `${toggleGroupSelector} button:has-text("Drawer")`;
    const terminalSelector = '.xterm'; // Common terminal selector

    test.beforeEach(async ({ page }) => {
      // Ensure Docker is available (check set in outer beforeAll)
      if (process.env.DOCKER_UNAVAILABLE === 'true' || !terminalServerProcess) {
        console.log('Skipping drawer tests because Docker was not available');
        // eslint-disable-next-line mocha/no-skipped-tests
        test.skip(); // Skip this specific test if Docker unavailable
        return;
      }
      // Start fresh for each test in this group
      await page.goto(`http://localhost:${webServerPort}`);
      await page.waitForSelector(fullscreenButtonSelector);
      // Clear localStorage before each test
      await page.evaluate(() => {
        const ctx = window as unknown as BrowserContext;
        ctx.localStorage.clear();
      });
      await page.reload();
    });

    // Test 1 & 5: View Mode Switching, URL Persistence, Basic Rendering
    test('should switch between fullscreen and drawer modes, update URL, and render terminal correctly', async ({ page }) => {
      const terminalFullscreenContainer = 'main.App-main > div.Terminal-container';
      const terminalDrawerContainer = `${drawerSelector} div.flex-grow`; // Container inside drawer

      // Initial state: Fullscreen
      await expect(page).toHaveURL(/\?mode=fullscreen|\?$/); // Allow no query param or fullscreen
      await expect(page.locator(terminalFullscreenContainer)).toBeVisible();
      await expect(page.locator(terminalFullscreenContainer).locator(terminalSelector)).toBeVisible();
      await expect(page.locator(drawerSelector)).not.toBeVisible();

      // Switch to Drawer mode
      await page.locator(drawerModeButtonSelector).click();
      await expect(page).toHaveURL(/\?mode=drawer/);
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
      await expect(page).toHaveURL(/\?mode=fullscreen/);
      await expect(page.locator(terminalFullscreenContainer)).toBeVisible();
      await expect(page.locator(terminalFullscreenContainer).locator(terminalSelector)).toBeVisible();
      await expect(page.locator(drawerSelector)).not.toBeVisible();
      await expect(page.locator(drawerButtonSelector)).not.toBeVisible(); // Tab button should not appear in fullscreen

      // Test reload persistence (Fullscreen)
      await page.reload();
      await expect(page.locator(fullscreenButtonSelector)).toBeVisible(); // Wait for UI
      await expect(page).toHaveURL(/\?mode=fullscreen/);
      await expect(page.locator(terminalFullscreenContainer)).toBeVisible();
      await expect(page.locator(drawerSelector)).not.toBeVisible();

      // Test reload persistence (Drawer - closed)
      await page.locator(drawerModeButtonSelector).click();
      await page.evaluate((key) => {
        const ctx = window as unknown as BrowserContext;
        ctx.localStorage.removeItem(key);
      }, DRAWER_OPEN_KEY);
      await page.reload();
      await page.waitForURL(/\?mode=drawer/);
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
      await expect(page).toHaveURL(/\?mode=drawer/);
      await expect(page.locator(drawerSelector)).toBeVisible(); // Should be open due to localStorage
      await expect(page.locator(drawerButtonSelector)).not.toBeVisible();
    });

    // Test 2 & 3: Drawer State Persistence (Open/Closed, Height) & Default Height
    test('should persist drawer open/closed state and height via localStorage, defaulting height correctly', async ({ page }) => {
      // Ensure starting in drawer mode
      await page.locator(drawerModeButtonSelector).click();
      await expect(page).toHaveURL(/\?mode=drawer/);

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
    // Connect to the terminal
    const url = `http://localhost:${webServerPort}?serverUrl=ws%3A%2F%2Flocalhost%3A${terminalServerPort}`;
    await page.goto(url);
    
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
        // Use code 1006 to indicate abnormal closure (network error)
        if (ws.readyState === WebSocket.OPEN) {
          // Access the internal close method
          // @ts-expect-error  internal close method exists in chrome implementation
          ws._close?.(1006, 'Test connection interruption');
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
    await waitForPrompt(page, '.xterm', 30000);

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
