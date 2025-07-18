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
    console.log(`[BaseTest] Page fixture setup for "${testInfo.title}" at ${new Date().toISOString()}`);
    console.log(`[BaseTest] Worker index: ${testInfo.workerIndex}, Process ID: ${process.pid}`);
    
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
    
    // Add WebSocket frame handler for debugging - always enabled for diagnostic logging
    page.on('websocket', ws => {
      const wsCreatedAt = new Date().toISOString();
      console.log(`[WebSocket] Created at ${wsCreatedAt}, URL: ${ws.url()}`);
      console.log(`[WebSocket] Test: "${testInfo.title}", Process ID: ${process.pid}`);
      
      // Log stack trace to understand WebSocket creation context
      const stack = new Error('Stack trace for WebSocket creation').stack;
      console.log(`[WebSocket] Creation stack trace:\n${stack}`);
      
      ws.on('framesent', frame => {
        if (process.env.CI || process.env.VERBOSE_TESTS) {
          console.log(`[WebSocket] Sent at ${new Date().toISOString()}:`, frame.payload?.toString().slice(0, 100));
        }
      });
      
      ws.on('framereceived', frame => {
        if (process.env.CI || process.env.VERBOSE_TESTS) {
          console.log(`[WebSocket] Received at ${new Date().toISOString()}:`, frame.payload?.toString().slice(0, 100));
        }
      });
      
      ws.on('close', () => {
        console.log(`[WebSocket] Closed at ${new Date().toISOString()} (was created at ${wsCreatedAt})`);
      });
      
      ws.on('socketerror', error => {
        console.error(`[WebSocket] Error at ${new Date().toISOString()}:`, error);
      });
    });
    
    // Set viewport for consistency
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Use the page
    console.log(`[BaseTest] Handing page to test at ${new Date().toISOString()}`);
    await use(page);
    console.log(`[BaseTest] Test finished using page at ${new Date().toISOString()}`);
    
    // Handle test failure
    if (testInfo.status === 'failed') {
      console.log(`[BaseTest] Test "${testInfo.title}" failed`);
      markTestAsFailing();
    }
    
    // Dump console on failure
    dumpConsoleOnFailure();
    console.log(`[BaseTest] Page fixture cleanup complete for "${testInfo.title}" at ${new Date().toISOString()}`);
  },
});

// Re-export expect and other utilities
export { expect } from 'playwright/test';
export { getTestUrl, buildTestUrl, log, reloadPageWithRateLimit } from './test-helpers';