import { Page } from 'playwright/test';

/**
 * Wait for the terminal to be ready for interaction
 * This is a more robust approach that checks multiple conditions
 */
export async function waitForTerminalReady(page: Page, timeout = 60000): Promise<void> {
  console.log('Waiting for terminal to be ready...');
  
  // Increase timeout for CI environments
  const effectiveTimeout = process.env.CI ? timeout * 2 : timeout;
  const startTime = Date.now();
  let manualReconnectAttempts = 0;
  const maxManualReconnects = process.env.CI ? 5 : 3;
  
  // Wait for the terminal element to exist
  await page.waitForSelector('.xterm', { timeout: 15000 });
  
  // Wait for the React component to be mounted and have a non-initial state
  await page.waitForFunction(() => {
    const state = (window as Window & { getAblyCliTerminalReactState?: () => unknown }).getAblyCliTerminalReactState?.();
    return state && (state as { componentConnectionStatus?: string }).componentConnectionStatus !== 'initial';
  }, null, { timeout: 10000 });
  
  // Get the current state
  let currentState = await page.evaluate(() => {
    return (window as Window & { getAblyCliTerminalReactState?: () => unknown }).getAblyCliTerminalReactState?.();
  }) as { componentConnectionStatus?: string; isSessionActive?: boolean; showManualReconnectPrompt?: boolean } | undefined;
  
  console.log('Initial connection state:', currentState?.componentConnectionStatus);
  
  // Handle different states
  while (Date.now() - startTime < effectiveTimeout) {
    currentState = await page.evaluate(() => {
      return (window as Window & { getAblyCliTerminalReactState?: () => unknown }).getAblyCliTerminalReactState?.();
    }) as { componentConnectionStatus?: string; isSessionActive?: boolean; showManualReconnectPrompt?: boolean } | undefined;
    
    if (currentState?.componentConnectionStatus === 'connected' && currentState?.isSessionActive) {
      console.log('Terminal connected and session active');
      await page.waitForTimeout(500); // Give time for prompt to render
      return;
    }
    
    if (currentState?.componentConnectionStatus === 'disconnected' && currentState?.showManualReconnectPrompt) {
      if (manualReconnectAttempts < maxManualReconnects) {
        console.log(`Terminal disconnected, attempting manual reconnect (attempt ${manualReconnectAttempts + 1}/${maxManualReconnects})...`);
        await page.keyboard.press('Enter');
        manualReconnectAttempts++;
        // Wait longer for reconnection in CI
        const reconnectWait = process.env.CI ? 5000 : 2000;
        await page.waitForTimeout(reconnectWait);
        continue;
      } else {
        console.log('Max manual reconnect attempts reached, giving up');
        break;
      }
    }
    
    if (currentState?.componentConnectionStatus === 'connecting' || currentState?.componentConnectionStatus === 'reconnecting') {
      // Still connecting, wait a bit more
      await page.waitForTimeout(1000);
      continue;
    }
    
    // Check if there's any text in the terminal that looks like a prompt
    const terminalText = await page.locator('.xterm').textContent();
    if (terminalText && (terminalText.includes('$') || terminalText.includes('#') || terminalText.includes('>'))) {
      console.log('Prompt-like text detected in terminal');
      return;
    }
    
    await page.waitForTimeout(500);
  }
  
  // If we get here, we timed out
  const finalState = await page.evaluate(() => {
    const win = window as Window & { 
      getAblyCliTerminalReactState?: () => unknown;
      ablyCliSocket?: { readyState?: number };
      __consoleLogs?: unknown[];
      _sessionId?: string;
    };
    const state = win.getAblyCliTerminalReactState?.();
    const socketStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    const socketState = win.ablyCliSocket?.readyState;
    const logs = win.__consoleLogs || [];
    
    return {
      reactState: state,
      socketReadyState: socketState,
      socketStateText: socketStates[socketState as number] || 'UNKNOWN',
      sessionId: win._sessionId,
      hasStateFunction: typeof win.getAblyCliTerminalReactState === 'function',
      recentConsoleLogs: logs.slice(-10)
    };
  });
  
  console.error('Terminal did not become ready within timeout');
  console.error('Final state:', JSON.stringify(finalState, null, 2));
  
  const terminalContent = await page.locator('.xterm').textContent();
  console.error('Terminal content:', terminalContent?.slice(0, 500) || 'No content');
  
  const reactState = finalState.reactState as { componentConnectionStatus?: string } | undefined;
  throw new Error(`Terminal not ready after ${effectiveTimeout}ms. State: ${reactState?.componentConnectionStatus || 'unknown'}`);
}

/**
 * Simple wait for prompt that's more forgiving
 */
export async function waitForPromptSimple(page: Page, _timeout = 30000): Promise<void> {
  console.log('Waiting for terminal prompt (simple)...');
  
  // Just wait for any character that typically appears in prompts
  const prompts = ['$', '#', '>', '~'];
  
  for (const prompt of prompts) {
    try {
      await page.locator('.xterm').locator(`text="${prompt}"`).first().waitFor({ 
        timeout: 5000, 
        state: 'visible' 
      });
      console.log(`Found prompt character: ${prompt}`);
      return;
    } catch {
      // Try next prompt character
    }
  }
  
  // If no prompt found, just check if terminal has any text
  const terminalText = await page.locator('.xterm').textContent();
  if (terminalText && terminalText.trim().length > 0) {
    console.log('Terminal has text, proceeding...');
    return;
  }
  
  throw new Error('No prompt or text found in terminal');
}