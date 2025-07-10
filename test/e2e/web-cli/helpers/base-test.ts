import { test as base } from 'playwright/test';
import { 
  setupConsoleCapture, 
  dumpConsoleOnFailure, 
  markTestAsFailing
} from './test-helpers';

// Extend the base test with our helpers
export const test = base.extend({
  // Auto-inject helpers into each test
  page: async ({ page }, use, testInfo) => {
    // Setup console capture
    setupConsoleCapture(page);
    
    // Add page error handler to catch WebSocket errors
    page.on('pageerror', error => {
      console.error('[Page Error]', error.message);
    });
    
    // Add request failure handler
    page.on('requestfailed', request => {
      console.error('[Request Failed]', request.url(), request.failure()?.errorText);
    });
    
    // Add WebSocket frame handler for debugging in CI
    if (process.env.CI) {
      page.on('websocket', ws => {
        console.log('[WebSocket] Created:', ws.url());
        ws.on('framesent', frame => console.log('[WebSocket] Sent:', frame.payload?.toString().slice(0, 100)));
        ws.on('framereceived', frame => console.log('[WebSocket] Received:', frame.payload?.toString().slice(0, 100)));
        ws.on('close', () => console.log('[WebSocket] Closed'));
        ws.on('socketerror', error => console.error('[WebSocket] Error:', error));
      });
    }
    
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
export { getTestUrl, buildTestUrl, log, reloadPageWithRateLimit } from './test-helpers';