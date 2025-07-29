/**
 * Test wrapper that ensures rate limiting is checked before test execution
 */
import { test as base } from './base-test';
import { waitForRateLimitLock } from '../rate-limit-lock';

// Extend the test to add rate limit checking before each test
export const test = base.extend({
  // Override the page fixture to add rate limit checking
  page: async ({ page }, use, _testInfo) => {
    // Wait for any ongoing rate limit pause before starting the test
    await waitForRateLimitLock();
    
    // Use the page normally
    await use(page);
  },
});

// Re-export everything else from base-test
export { expect, getTestUrl, buildTestUrl, log, reloadPageWithRateLimit } from './base-test';