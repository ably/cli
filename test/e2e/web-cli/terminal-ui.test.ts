import { test, expect, getTestUrl } from './helpers/base-test';
import { authenticateWebCli } from './auth-helper';
import { incrementConnectionCount, waitForRateLimitIfNeeded } from './test-rate-limiter';

const BOX_TOP_LEFT = '┌';
const BOX_BOTTOM_LEFT = '└';

test.describe('Web CLI Terminal UI Tests', () => {
  test.setTimeout(120_000); // Overall test timeout

  test.describe('Connection Animation', () => {
    test('should display ASCII box animation during connection', async ({ page }) => {
      const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
      if (!apiKey) {
        throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
      }

      // Clear any stored credentials before navigating
      await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      
      await page.goto(getTestUrl());
      
      const terminalSelector = '.xterm-viewport';
      const terminalRowsSelector = `${terminalSelector} .xterm-rows`;
      const statusSelector = '.status';
      
      // Check rate limit before attempting connection
      await waitForRateLimitIfNeeded();
      
      // Start authentication which will trigger connecting state
      await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
      incrementConnectionCount();
      await page.click('button:has-text("Connect to Terminal")');
      
      // Should show connecting status
      await expect(page.locator(statusSelector)).toHaveText('connecting', { timeout: 10000 });
      
      // Wait for terminal to render and show connecting message with ASCII box
      await page.waitForSelector(`${terminalRowsSelector} > div`);
      await expect(page.locator(terminalRowsSelector)).toContainText('CONNECTING', { timeout: 5000 });
      await expect(page.locator(terminalRowsSelector)).toContainText(BOX_TOP_LEFT, { timeout: 1000 });
      await expect(page.locator(terminalRowsSelector)).toContainText(BOX_BOTTOM_LEFT, { timeout: 1000 });
      
      // Wait for connection to complete
      await expect(page.locator(statusSelector)).toHaveText('connected', { timeout: 15000 });
      
      // Box should disappear once connected
      await expect(page.locator(terminalRowsSelector)).not.toContainText('CONNECTING', { timeout: 2000 });
      await expect(page.locator(terminalRowsSelector)).not.toContainText(BOX_TOP_LEFT, { timeout: 1000 });
      await expect(page.locator(terminalRowsSelector)).not.toContainText(BOX_BOTTOM_LEFT, { timeout: 1000 });
      
      // Prompt should be visible
      await expect(page.locator(terminalRowsSelector)).toContainText('$ ', { timeout: 5000 });
    });
  });

  test.describe('Split Screen Feature', () => {
    test('should toggle split-screen terminal via button', async ({ page }) => {
      const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
      if (!apiKey) {
        throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
      }

      await page.goto(getTestUrl());
      
      // Authenticate first
      await authenticateWebCli(page, apiKey);
      
      // Wait for terminal to be connected
      const statusSelector = '.status';
      await expect(page.locator(statusSelector)).toHaveText('connected', { timeout: 20000 });
      
      // The split button should be visible
      const splitBtn = page.locator('button[title="Split terminal"]');
      await expect(splitBtn).toBeVisible();
      
      // Click to split
      await splitBtn.click();
      
      // Tab bar and secondary pane should appear
      await expect(page.locator('[data-testid="tab-bar"]')).toBeVisible();
      await expect(page.locator('[data-testid="terminal-container-secondary"]')).toBeVisible();
      
      // Verify we have two terminal instances
      const terminals = page.locator('.xterm');
      await expect(terminals).toHaveCount(2);
      
      // Close secondary pane
      const closeBtn = page.locator('button[aria-label="Close Terminal 2"]');
      await expect(closeBtn).toBeVisible();
      await closeBtn.click();
      
      // Secondary pane and tab bar should disappear
      await expect(page.locator('[data-testid="terminal-container-secondary"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="tab-bar"]')).toHaveCount(0);
      
      // Split button should be visible again
      await expect(splitBtn).toBeVisible();
      
      // Should be back to single terminal
      await expect(terminals).toHaveCount(1);
    });

    test('should maintain independent sessions in split terminals', async ({ page }) => {
      const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
      if (!apiKey) {
        throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
      }

      await page.goto(getTestUrl());
      await authenticateWebCli(page, apiKey);
      
      // Wait for connection
      await expect(page.locator('.status')).toHaveText('connected', { timeout: 20000 });
      
      // Split the terminal
      await page.click('button[title="Split terminal"]');
      await expect(page.locator('[data-testid="terminal-container-secondary"]')).toBeVisible();
      
      // Wait a bit for both terminals to initialize
      await page.waitForTimeout(2000);
      
      // Type in the first terminal
      const primaryTerminal = page.locator('[data-testid="terminal-container-primary"] .xterm');
      await primaryTerminal.click();
      await page.keyboard.type('echo "terminal 1"');
      await page.keyboard.press('Enter');
      
      // Type in the second terminal
      const secondaryTerminal = page.locator('[data-testid="terminal-container-secondary"] .xterm');
      await secondaryTerminal.click();
      await page.keyboard.type('echo "terminal 2"');
      await page.keyboard.press('Enter');
      
      // Verify each terminal has its own output
      await expect(primaryTerminal).toContainText('terminal 1');
      await expect(secondaryTerminal).toContainText('terminal 2');
    });
  });
});