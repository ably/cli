/**
 * Rate-limited test helper that extends the base test with connection throttling
 */
import { test as base } from './base-test';
import { 
  navigateWithRateLimit, 
  getRateLimiterStatus,
  waitForRateLimitWindow 
} from './rate-limiter';

// Extend the base test with rate limiting capabilities
export const test = base.extend({
  // Override page fixture to add rate limiting
  page: async ({ page }, use, testInfo) => {
    // Log rate limiter status at test start
    const status = getRateLimiterStatus();
    console.log(`[RateLimited Test] Starting "${testInfo.title}"`);
    console.log(`[RateLimited Test] Rate limiter status:`, status);
    
    // If we're at or near the limit, wait for window to clear
    if (status.recentAttempts >= 8) {
      console.log('[RateLimited Test] Near rate limit, waiting for window to clear...');
      await waitForRateLimitWindow();
    }
    
    // Use the page with rate limiting
    await use(page);
  },
  
  // Add a custom fixture for rate-limited navigation
  rateLimitedPage: async ({ page }, use, testInfo) => {
    const rateLimitedPage = {
      ...page,
      goto: async (url: string, options?: any) => {
        // Use rate-limited navigation
        await navigateWithRateLimit(page, url, testInfo.title);
        return page;
      }
    };
    
    await use(rateLimitedPage as any);
  }
});

// Re-export everything from base-test
export { expect, getTestUrl, buildTestUrl, log } from './base-test';