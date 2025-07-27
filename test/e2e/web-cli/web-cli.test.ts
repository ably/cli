import { test, expect, getTestUrl, log, reloadPageWithRateLimit } from './helpers/base-test';
import { authenticateWebCli } from './auth-helper.js';
import { waitForRateLimitLock } from './rate-limit-lock';
import { 
  waitForTerminalReady,
  waitForTerminalStable
} from './wait-helpers.js';

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
// Removed _waitForPrompt - using wait helpers instead

// --- Test Suite ---
test.describe('Web CLI E2E Tests', () => {
  test.setTimeout(120_000); // Overall test timeout

  test.beforeAll(async () => {
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[WebCLI Test Suite] beforeAll hook started at ${new Date().toISOString()}`);
      console.log(`[WebCLI Test Suite] Process ID: ${process.pid}`);
      console.log(`[WebCLI Test Suite] Total tests in suite: ${test.describe.name}`);
    }
  });

  test.afterAll(async () => {
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[WebCLI Test Suite] afterAll hook started at ${new Date().toISOString()}`);
      console.log(`[WebCLI Test Suite] Process ID: ${process.pid}`);
    }
  });

  test.beforeEach(async ({ page: _page }, testInfo) => {
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[WebCLI Test] beforeEach hook for "${testInfo.title}" at ${new Date().toISOString()}`);
      console.log(`[WebCLI Test] Test status: ${testInfo.status}`);
      console.log(`[WebCLI Test] Test retry: ${testInfo.retry}`);
    }
  });

  test.afterEach(async ({ page: _page }, testInfo) => {
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[WebCLI Test] afterEach hook for "${testInfo.title}" at ${new Date().toISOString()}`);
      console.log(`[WebCLI Test] Test status: ${testInfo.status}`);
      console.log(`[WebCLI Test] Test duration: ${testInfo.duration}ms`);
    }
  });

  test('should load the terminal, connect to public server, and run basic commands', async ({ page }, testInfo) => {
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[WebCLI Test] Test body started: "${testInfo.title}" at ${new Date().toISOString()}`);
    }
    
    // Wait for any ongoing rate limit pause
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[WebCLI Test] Waiting for rate limit lock before test execution...`);
    }
    await waitForRateLimitLock();
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[WebCLI Test] Rate limit lock check complete`);
    }
    
    // Wait for test stability
    log('Waiting for test stability...');
    await waitForTerminalStable(page, 2000);
    
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
    
    // Wait for React to mount and expose the state function
    await waitForTerminalStable(page, 1000);
    
    // Check if the React state function is available
    const hasStateFunction = await page.evaluate(() => {
      return typeof (window as any).getAblyCliTerminalReactState === 'function';
    });
    log('React state function available:', hasStateFunction);

    // Wait for the terminal to be ready
    await waitForTerminalReady(page);

    // --- Run 'help' ---
    log('Executing: help');
    await page.locator(terminalSelector).focus(); // Explicitly focus terminal
    await page.keyboard.type('help');
    await page.keyboard.press('Enter');

    // Wait for specific output from 'help' using toContainText
    await expect(page.locator(terminalSelector)).toContainText('COMMANDS', { timeout: 15000 });
    log("'help' output verified.");

    // --- Run '--version' ---
    log('Executing: --version');
    await page.locator(terminalSelector).focus();
    await page.keyboard.type('--version');
    await page.keyboard.press('Enter');

    // Wait for specific output from '--version'
    const versionOutputText = 'browser-based interactive CLI'; // substring expected from version output
    await expect(page.locator(terminalSelector)).toContainText(versionOutputText, { timeout: 15000 });
    log("'--version' output verified.");

    // Wait for output to be fully rendered
    await waitForTerminalStable(page, 500);

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
      await waitForTerminalStable(page, 500);
      
      // Scroll up
      await page.keyboard.press('Home');
      await waitForTerminalStable(page, 500);
      log('Scrollbar functionality verified.');
    }
  });

  test('side drawer persists state across page reloads', async ({ page }) => {
    // Wait for any ongoing rate limit pause
    await waitForRateLimitLock();
    
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
    // Wait for any ongoing rate limit pause
    await waitForRateLimitLock();
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
    await waitForTerminalStable(page, 500); // Wait for resize transition
    
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
    // Wait for any ongoing rate limit pause
    await waitForRateLimitLock();
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
    await page.keyboard.type('--version');
    await page.keyboard.press('Enter');
    await expect(page.locator(terminalSelector)).toContainText('browser-based interactive CLI', { timeout: 5000 });
    
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
    await page.keyboard.type('help');
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