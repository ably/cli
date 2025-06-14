import { test, expect, type Page as _Page } from 'playwright/test';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const execAsync = promisify(exec);

// For ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const EXAMPLE_DIR = path.resolve(__dirname, '../../../examples/web-cli');
const WEB_CLI_DIST = path.join(EXAMPLE_DIR, 'dist');
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

test.describe('Web CLI Authentication E2E Tests', () => {
  test.setTimeout(120_000); // Overall test timeout

  test.beforeAll(async () => {
    console.log('Setting up Web CLI Authentication E2E tests...');

    // 1. Build the example app
    console.log('Building Web CLI example app...');
    try {
      console.log(`Running build in: ${EXAMPLE_DIR}`);
      await execAsync('pnpm build', { cwd: EXAMPLE_DIR });
      console.log('Web CLI example app built.');

      if (!fs.existsSync(WEB_CLI_DIST)) {
        throw new Error(`Build finished but dist directory not found: ${WEB_CLI_DIST}`);
      }
      console.log(`Verified dist directory exists: ${WEB_CLI_DIST}`);
    } catch (error) {
      console.error('Failed to build Web CLI example app:', error);
      throw error;
    }

    // 2. Find free port for web server
    const getPortModule = await import('get-port');
    const getPort = getPortModule.default;
    webServerPort = await getPort();
    console.log(`Using Web Server Port: ${webServerPort}`);

    // 3. Start a web server
    console.log('Starting web server for example app with vite preview...');
    const { spawn } = await import('node:child_process');
    webServerProcess = spawn('npx', ['vite', 'preview', '--port', webServerPort.toString(), '--strictPort'], {
      stdio: 'pipe',
      cwd: EXAMPLE_DIR
    });

    webServerProcess.stdout?.on('data', (data: Buffer) => console.log(`[Web Server]: ${data.toString().trim()}`));
    webServerProcess.stderr?.on('data', (data: Buffer) => console.error(`[Web Server ERR]: ${data.toString().trim()}`));

    await waitForServer(`http://localhost:${webServerPort}`);
    console.log('Web server started.');
  });

  test.afterAll(async () => {
    console.log('Tearing down Web CLI Authentication E2E tests...');
    webServerProcess?.kill('SIGTERM');
    console.log('Web server stopped.');
  });

  test('should display auth screen on initial load', async ({ page }) => {
    await page.goto(`http://localhost:${webServerPort}`);
    
    // Verify auth screen elements are visible
    await expect(page.getByText('Ably Web CLI Terminal')).toBeVisible();
    await expect(page.getByText('Enter your credentials to start a terminal session')).toBeVisible();
    await expect(page.getByLabel(/API Key/)).toBeVisible();
    await expect(page.getByLabel(/Access Token/)).toBeVisible();
    await expect(page.getByText('Connect to Terminal')).toBeVisible();
    
    // Verify terminal is not visible
    await expect(page.locator('.xterm')).not.toBeVisible();
  });

  test('should validate API key is required', async ({ page }) => {
    await page.goto(`http://localhost:${webServerPort}`);
    
    // Try to submit without entering any credentials
    await page.click('button:has-text("Connect to Terminal")');
    
    // Should show error message
    await expect(page.getByText('API Key is required to connect to Ably')).toBeVisible();
    
    // Terminal should still not be visible
    await expect(page.locator('.xterm')).not.toBeVisible();
  });

  test('should validate API key format', async ({ page }) => {
    await page.goto(`http://localhost:${webServerPort}`);
    
    // Enter invalid API key format
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', 'invalid-format');
    await page.click('button:has-text("Connect to Terminal")');
    
    // Should show format error
    await expect(page.getByText('API Key should be in the format: app_name.key_name:key_secret')).toBeVisible();
    
    // Terminal should still not be visible
    await expect(page.locator('.xterm')).not.toBeVisible();
  });

  test('should authenticate with valid API key and show terminal', async ({ page }) => {
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
    }

    await page.goto(`http://localhost:${webServerPort}`);
    
    // Fill in valid API key
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    await page.click('button:has-text("Connect to Terminal")');
    
    // Should transition to terminal view
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Auth screen should be hidden
    await expect(page.getByText('Enter your credentials to start a terminal session')).not.toBeVisible();
    
    // Header should show authenticated status
    await expect(page.getByText('Custom Auth')).toBeVisible();
  });

  test('should persist authentication state across page reloads', async ({ page }) => {
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
    }

    await page.goto(`http://localhost:${webServerPort}`);
    
    // Authenticate
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    await page.click('button:has-text("Connect to Terminal")');
    
    // Wait for terminal to be visible
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Reload the page
    await page.reload();
    
    // Should still be authenticated - terminal should be visible
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Auth screen should not be shown
    await expect(page.getByText('Enter your credentials to start a terminal session')).not.toBeVisible();
  });

  test('should allow changing credentials via auth settings', async ({ page }) => {
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
    }

    await page.goto(`http://localhost:${webServerPort}`);
    
    // Initial authentication
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    await page.click('button:has-text("Connect to Terminal")');
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Open auth settings
    await page.click('button[title="Authentication Settings"]');
    await expect(page.getByText('Authentication Settings')).toBeVisible();
    
    // Verify current credentials are shown (redacted)
    const apiKeyDisplay = page.locator('text=/.*\\..*:\\*{4}/');
    await expect(apiKeyDisplay).toBeVisible();
    
    // Clear credentials
    await page.click('button:has-text("Clear Credentials")');
    
    // Should return to auth screen
    await expect(page.getByText('Enter your credentials to start a terminal session')).toBeVisible();
    await expect(page.locator('.xterm')).not.toBeVisible();
  });

  test('should show credential display with proper redaction', async ({ page }) => {
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
    }

    await page.goto(`http://localhost:${webServerPort}`);
    
    // Authenticate
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    await page.click('button:has-text("Connect to Terminal")');
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Open auth settings
    await page.click('button[title="Authentication Settings"]');
    
    // Extract the app ID and key ID from the original API key
    const [keyName] = apiKey.split(':');
    
    // Verify the credential is displayed with proper redaction
    // Should show full app ID and key ID, but redact the secret
    const redactedKeyPattern = new RegExp(`${keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\*{4}`);
    await expect(page.locator(`text=${redactedKeyPattern.source}`)).toBeVisible();
  });

  test('should handle authentication with access token', async ({ page }) => {
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
    }

    await page.goto(`http://localhost:${webServerPort}`);
    
    // Fill in API key and a test access token
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    await page.fill('input[placeholder="Your JWT access token"]', 'test-access-token');
    await page.click('button:has-text("Connect to Terminal")');
    
    // Should still authenticate with API key (access token is optional)
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
  });

  test('should clear error message when user starts typing', async ({ page }) => {
    await page.goto(`http://localhost:${webServerPort}`);
    
    // Trigger error by submitting empty form
    await page.click('button:has-text("Connect to Terminal")');
    await expect(page.getByText('API Key is required to connect to Ably')).toBeVisible();
    
    // Start typing in the API key field
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', 'a');
    
    // Error should be cleared
    await expect(page.getByText('API Key is required to connect to Ably')).not.toBeVisible();
  });

  test('should maintain terminal session when updating auth settings without changing credentials', async ({ page }) => {
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
    }

    await page.goto(`http://localhost:${webServerPort}`);
    
    // Authenticate
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    await page.click('button:has-text("Connect to Terminal")');
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Wait for terminal prompt
    await page.waitForTimeout(2000);
    
    // Type a command to establish session state
    await page.locator('.xterm').click();
    await page.keyboard.type('echo "test session"');
    await page.keyboard.press('Enter');
    
    // Open auth settings
    await page.click('button[title="Authentication Settings"]');
    await expect(page.getByText('Authentication Settings')).toBeVisible();
    
    // Close without making changes (ESC key or X button)
    await page.keyboard.press('Escape');
    
    // Terminal should still be visible and session should be maintained
    await expect(page.locator('.xterm')).toBeVisible();
    await expect(page.locator('.xterm')).toContainText('test session');
  });
});