import { test as base } from 'playwright/test';
import { 
  setupConsoleCapture, 
  dumpConsoleOnFailure, 
  markTestAsFailing
} from './test-helpers';
import { setupCIAuth } from './setup-ci-auth';

// Extend the base test with our helpers
export const test = base.extend({
  // Auto-inject helpers into each test
  page: async ({ page }, use, testInfo) => {
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[BaseTest] Page fixture setup for "${testInfo.title}" at ${new Date().toISOString()}`);
      console.log(`[BaseTest] Worker index: ${testInfo.workerIndex}, Process ID: ${process.pid}`);
    }
    
    // Setup console capture
    setupConsoleCapture(page);
    
    // Add page error handler to catch WebSocket errors
    page.on('pageerror', error => {
      // Only log errors that aren't rate limiting in CI
      if (!process.env.CI || !error.message.includes('429') || process.env.VERBOSE_TESTS) {
        console.error('[Page Error]', error.message);
      }
    });
    
    // Add request failure handler
    page.on('requestfailed', request => {
      // Only log failures that aren't rate limiting in CI
      const errorText = request.failure()?.errorText || '';
      if (!process.env.CI || !errorText.includes('429') || process.env.VERBOSE_TESTS) {
        console.error('[Request Failed]', request.url(), request.failure()?.errorText);
      }
    });
    
    // Add WebSocket frame handler for debugging
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      page.on('websocket', ws => {
        const wsCreatedAt = new Date().toISOString();
        console.log(`[WebSocket] Created at ${wsCreatedAt}, URL: ${ws.url()}`);
        console.log(`[WebSocket] Test: "${testInfo.title}", Process ID: ${process.pid}`);
        
        // Log stack trace to understand WebSocket creation context
        const stack = new Error('Stack trace for WebSocket creation').stack;
        console.log(`[WebSocket] Creation stack trace:\n${stack}`);
        
        ws.on('framesent', frame => {
          if (process.env.VERBOSE_TESTS) {
            console.log(`[WebSocket] Sent at ${new Date().toISOString()}:`, frame.payload?.toString().slice(0, 100));
          }
        });
        
        ws.on('framereceived', frame => {
          if (process.env.VERBOSE_TESTS) {
            console.log(`[WebSocket] Received at ${new Date().toISOString()}:`, frame.payload?.toString().slice(0, 100));
          }
        });
        
        ws.on('close', () => {
          console.log(`[WebSocket] Closed at ${new Date().toISOString()} (was created at ${wsCreatedAt})`);
        });
        
        ws.on('socketerror', error => {
          // Only log non-rate-limit errors or in verbose mode
          const errorStr = error.toString();
          if (!errorStr.includes('429') || process.env.VERBOSE_TESTS) {
            console.error(`[WebSocket] Error at ${new Date().toISOString()}:`, error);
          }
        });
      });
    } else {
      // Still handle WebSocket errors even in quiet mode
      page.on('websocket', ws => {
        ws.on('socketerror', error => {
          // Only log non-rate-limit errors or in verbose mode
          const errorStr = error.toString();
          if (!errorStr.includes('429') || process.env.VERBOSE_TESTS) {
            console.error(`[WebSocket] Error at ${new Date().toISOString()}:`, error);
          }
        });
      });
    }
    
    // Setup CI authentication if enabled
    await setupCIAuth(page);
    
    // Set viewport for consistency
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Use the page
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[BaseTest] Handing page to test at ${new Date().toISOString()}`);
    }
    
    await use(page);
    
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[BaseTest] Test finished using page at ${new Date().toISOString()}`);
    }
    
    // Handle test failure
    if (testInfo.status === 'failed') {
      console.log(`[BaseTest] Test "${testInfo.title}" failed`);
      markTestAsFailing();
    }
    
    // Dump console on failure
    dumpConsoleOnFailure();
    
    // Add a small delay between tests when running against production
    const isProduction = !process.env.TERMINAL_SERVER_URL || process.env.TERMINAL_SERVER_URL.includes('web-cli.ably.com');
    if (isProduction) {
      await page.waitForTimeout(1000);
    }
    
    if (!process.env.CI || process.env.VERBOSE_TESTS) {
      console.log(`[BaseTest] Page fixture cleanup complete for "${testInfo.title}" at ${new Date().toISOString()}`);
    }
  },
});

// Re-export expect and other utilities
export { expect } from 'playwright/test';
export { getTestUrl, buildTestUrl, log, reloadPageWithRateLimit } from './test-helpers';