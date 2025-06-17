/**
 * Connection manager for Playwright tests
 * Provides utilities for managing WebSocket connections with rate limiting
 */
import { Page } from 'playwright/test';
import { connectWithRateLimit, getRateLimiterStatus } from './rate-limiter';
import { waitForTerminalReady } from '../wait-helpers';
import { authenticateWebCli } from '../auth-helper';

export interface ConnectionOptions {
  apiKey?: string;
  serverUrl?: string;
  timeout?: number;
  testName: string;
}

/**
 * Establish a rate-limited connection to the Web CLI
 */
export async function establishConnection(
  page: Page,
  options: ConnectionOptions
): Promise<void> {
  const { apiKey, serverUrl, timeout = 60000, testName } = options;
  
  console.log(`[ConnectionManager] Establishing connection for test: ${testName}`);
  
  // Log current rate limiter status
  const status = getRateLimiterStatus();
  console.log(`[ConnectionManager] Rate limiter status:`, status);
  
  // Use rate limiter for the entire connection process
  await connectWithRateLimit(
    page,
    async () => {
      // Navigate to the page (this creates the WebSocket connection)
      const url = serverUrl || process.env.WEB_CLI_TEST_URL || 'http://localhost:5173';
      await page.goto(url);
      
      // Authenticate if API key provided
      if (apiKey) {
        await authenticateWebCli(page, apiKey);
      } else {
        await authenticateWebCli(page);
      }
      
      // Wait for terminal to be ready
      const terminalSelector = '.xterm';
      await page.waitForSelector(terminalSelector, { timeout });
      await waitForTerminalReady(page, timeout);
    },
    testName
  );
  
  console.log(`[ConnectionManager] Connection established for test: ${testName}`);
}

/**
 * Disconnect and cleanup
 */
export async function disconnectAndCleanup(page: Page): Promise<void> {
  try {
    // Force close WebSocket if it exists
    await page.evaluate(() => {
      if ((window as any).ablyCliSocket) {
        (window as any).ablyCliSocket.close();
      }
    });
    
    // Clear session storage
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
  } catch (error) {
    console.error('[ConnectionManager] Error during cleanup:', error);
  }
}

/**
 * Wait for connection to stabilize
 */
export async function waitForConnectionStable(page: Page, timeout = 5000): Promise<void> {
  const startTime = Date.now();
  let lastStatus = '';
  let stableCount = 0;
  
  while (Date.now() - startTime < timeout) {
    const status = await page.evaluate(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus || 'unknown';
    });
    
    if (status === lastStatus && status === 'connected') {
      stableCount++;
      if (stableCount >= 3) {
        // Connection has been stable for 3 checks
        return;
      }
    } else {
      stableCount = 0;
    }
    
    lastStatus = status;
    await page.waitForTimeout(500);
  }
  
  throw new Error(`Connection did not stabilize within ${timeout}ms`);
}

/**
 * Execute a command with connection retry
 */
export async function executeCommandWithRetry(
  page: Page,
  command: string,
  expectedOutput: string,
  maxRetries = 3
): Promise<void> {
  const terminalSelector = '.xterm';
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Check connection status
      const status = await page.evaluate(() => {
        const state = (window as any).getAblyCliTerminalReactState?.();
        return state?.componentConnectionStatus || 'unknown';
      });
      
      if (status !== 'connected') {
        console.log(`[ConnectionManager] Not connected (${status}), waiting...`);
        await waitForConnectionStable(page);
      }
      
      // Focus terminal and type command
      await page.locator(terminalSelector).focus();
      await page.keyboard.type(command);
      await page.keyboard.press('Enter');
      
      // Wait for output with timeout
      // Use filter to check if text contains the expected output
      await page.waitForFunction(
        ([selector, expected]) => {
          const terminal = document.querySelector(selector);
          return terminal?.textContent?.includes(expected) || false;
        },
        [terminalSelector, expectedOutput],
        { timeout: 15000 }
      );
      
      return; // Success
    } catch (error) {
      console.error(`[ConnectionManager] Command execution failed (attempt ${attempt + 1}/${maxRetries}):`, error);
      
      // Debug: log terminal content
      const terminalContent = await page.locator(terminalSelector).textContent();
      console.error(`[ConnectionManager] Terminal content: ${terminalContent?.slice(-500)}`);  // Last 500 chars
      
      if (attempt < maxRetries - 1) {
        // Wait before retry
        await page.waitForTimeout(2000);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Monitor connection health during test
 */
export async function monitorConnectionHealth(page: Page): Promise<() => void> {
  let monitoring = true;
  const interval = 5000; // Check every 5 seconds
  
  const monitor = async () => {
    while (monitoring) {
      try {
        const health = await page.evaluate(() => {
          const state = (window as any).getAblyCliTerminalReactState?.();
          const socket = (window as any).ablyCliSocket;
          return {
            componentStatus: state?.componentConnectionStatus,
            isSessionActive: state?.isSessionActive,
            socketReadyState: socket?.readyState,
            sessionId: (window as any)._sessionId
          };
        });
        
        console.log(`[ConnectionHealth] Status: ${health.componentStatus}, Session: ${health.isSessionActive ? 'active' : 'inactive'}, Socket: ${health.socketReadyState}`);
      } catch (error) {
        console.error('[ConnectionHealth] Monitoring error:', error);
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  };
  
  // Start monitoring in background
  monitor().catch(console.error);
  
  // Return stop function
  return () => {
    monitoring = false;
  };
}