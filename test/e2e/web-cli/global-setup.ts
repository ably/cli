import { setupWebServer } from './shared-setup';
import { setupRateLimiter } from './rate-limit-config';
import { resetRateLimiter } from './helpers/rate-limiter';
import { resetConnectionCount } from './test-rate-limiter';
import { clearRateLimitLock } from './rate-limit-lock';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

async function globalSetup() {
  const startTime = Date.now();
  
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[Global Setup] Starting at ${new Date().toISOString()}`);
    console.log(`[Global Setup] Process ID: ${process.pid}`);
    console.log(`[Global Setup] Current working directory: ${process.cwd()}`);
    console.log(`[Global Setup] Memory usage: ${JSON.stringify(process.memoryUsage())}`);
    
    // Log call stack to understand execution context
    const stack = new Error('Stack trace for global setup context').stack;
    console.log(`[Global Setup] Call stack:\n${stack}`);
  }
  
  // Load environment variables from .env file
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const result = config({ path: envPath });
    if (result.error) {
      console.warn(`[Global Setup] Warning: Error loading .env file: ${result.error.message}`);
    } else if (result.parsed && (!process.env.CI || process.env.VERBOSE_TESTS)) {
      console.log(`[Global Setup] Loaded environment variables from .env file`);
      // Log API key presence (not the actual key)
      if (process.env.E2E_ABLY_API_KEY) {
        console.log('[Global Setup] E2E_ABLY_API_KEY is set');
      }
    }
  } else if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log('[Global Setup] No .env file found. Using environment variables from current environment.');
  }
  
  // In CI, test network connectivity to the WebSocket server
  if (process.env.CI && process.env.VERBOSE_TESTS) {
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
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[Global Setup] Configuring rate limiter at ${new Date().toISOString()}`);
  }
  setupRateLimiter();
  
  // Reset rate limiter to ensure clean state
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[Global Setup] Resetting rate limiter state...`);
  }
  resetRateLimiter();
  
  // Reset connection count for rate limiting
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[Global Setup] Resetting connection count...`);
  }
  resetConnectionCount();
  
  // Clear any stale rate limit locks
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[Global Setup] Clearing any stale rate limit locks...`);
  }
  clearRateLimitLock();
  
  // Add initial delay to ensure we start with a clean rate limit window
  if (!process.env.SKIP_INITIAL_DELAY && !process.env.CI_BYPASS_SECRET) {
    const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
    const initialDelay = isCI ? 30000 : 10000; // 30s for CI, 10s for local
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[Global Setup] Waiting ${initialDelay/1000} seconds to ensure clean rate limit window...`);
    }
    await new Promise(resolve => setTimeout(resolve, initialDelay));
  }
  
  // Start the shared web server
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[Global Setup] Starting web server at ${new Date().toISOString()}`);
  }
  
  const url = await setupWebServer();
  
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[Global Setup] Web server ready at ${url} at ${new Date().toISOString()}`);
  }
  
  // Store the URL in environment variable for tests to use
  process.env.WEB_CLI_TEST_URL = url;
  
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log(`[Global Setup] Complete at ${new Date().toISOString()}`);
    console.log(`[Global Setup] Total setup duration: ${Date.now() - startTime}ms`);
  }
  
  // Return cleanup function
  return async () => {
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[Global Setup] Cleanup called at ${new Date().toISOString()}`);
    }
  };
}

export default globalSetup;