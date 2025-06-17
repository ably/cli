import { setupWebServer } from './shared-setup';
import { setupRateLimiter } from './rate-limit-config';
import { resetRateLimiter } from './helpers/rate-limiter';

async function globalSetup() {
  console.log('[Global Setup] Starting...');
  
  // Initialize rate limiter configuration
  console.log('[Global Setup] Configuring rate limiter...');
  setupRateLimiter();
  
  // Reset rate limiter to ensure clean state
  resetRateLimiter();
  
  // Start the shared web server
  const url = await setupWebServer();
  console.log(`[Global Setup] Web server ready at ${url}`);
  
  // Store the URL in environment variable for tests to use
  process.env.WEB_CLI_TEST_URL = url;
  
  console.log('[Global Setup] Complete.');
}

export default globalSetup;