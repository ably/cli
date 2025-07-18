/**
 * Test wrapper that ensures rate limiting is checked before test execution
 */
import { test as base } from './base-test';
import { waitForRateLimitLock } from '../rate-limit-lock';

// Extend the test to add rate limit checking before each test
export const test = base.extend({
  // Override the page fixture to add rate limit checking
  page: async ({ page }, use, testInfo) => {
    console.log(`[RateLimitWrapper] Test starting: "${testInfo.title}" at ${new Date().toISOString()}`);
    console.log(`[RateLimitWrapper] Test file: ${testInfo.file}`);
    console.log(`[RateLimitWrapper] Test line: ${testInfo.line}`);
    console.log(`[RateLimitWrapper] Worker index: ${testInfo.workerIndex}`);
    console.log(`[RateLimitWrapper] Parallel index: ${testInfo.parallelIndex}`);
    console.log(`[RateLimitWrapper] Process ID: ${process.pid}`);
    
    // Wait for any ongoing rate limit pause before starting the test
    console.log(`[RateLimitWrapper] Checking for rate limit lock...`);
    await waitForRateLimitLock();
    console.log(`[RateLimitWrapper] Rate limit check complete, proceeding with test`);
    
    // Use the page normally
    await use(page);
    
    console.log(`[RateLimitWrapper] Test finished: "${testInfo.title}" at ${new Date().toISOString()}`);
  },
});

// Re-export everything else from base-test
export { expect, getTestUrl, buildTestUrl, log, reloadPageWithRateLimit } from './base-test';