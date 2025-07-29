import { test, expect, getTestUrl } from './helpers/base-test';
import { incrementConnectionCount, waitForRateLimitIfNeeded } from './test-rate-limiter';
import { waitForRateLimitLock } from './rate-limit-lock';

test.describe('Domain-Scoped Authentication E2E Tests', () => {
  test.setTimeout(120_000); // Overall test timeout
  test.describe.configure({ mode: 'serial' }); // Run tests serially to avoid interference

  test('should store credentials scoped to WebSocket domain', async ({ page }) => {
    // Wait for any ongoing rate limit pause
    await waitForRateLimitLock();
    
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
    }

    // Navigate to the page
    await page.goto(getTestUrl());
    
    // Check remember credentials checkbox
    await page.check('#rememberCredentials');
    
    // Check rate limit before attempting connection
    await waitForRateLimitIfNeeded();
    
    // Authenticate
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    incrementConnectionCount();
    await page.click('button:has-text("Connect to Terminal")');
    
    // Wait for terminal to be visible
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Check that credentials are stored with domain scope
    const storedKeys = await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('ably.web-cli.')) {
          keys.push(key);
        }
      }
      return keys;
    });
    
    // Should have domain-scoped keys - the app uses web-cli.ably.com as the default WebSocket URL
    const expectedDomain = 'web-cli.ably.com';
    expect(storedKeys.some(key => key.includes('.apiKey.') && key.includes(expectedDomain))).toBe(true);
    expect(storedKeys.some(key => key.includes('.rememberCredentials.') && key.includes(expectedDomain))).toBe(true);
  });

  test('should not share credentials between different domains', async ({ page }) => {
    // Wait for any ongoing rate limit pause
    await waitForRateLimitLock();
    
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
    }

    // First, authenticate with the default domain
    await page.goto(getTestUrl());
    await page.check('#rememberCredentials');
    
    await waitForRateLimitIfNeeded();
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    incrementConnectionCount();
    await page.click('button:has-text("Connect to Terminal")');
    
    // Wait for terminal
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Store a different API key for a different domain in localStorage
    await page.evaluate(() => {
      // Store credentials for a different domain
      localStorage.setItem('ably.web-cli.apiKey.example.com', 'different-key:secret');
      localStorage.setItem('ably.web-cli.rememberCredentials.example.com', 'true');
    });
    
    // Verify that credentials are isolated
    const credentialData = await page.evaluate(() => {
      const data: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('ably.web-cli.apiKey.')) {
          data[key] = localStorage.getItem(key);
        }
      }
      return data;
    });
    
    // Should have credentials for both domains
    const domains = Object.keys(credentialData);
    expect(domains.length).toBeGreaterThanOrEqual(2);
    
    // Credentials should be different  
    const webCliAblyKey = Object.entries(credentialData).find(([k]) => k.includes('web-cli.ably.com'))?.[1];
    const exampleKey = Object.entries(credentialData).find(([k]) => k.includes('example.com'))?.[1];
    
    expect(webCliAblyKey).toBeTruthy();
    expect(exampleKey).toBeTruthy();
    expect(webCliAblyKey).not.toBe(exampleKey);
  });

  test('should clear only current domain credentials when clearing', async ({ page }) => {
    // Wait for any ongoing rate limit pause
    await waitForRateLimitLock();
    
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
    }

    await page.goto(getTestUrl());
    
    // Store credentials for multiple domains
    await page.evaluate(() => {
      // Current domain should be web-cli.ably.com (default WebSocket URL)
      const wsDomain = 'web-cli.ably.com';
      localStorage.setItem(`ably.web-cli.apiKey.${wsDomain}`, 'current-key:secret');
      localStorage.setItem(`ably.web-cli.rememberCredentials.${wsDomain}`, 'true');
      
      // Another domain
      localStorage.setItem('ably.web-cli.apiKey.other-domain.com', 'other-key:secret');
      localStorage.setItem('ably.web-cli.rememberCredentials.other-domain.com', 'true');
    });
    
    // Reload with clearCredentials flag
    const urlWithClear = getTestUrl().includes('?') 
      ? getTestUrl() + '&clearCredentials=true'
      : getTestUrl() + '?clearCredentials=true';
    await page.goto(urlWithClear);
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle');
    
    // Check remaining credentials
    const remainingCredentials = await page.evaluate(() => {
      const creds: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('ably.web-cli.')) {
          creds[key] = localStorage.getItem(key);
        }
      }
      return creds;
    });
    
    // Should have cleared current domain but kept other domain
    const currentDomainKeys = Object.keys(remainingCredentials).filter(k => k.includes('web-cli.ably.com'));
    const otherDomainKeys = Object.keys(remainingCredentials).filter(k => k.includes('other-domain.com'));
    
    expect(currentDomainKeys.length).toBe(0);
    expect(otherDomainKeys.length).toBeGreaterThan(0);
  });

  test('should use correct domain-scoped credentials when serverUrl parameter changes', async ({ page }) => {
    // Wait for any ongoing rate limit pause
    await waitForRateLimitLock();
    
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required for e2e tests');
    }

    // Note: This test demonstrates the security fix - credentials are now isolated per domain
    // In a real attack scenario, an attacker would direct users to a URL with serverUrl=wss://attacker.com
    // but would NOT receive the stored credentials for the legitimate domain
    
    // First, authenticate and store credentials for the default domain
    await page.goto(getTestUrl());
    await page.check('#rememberCredentials');
    
    await waitForRateLimitIfNeeded();
    await page.fill('input[placeholder="your_app.key_name:key_secret"]', apiKey);
    incrementConnectionCount();
    await page.click('button:has-text("Connect to Terminal")');
    
    // Wait for terminal
    await expect(page.locator('.xterm')).toBeVisible({ timeout: 15000 });
    
    // Store the legitimate credentials - we don't need to use the domain value
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      const wsUrl = url.searchParams.get('serverUrl') || 'wss://web-cli.ably.com';
      return new URL(wsUrl).host;
    });
    
    // Now simulate navigating to a malicious URL (we'll use a non-existent server for safety)
    // The key point is that it won't have access to the credentials from the legitimate domain
    const maliciousUrl = getTestUrl().includes('?') 
      ? getTestUrl() + '&serverUrl=wss://malicious.example.com'
      : getTestUrl() + '?serverUrl=wss://malicious.example.com';
    
    // Clear sessionStorage to simulate a fresh visit
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(maliciousUrl);
    
    // Should show auth screen because no credentials exist for malicious.example.com
    await expect(page.getByText('Enter your credentials to start a terminal session')).toBeVisible();
    
    // Verify that the legitimate credentials are NOT accessible
    const accessibleCredentials = await page.evaluate(() => {
      const wsUrl = new URL(new URLSearchParams(window.location.search).get('serverUrl') || 'wss://web-cli.ably.com');
      const domain = wsUrl.host;
      return {
        apiKey: localStorage.getItem(`ably.web-cli.apiKey.${domain}`),
        rememberCredentials: localStorage.getItem(`ably.web-cli.rememberCredentials.${domain}`)
      };
    });
    
    expect(accessibleCredentials.apiKey).toBeNull();
    expect(accessibleCredentials.rememberCredentials).toBeNull();
  });
});