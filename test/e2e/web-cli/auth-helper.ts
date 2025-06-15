import { Page } from 'playwright/test';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Load environment variables from .env for Playwright tests
// First try root .env (normal location)
const rootEnvPath = resolve(process.cwd(), '.env');
if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
}

// Also try the example app's .env (in case test script hasn't moved it yet)
const exampleEnvPath = resolve(process.cwd(), 'examples/web-cli/.env');
if (existsSync(exampleEnvPath)) {
  config({ path: exampleEnvPath });
}

// Finally try the backup location (where test script moves it)
const backupEnvPath = resolve(process.cwd(), 'examples/web-cli/.env.backup');
if (existsSync(backupEnvPath)) {
  config({ path: backupEnvPath });
}

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