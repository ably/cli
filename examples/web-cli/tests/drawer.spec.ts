import { test, expect } from '@playwright/test';

const statusSelector = '.status'; // span that shows current connection status
const BOX_TOP_LEFT = '┌';
const BOX_BOTTOM_LEFT = '└';

test('should display connection status and connecting animation with ASCII box', async ({ page, baseURL }) => {
  await page.goto(baseURL || '/');

  const terminalSelector = '.xterm-viewport'; // Targets the viewport where lines are rendered
  const terminalRowsSelector = `${terminalSelector} .xterm-rows`; // More specific for content

  // 1. Await initial connecting status
  await expect(page.locator(statusSelector)).toHaveText('connecting', { timeout: 10000 });

  // Wait for terminal to render and show connecting message and box
  await page.waitForSelector(`${terminalRowsSelector} > div`);
  await expect(page.locator(terminalRowsSelector)).toContainText('CONNECTING', { timeout: 5000 }); // Box title
  await expect(page.locator(terminalRowsSelector)).toContainText(BOX_TOP_LEFT, { timeout: 1000 });
  await expect(page.locator(terminalRowsSelector)).toContainText(BOX_BOTTOM_LEFT, { timeout: 1000 });

  // 2. Connected - box should be gone
  await expect(page.locator(statusSelector)).toHaveText('connected', { timeout: 15000 });
  await expect(page.locator(terminalRowsSelector)).not.toContainText('CONNECTING', { timeout: 2000 });
  await expect(page.locator(terminalRowsSelector)).not.toContainText(BOX_TOP_LEFT, { timeout: 1000 });
  await expect(page.locator(terminalRowsSelector)).not.toContainText(BOX_BOTTOM_LEFT, { timeout: 1000 });
});

test('should display prompt after connected and no ASCII box', async ({ page, baseURL }) => {
  await page.goto(baseURL || '/');

  const terminalRowsSelector = '.xterm-viewport .xterm-rows';

  // Wait for connecting status and initial render
  await expect(page.locator(statusSelector)).toHaveText('connecting', { timeout: 10000 });
  await page.waitForSelector(`${terminalRowsSelector} > div`);
  // Check for box presence during connecting phase
  await expect(page.locator(terminalRowsSelector)).toContainText(BOX_TOP_LEFT, { timeout: 5000 }); 

  // Wait for connected status
  await expect(page.locator(statusSelector)).toHaveText('connected', { timeout: 15000 });

  // Box and connecting message should be gone, prompt should be visible
  await expect(page.locator(terminalRowsSelector)).not.toContainText('CONNECTING', { timeout: 2000 });
  await expect(page.locator(terminalRowsSelector)).not.toContainText(BOX_TOP_LEFT, { timeout: 1000 });
  await expect(page.locator(terminalRowsSelector)).not.toContainText(BOX_BOTTOM_LEFT, { timeout: 1000 });
  await expect(page.locator(terminalRowsSelector)).toContainText('$ ', { timeout: 5000 });
}); 