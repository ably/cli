import { test, expect, getTestUrl } from './helpers/base-test';
import { authenticateWebCli } from './auth-helper';

const log = console.log.bind(console);

// Public terminal server endpoint
const PUBLIC_TERMINAL_SERVER_URL = 'wss://web-cli.ably.com';

test.describe('Z-Rate Limit Trigger Test - MUST RUN LAST', () => {
  test.setTimeout(60_000); // 1 minute for this test

  test('should stop automatic reconnection after max attempts', async ({ page }) => {
    // This test verifies that the client stops auto-reconnecting after max attempts
    // The example app configures maxReconnectAttempts={5} 
    log('Starting max reconnection attempts test');
    
    // Navigate and authenticate
    await page.goto(getTestUrl());
    const apiKey = process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error('E2E_ABLY_API_KEY or ABLY_API_KEY environment variable is required');
    }
    
    await authenticateWebCli(page, apiKey);
    
    // Wait for terminal to be ready
    const terminalSelector = '.xterm';
    await expect(page.locator(terminalSelector)).toBeVisible({ timeout: 30000 });
    
    // Ensure we're connected initially
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'connected';
    }, { timeout: 30000 });
    
    log('Initial connection established');
    
    // The example app configures maxReconnectAttempts={5}
    // We'll trigger repeated network failures to hit this limit
    log('Triggering network disconnections to reach max reconnection attempts...');
    
    // Trigger disconnections while properly waiting for reconnection attempts
    // The app is configured with maxReconnectAttempts={5}
    
    // We need to wait for the 5th attempt timer to fire
    for (let attemptNum = 1; attemptNum <= 5; attemptNum++) {
      log(`Waiting for attempt ${attemptNum}...`);
      
      // Wait for current connection to establish or reconnection to start
      await page.waitForFunction(
        () => {
          const state = (window as any).getAblyCliTerminalReactState?.();
          return state?.componentConnectionStatus === 'connected' || 
                 state?.componentConnectionStatus === 'reconnecting';
        },
        { timeout: 30000 }
      );
      
      // Get current state
      const beforeState = await page.evaluate(() => {
        const s = (window as any).getAblyCliTerminalReactState?.();
        return {
          status: s?.componentConnectionStatus,
          attempts: s?.grCurrentAttempts,
          isMaxReached: s?.grIsMaxReached
        };
      });
      
      log(`Before disconnection: status=${beforeState.status}, attempts=${beforeState.attempts}`);
      
      // Only disconnect if connected
      if (beforeState.status === 'connected') {
        log(`Triggering disconnection to force attempt ${attemptNum + 1}...`);
        await page.evaluate(() => {
          if ((window as any).ablyCliSocket && (window as any).ablyCliSocket.readyState === WebSocket.OPEN) {
            (window as any).ablyCliSocket.close();
          }
        });
      }
      
      // Wait for state to update  
      await page.waitForTimeout(1000);
      
      const afterState = await page.evaluate(() => {
        const s = (window as any).getAblyCliTerminalReactState?.();
        return {
          attempts: s?.grCurrentAttempts,
          isMaxReached: s?.grIsMaxReached
        };
      });
      
      log(`After disconnection: attempts=${afterState.attempts}, maxReached=${afterState.isMaxReached}`);
      
      if (afterState.isMaxReached) {
        log('Max attempts reached!');
        break;
      }
      
      // Wait for next reconnection attempt (exponential backoff: 2s, 4s, 8s, 8s)
      const delays = [2000, 4000, 8000, 8000, 8000];
      const delay = delays[Math.min(attemptNum - 1, delays.length - 1)];
      log(`Waiting ${delay}ms for next reconnection...`);
      await page.waitForTimeout(delay + 1000); // Add buffer
    }
    
    // Brief pause to ensure state is stable
    await page.waitForTimeout(2000);
    
    // Verify max attempts was reached
    const finalState = await page.evaluate(() => {
      const s = (window as any).getAblyCliTerminalReactState?.();
      return {
        isMaxReached: s?.grIsMaxReached,
        attempts: s?.grCurrentAttempts
      };
    });
    
    log(`Final state: attempts=${finalState.attempts}, maxReached=${finalState.isMaxReached}`);
    
    // The key behavior is that max attempts was reached
    expect(finalState.isMaxReached).toBe(true);
    expect(finalState.attempts).toBe(5);
    
    // Verify the UI shows we're at max attempts - look for the overlay box or terminal content
    const hasAttemptText = await page.getByText(/Attempt 5\/5/i).isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasAttemptText).toBe(true);
    log('UI shows attempt 5/5');
    
    // Verify status shows reconnecting
    await expect(page.locator('.App-header span.status-reconnecting')).toBeVisible({ timeout: 5000 });
    
    log('Test completed: Client correctly stops auto-reconnecting after 5 attempts');
  });
});