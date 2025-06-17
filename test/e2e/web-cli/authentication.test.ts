import { test, expect, getTestUrl, buildTestUrl, log } from './helpers/base-test';
import { authenticateWebCli } from './auth-helper';

test.describe('Web CLI Authentication E2E Tests', () => {
  test.setTimeout(120_000); // Overall test timeout
  test.describe.configure({ mode: 'serial' }); // Run tests serially to avoid interference

  test('should display auth screen on initial load', async ({ page }) => {
    // Clear any stored credentials before navigating
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.goto(getTestUrl());
    
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
    // Clear any stored credentials before navigating
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.goto(getTestUrl());
    
    // Try to submit without entering any credentials
    await page.click('button:has-text("Connect to Terminal")');
    
    // Should show error message
    await expect(page.getByText('API Key is required to connect to Ably')).toBeVisible();
    
    // Terminal should still not be visible
    await expect(page.locator('.xterm')).not.toBeVisible();
  });

  test('should validate API key format', async ({ page }) => {
    // Clear any stored credentials before navigating
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.goto(getTestUrl());
    
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

    // Clear any stored credentials before navigating
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.goto(getTestUrl());
    
    // Use form-based authentication explicitly (don't use query params)
    await authenticateWebCli(page, apiKey, false);
    
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

    // Navigate to the page
    await page.goto(getTestUrl());
    
    // Authenticate
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    await page.click('button:has-text("Connect to Terminal")');
    
    // Wait for terminal to be visible
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Reload the page (don't clear sessionStorage this time)
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

    // Clear any stored credentials before navigating
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.goto(getTestUrl());
    
    // Initial authentication
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    await page.click('button:has-text("Connect to Terminal")');
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Open auth settings
    await page.click('button[title="Authentication Settings"]');
    await expect(page.getByText('Authentication Settings')).toBeVisible();
    
    // Verify current credentials section is shown
    await expect(page.getByText('Current Credentials')).toBeVisible();
    
    // The API key should be displayed in redacted form
    const [keyName] = apiKey.split(':');
    await expect(page.locator(`text=${keyName}:****`)).toBeVisible();
    
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

    // Clear any stored credentials before navigating
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.goto(getTestUrl());
    
    // Authenticate
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    await page.click('button:has-text("Connect to Terminal")');
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Open auth settings
    await page.click('button[title="Authentication Settings"]');
    
    // Verify current credentials section is shown
    await expect(page.getByText('Current Credentials')).toBeVisible();
    
    // Extract the app ID and key ID from the original API key
    const [keyName] = apiKey.split(':');
    
    // Verify the credential is displayed with proper redaction
    // Should show full app ID and key ID, but redact the secret
    await expect(page.locator(`text=${keyName}:****`)).toBeVisible();
  });

  test('should handle authentication with access token', async ({ page }) => {
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
    
    // Fill in API key and a test access token
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    await page.fill('input[placeholder="Your JWT access token"]', 'test-access-token');
    await page.click('button:has-text("Connect to Terminal")');
    
    // Should still authenticate with API key (access token is optional)
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
  });

  test('should clear error message when user starts typing', async ({ page }) => {
    // Clear any stored credentials before navigating
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.goto(getTestUrl());
    
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

    // Clear any stored credentials before navigating
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.goto(getTestUrl());
    
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

test.describe('Web CLI Auto-Login E2E Tests', () => {
  test.setTimeout(120_000);

  test('should automatically authenticate when API key is provided via query parameter', async ({ page }) => {
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    const url = buildTestUrl({ apiKey: apiKey! });
    
    await page.goto(url);
    
    // Should NOT show auth screen
    await expect(page.getByText('Enter your credentials to start a terminal session')).not.toBeVisible();
    
    // Should show terminal immediately
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Should show "Query Params" in header since we're using query param auth
    await expect(page.getByText('Query Params')).toBeVisible();
  });

  test('should allow switching from query param auth to custom auth', async ({ page }) => {
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    const url = buildTestUrl({ apiKey: apiKey! });
    
    await page.goto(url);
    
    // Wait for terminal with query param auth
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Query Params')).toBeVisible();
    
    // Open auth settings
    await page.click('button[title="Authentication Settings"]');
    await expect(page.getByText('Authentication Settings')).toBeVisible();
    
    // When using query params, we need to clear the API key field and save
    // to switch to custom auth
    const apiKeyInput = page.locator('input[placeholder="your_app.key_name:key_secret"]');
    await apiKeyInput.clear();
    await page.click('button:has-text("Cancel")');
    
    // URL should still have query params, so reload without them
    await page.goto(getTestUrl());
    
    // Should show auth screen now
    await expect(page.getByText('Enter your credentials to start a terminal session')).toBeVisible();
    
    // Now enter a new API key through the form
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey!);
    await page.click('button:has-text("Connect to Terminal")');
    
    // Should connect with custom auth
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Custom Auth')).toBeVisible();
  });
});