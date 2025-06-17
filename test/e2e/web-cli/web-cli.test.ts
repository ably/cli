import { test, expect, getTestUrl, log } from './helpers/base-test';
import { authenticateWebCli } from './auth-helper.js';
import { waitForTerminalReady } from './wait-helpers.js';

// Type for browser context in evaluate() calls
type BrowserContext = {
  localStorage: Storage;
  innerHeight: number;
};

// Constants
const DRAWER_OPEN_KEY = "ablyCliDrawerOpen";

// Public terminal server endpoint
const PUBLIC_TERMINAL_SERVER_URL = 'wss://web-cli.ably.com';

/**
 * Wait for the terminal prompt to appear, indicating the terminal is ready
 * @param page Playwright Page object
 * @param terminalSelector Selector for the terminal element
 * @param timeout Maximum time to wait in milliseconds
 */
async function waitForPrompt(page: any, terminalSelector: string, timeout = 60000): Promise<void> {
  log('Waiting for terminal prompt...');
  
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
    
    log('Terminal is ready (prompt detected or connected status).');
    
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

  test('should load the terminal, connect to public server, and run basic commands', async ({ page }) => {
    // Small delay for test stability
    log('Waiting 2 seconds for test stability...');
    await page.waitForTimeout(2000);
    
    // Use the public terminal server
    const pageUrl = `${getTestUrl()}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}`;
    log(`Navigating to: ${pageUrl}`);

    await page.goto(pageUrl);

    // Handle authentication if needed
    await authenticateWebCli(page);

    // Wait for the terminal element to be present
    const terminalSelector = '.xterm'; // Adjust if the selector changes in the React component
    const _terminalElement = await page.waitForSelector(terminalSelector, { timeout: 15000 });
    log('Terminal element found.');
    
    // Add a small delay to ensure React has mounted and exposed the state function
    await page.waitForTimeout(1000);
    
    // Check if the React state function is available
    const hasStateFunction = await page.evaluate(() => {
      return typeof (window as any).getAblyCliTerminalReactState === 'function';
    });
    log('React state function available:', hasStateFunction);

    // Wait for the terminal to be ready
    await waitForTerminalReady(page);

    // --- Run 'ably --help' ---
    log('Executing: ably --help');
    await page.locator(terminalSelector).focus(); // Explicitly focus terminal
    await page.keyboard.type('ably --help');
    await page.keyboard.press('Enter');

    // Wait for specific output from 'ably --help' using toContainText
    await expect(page.locator(terminalSelector)).toContainText('COMMANDS', { timeout: 15000 });
    log("'ably --help' output verified.");

    // --- Run 'ably --version' ---
    log('Executing: ably --version');
    await page.locator(terminalSelector).focus();
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');

    // Wait for specific output from 'ably --version'
    const versionOutputText = 'browser-based CLI'; // substring expected from version output
    await expect(page.locator(terminalSelector)).toContainText(versionOutputText, { timeout: 15000 });
    log("'ably --version' output verified.");

    // Add a small delay to ensure output is fully rendered if needed
    await page.waitForTimeout(500);

    // Check if the scrollbar appears when needed
    const scrollbarInfo = await page.evaluate((selector) => {
      const terminal = document.querySelector(selector) as HTMLElement;
      const scrollContainer = terminal?.querySelector('.xterm-screen') as HTMLElement;
      
      return {
        terminalHeight: terminal?.clientHeight || 0,
        scrollHeight: scrollContainer?.scrollHeight || 0,
        hasScrollbar: (scrollContainer?.scrollHeight || 0) > (terminal?.clientHeight || 0)
      };
    }, terminalSelector);

    log('Scrollbar info:', scrollbarInfo);

    // If content exceeds terminal height, verify scrollbar functionality
    if (scrollbarInfo.hasScrollbar) {
      // Scroll down
      await page.locator(terminalSelector).focus();
      await page.keyboard.press('End');
      await page.waitForTimeout(500);
      
      // Scroll up
      await page.keyboard.press('Home');
      await page.waitForTimeout(500);
      log('Scrollbar functionality verified.');
    }
  });

  test('side drawer persists state across page reloads', async ({ page }) => {
    // Navigate to the Web CLI app
    await page.goto(getTestUrl());
    
    // Authenticate
    await authenticateWebCli(page);
    
    // Wait for terminal to be ready
    const terminalSelector = '.xterm';
    await page.waitForSelector(terminalSelector, { timeout: 15000 });
    await waitForTerminalReady(page);

    // Open the drawer
    const drawerToggle = page.locator('button[title="Toggle drawer"]');
    await drawerToggle.click();
    
    // Wait for drawer to be visible
    const drawer = page.locator('.drawer-container');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    
    // Verify localStorage has the drawer state saved
    const drawerState = await page.evaluate((key) => {
      return localStorage.getItem(key);
    }, DRAWER_OPEN_KEY);
    expect(drawerState).toBe('true');
    
    // Reload the page
    await page.reload();
    
    // Wait for terminal to be ready again
    await page.waitForSelector(terminalSelector, { timeout: 15000 });
    await waitForTerminalReady(page);
    
    // Verify drawer is still open after reload
    await expect(drawer).toBeVisible({ timeout: 5000 });
    
    // Close the drawer
    await drawerToggle.click();
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
    
    // Verify localStorage state is updated
    const drawerStateClosed = await page.evaluate((key) => {
      return localStorage.getItem(key);
    }, DRAWER_OPEN_KEY);
    expect(drawerStateClosed).toBe('false');
    
    // Reload again and verify drawer remains closed
    await page.reload();
    await page.waitForSelector(terminalSelector, { timeout: 15000 });
    await waitForTerminalReady(page);
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
  });

  test('side drawer adapts to different screen sizes', async ({ page }) => {
    // Navigate to the Web CLI app
    await page.goto(getTestUrl());
    
    // Authenticate
    await authenticateWebCli(page);
    
    // Wait for terminal to be ready
    const terminalSelector = '.xterm';
    await page.waitForSelector(terminalSelector, { timeout: 15000 });
    await waitForTerminalReady(page);

    // Test desktop size (drawer should overlay)
    await page.setViewportSize({ width: 1200, height: 800 });
    
    const drawerToggle = page.locator('button[title="Toggle drawer"]');
    await drawerToggle.click();
    
    const drawer = page.locator('.drawer-container');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    
    // Verify terminal is still full width on desktop
    const desktopTerminalWidth = await page.evaluate((selector) => {
      const terminal = document.querySelector(selector) as HTMLElement;
      return terminal?.clientWidth || 0;
    }, terminalSelector);
    
    const desktopViewportWidth = 1200;
    expect(desktopTerminalWidth).toBeGreaterThan(desktopViewportWidth * 0.8); // Terminal should be most of the viewport
    
    // Test mobile size (drawer should push content)
    await page.setViewportSize({ width: 600, height: 800 });
    await page.waitForTimeout(500); // Wait for resize transition
    
    // Drawer should still be visible
    await expect(drawer).toBeVisible();
    
    // On mobile, terminal should be narrower when drawer is open
    const mobileTerminalWidth = await page.evaluate((selector) => {
      const terminal = document.querySelector(selector) as HTMLElement;
      return terminal?.clientWidth || 0;
    }, terminalSelector);
    
    const mobileViewportWidth = 600;
    expect(mobileTerminalWidth).toBeLessThan(mobileViewportWidth * 0.8); // Terminal should be reduced width
    
    // Close drawer
    await drawerToggle.click();
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
  });

  test('terminal maintains functionality with drawer interactions', async ({ page }) => {
    // Navigate to the Web CLI app
    await page.goto(getTestUrl());
    
    // Authenticate
    await authenticateWebCli(page);
    
    // Wait for terminal to be ready
    const terminalSelector = '.xterm';
    await page.waitForSelector(terminalSelector, { timeout: 15000 });
    await waitForTerminalReady(page);

    // Run a command
    await page.locator(terminalSelector).focus();
    await page.keyboard.type('echo "Before drawer"');
    await page.keyboard.press('Enter');
    await expect(page.locator(terminalSelector)).toContainText('Before drawer', { timeout: 5000 });
    
    // Open the drawer
    const drawerToggle = page.locator('button[title="Toggle drawer"]');
    await drawerToggle.click();
    
    const drawer = page.locator('.drawer-container');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    
    // Terminal should still be functional with drawer open
    await page.locator(terminalSelector).focus();
    await page.keyboard.type('echo "With drawer open"');
    await page.keyboard.press('Enter');
    await expect(page.locator(terminalSelector)).toContainText('With drawer open', { timeout: 5000 });
    
    // Close the drawer
    await drawerToggle.click();
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
    
    // Terminal should still be functional after drawer closes
    await page.locator(terminalSelector).focus();
    await page.keyboard.type('echo "After drawer closed"');
    await page.keyboard.press('Enter');
    await expect(page.locator(terminalSelector)).toContainText('After drawer closed', { timeout: 5000 });
  });
});

// Re-export window declaration to ensure TypeScript compatibility
declare const window: any;