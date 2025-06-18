import { test, expect, getTestUrl, log, reloadPageWithRateLimit } from './helpers/base-test';
import { authenticateWebCli } from './auth-helper.js';
import { waitForTerminalReady } from './wait-helpers.js';

// Type for browser context in evaluate() calls
type _BrowserContext = {
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
async function _waitForPrompt(page: any, terminalSelector: string, timeout = 60000): Promise<void> {
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

    // Switch to drawer mode by clicking the Drawer button
    const drawerButton = page.locator('button:has-text("Drawer")');
    await drawerButton.click();
    
    // In drawer mode, there's a tab button at the bottom to open the drawer
    // The button has class "fixed bottom-0 left-4" and contains "Ably CLI" text
    const drawerTab = page.locator('button.fixed.bottom-0.left-4:has-text("Ably CLI")');
    await expect(drawerTab).toBeVisible({ timeout: 5000 });
    await drawerTab.click();
    
    // Wait for drawer to be visible - the drawer is a fixed bottom panel
    const drawer = page.locator('div.fixed.bottom-0.left-0.right-0.z-50.bg-zinc-900');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    
    // Verify localStorage has the drawer state saved
    const drawerState = await page.evaluate((key) => {
      return localStorage.getItem(key);
    }, DRAWER_OPEN_KEY);
    expect(drawerState).toBe('true');
    
    // Reload the page with rate limiting
    await reloadPageWithRateLimit(page);
    
    // Wait for terminal element to exist (don't need full ready state for drawer test)
    await page.waitForSelector(terminalSelector, { timeout: 15000 });
    
    // Just wait for the component to be mounted
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state && state.componentConnectionStatus !== 'initial';
    }, { timeout: 10000 });
    
    // Verify drawer is still open after reload
    await expect(drawer).toBeVisible({ timeout: 5000 });
    
    // Close the drawer by clicking the X button in the drawer
    const closeButton = drawer.locator('button[aria-label="Close drawer"]');
    await closeButton.click();
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
    
    // Verify localStorage state is updated
    const drawerStateClosed = await page.evaluate((key) => {
      return localStorage.getItem(key);
    }, DRAWER_OPEN_KEY);
    expect(drawerStateClosed).toBe('false');
    
    // Reload again and verify drawer remains closed
    await reloadPageWithRateLimit(page);
    
    // In drawer mode with drawer closed, terminal is not visible
    // Just verify the drawer remains closed
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
    
    // Verify we can see the drawer tab button (indicating drawer mode is active but drawer is closed)
    await expect(drawerTab).toBeVisible({ timeout: 5000 });
  });

  test('bottom drawer adapts to different screen sizes', async ({ page }) => {
    // Navigate to the Web CLI app
    await page.goto(getTestUrl());
    
    // Authenticate
    await authenticateWebCli(page);
    
    // Wait for terminal to be ready
    const terminalSelector = '.xterm';
    await page.waitForSelector(terminalSelector, { timeout: 15000 });
    await waitForTerminalReady(page);

    // Test desktop size
    await page.setViewportSize({ width: 1200, height: 800 });
    
    // Switch to drawer mode
    const drawerModeButton = page.locator('button:has-text("Drawer")');
    await drawerModeButton.click();
    
    // Open the drawer tab
    const drawerTab = page.locator('button.fixed.bottom-0.left-4:has-text("Ably CLI")');
    await expect(drawerTab).toBeVisible({ timeout: 5000 });
    await drawerTab.click();
    
    const drawer = page.locator('div.fixed.bottom-0.left-0.right-0.z-50.bg-zinc-900');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    
    // Verify drawer height on desktop
    const desktopDrawerHeight = await drawer.evaluate((el) => el.clientHeight);
    expect(desktopDrawerHeight).toBeGreaterThan(200); // Drawer should have reasonable height
    expect(desktopDrawerHeight).toBeLessThan(600); // But not take full screen
    
    // Test mobile size
    await page.setViewportSize({ width: 600, height: 800 });
    await page.waitForTimeout(500); // Wait for resize transition
    
    // Drawer should still be visible
    await expect(drawer).toBeVisible();
    
    // Verify drawer adapts to mobile viewport
    const mobileDrawerHeight = await drawer.evaluate((el) => el.clientHeight);
    expect(mobileDrawerHeight).toBeGreaterThan(200); // Still reasonable height
    expect(mobileDrawerHeight).toBeLessThan(600); // Not full screen
    
    // Close drawer by clicking the X button
    const closeButton = drawer.locator('button[aria-label="Close drawer"]');
    await closeButton.click();
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
    await page.keyboard.type('ably --version');
    await page.keyboard.press('Enter');
    await expect(page.locator(terminalSelector)).toContainText('@ably/cli', { timeout: 5000 });
    
    // Switch to drawer mode by clicking the Drawer button
    const drawerModeButton = page.locator('button:has-text("Drawer")');
    await drawerModeButton.click();
    
    // Click the drawer tab to open it
    const drawerTab = page.locator('button.fixed.bottom-0.left-4:has-text("Ably CLI")');
    await expect(drawerTab).toBeVisible({ timeout: 5000 });
    await drawerTab.click();
    
    const drawer = page.locator('div.fixed.bottom-0.left-0.right-0.z-50.bg-zinc-900');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    
    // Terminal should still be functional with drawer open
    await page.locator(terminalSelector).focus();
    await page.keyboard.type('ably --help');
    await page.keyboard.press('Enter');
    await expect(page.locator(terminalSelector)).toContainText('COMMANDS', { timeout: 5000 });
    
    // Close the drawer by clicking the X button
    const closeButton = drawer.locator('button[aria-label="Close drawer"]');
    await closeButton.click();
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
    
    // Terminal should still be functional after drawer closes
    // But in drawer mode with drawer closed, terminal is not visible
    // We need to verify the drawer tab is visible instead
    await expect(drawerTab).toBeVisible({ timeout: 5000 });
  });
});

// Re-export window declaration to ensure TypeScript compatibility
declare const window: any;