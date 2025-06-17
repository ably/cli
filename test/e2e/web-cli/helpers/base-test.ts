import { test as base } from 'playwright/test';
import { 
  setupConsoleCapture, 
  dumpConsoleOnFailure, 
  markTestAsFailing,
  getTestUrl,
  buildTestUrl,
  log
} from './test-helpers';
import { incrementTestCount, waitForRateLimitIfNeeded } from '../test-rate-limiter';

// Extend the base test with our helpers
export const test = base.extend({
  // Auto-inject helpers into each test
  page: async ({ page }, use, testInfo) => {
    // Rate limit check before test starts
    incrementTestCount();
    await waitForRateLimitIfNeeded();
    
    // Setup console capture
    setupConsoleCapture(page);
    
    // Set viewport for consistency
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Use the page
    await use(page);
    
    // Handle test failure
    if (testInfo.status === 'failed') {
      markTestAsFailing();
    }
    
    // Dump console on failure
    dumpConsoleOnFailure();
  },
});

// Re-export expect and other utilities
export { expect } from 'playwright/test';
export { getTestUrl, buildTestUrl, log };