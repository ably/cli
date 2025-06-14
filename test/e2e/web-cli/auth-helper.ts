import { Page } from 'playwright/test';

/**
 * Helper function to handle authentication in Web CLI e2e tests
 * @param page Playwright Page object
 * @param apiKey Optional API key, defaults to environment variable
 * @returns Promise that resolves when authentication is complete
 */
export async function authenticateWebCli(page: Page, apiKey?: string): Promise<void> {
  const key = apiKey || process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
  if (!key) {
    throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
  }

  // Check if auth screen is visible
  const authScreenVisible = await page.locator('input[placeholder="your_app.key_name:key_secret"]').isVisible().catch(() => false);
  
  if (authScreenVisible) {
    console.log('Authentication screen detected, logging in...');
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', key);
    await page.click('button:has-text("Connect to Terminal")');
    console.log('Authentication submitted.');
    
    // Wait for terminal to be visible
    await page.waitForSelector('.xterm', { timeout: 15000 });
  }
}

/**
 * Helper function to navigate to Web CLI and authenticate
 * @param page Playwright Page object
 * @param url The URL to navigate to
 * @param apiKey Optional API key, defaults to environment variable
 */
export async function navigateAndAuthenticate(page: Page, url: string, apiKey?: string): Promise<void> {
  await page.goto(url);
  await authenticateWebCli(page, apiKey);
}