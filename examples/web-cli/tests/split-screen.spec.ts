import { test, expect } from '@playwright/test';

const statusSelector = '.status';

// Basic E2E check for Step 6.1 split-screen UI

test('split-screen UI can be toggled via button', async ({ page, baseURL }) => {
  await page.goto(baseURL || '/');

  // Wait for terminal to connect (drawer example exposes .status span)
  await expect(page.locator(statusSelector)).toHaveText('connected', { timeout: 20000 });

  // The split button should be visible
  const splitBtn = page.locator('button[title="Split terminal"]');
  await expect(splitBtn).toBeVisible();

  // Click to split
  await splitBtn.click();

  // Tab bar and secondary pane should appear
  await expect(page.locator('[data-testid="tab-bar"]')).toBeVisible();
  await expect(page.locator('[data-testid="terminal-container-secondary"]')).toBeVisible();

  // Close secondary pane
  const closeBtn = page.locator('button[aria-label="Close Terminal 2"]');
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();

  // Secondary pane and tab bar should disappear, split button visible again
  await expect(page.locator('[data-testid="terminal-container-secondary"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="tab-bar"]')).toHaveCount(0);
  await expect(page.locator('button[title="Split terminal"]')).toBeVisible();
}); 