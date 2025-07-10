import { setupWebServer } from './shared-setup';
import { setupRateLimiter } from './rate-limit-config';
import { resetRateLimiter } from './helpers/rate-limiter';
import { resetConnectionCount } from './test-rate-limiter';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

async function globalSetup() {
  console.log('[Global Setup] Starting...');
  
  // Load environment variables from .env file
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const result = config({ path: envPath });
    if (result.error) {
      console.warn(`[Global Setup] Warning: Error loading .env file: ${result.error.message}`);
    } else if (result.parsed) {
      console.log(`[Global Setup] Loaded environment variables from .env file`);
      // Log API key presence (not the actual key)
      if (process.env.E2E_ABLY_API_KEY) {
        console.log('[Global Setup] E2E_ABLY_API_KEY is set');
      }
    }
  } else {
    console.log('[Global Setup] No .env file found. Using environment variables from current environment.');
  }
  
  // In CI, test network connectivity to the WebSocket server
  if (process.env.CI) {
    console.log('[Global Setup] Testing network connectivity in CI...');
    try {
      const https = await import('node:https');
      const testUrl = new URL('https://web-cli.ably.com');
      await new Promise<void>((resolve, reject) => {
        https.get(testUrl.href, (res) => {
          console.log(`[Global Setup] HTTPS connection test: status ${res.statusCode}`);
          res.destroy();
          resolve();
        }).on('error', reject);
      });
    } catch (error) {
      console.error('[Global Setup] Network connectivity test failed:', error);
    }
  }
  
  // Initialize rate limiter configuration
  console.log('[Global Setup] Configuring rate limiter...');
  setupRateLimiter();
  
  // Reset rate limiter to ensure clean state
  resetRateLimiter();
  
  // Reset connection count for rate limiting
  resetConnectionCount();
  
  // Add initial delay to ensure we start with a clean rate limit window
  if (!process.env.SKIP_INITIAL_DELAY) {
    const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
    const initialDelay = isCI ? 30000 : 10000; // 30s for CI, 10s for local
    console.log(`[Global Setup] Waiting ${initialDelay/1000} seconds to ensure clean rate limit window...`);
    await new Promise(resolve => setTimeout(resolve, initialDelay));
  }
  
  // Start the shared web server
  const url = await setupWebServer();
  console.log(`[Global Setup] Web server ready at ${url}`);
  
  // Store the URL in environment variable for tests to use
  process.env.WEB_CLI_TEST_URL = url;
  
  console.log('[Global Setup] Complete.');
}

export default globalSetup;