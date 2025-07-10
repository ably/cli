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
  
  // Add retry logic for flaky operations
  // const retryCount = process.env.CI ? 3 : 1;
  
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
      // Check if terminal has any content (like the warning message)
      const terminalText = await page.locator('.xterm').textContent();
      if (terminalText && terminalText.trim().length > 0) {
        console.log('Terminal has content, proceeding...');
        // Extra stabilization for CI
        const stabilizationTime = process.env.CI ? 2000 : 1000;
        await page.waitForTimeout(stabilizationTime);
        return;
      }
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
      ablyCliSocket?: { readyState?: number; url?: string };
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
      socketUrl: win.ablyCliSocket?.url || 'No socket',
      sessionId: win._sessionId,
      hasStateFunction: typeof win.getAblyCliTerminalReactState === 'function',
      recentConsoleLogs: logs.slice(-10)
    };
  });
  
  console.error('Terminal did not become ready within timeout');
  console.error('Final state:', JSON.stringify(finalState, null, 2));
  
  // In CI, capture additional debugging info
  if (process.env.CI) {
    const networkInfo = await page.evaluate(() => {
      return {
        online: navigator.onLine,
        userAgent: navigator.userAgent,
        location: window.location.href
      };
    });
    console.error('Network info:', JSON.stringify(networkInfo, null, 2));
  }
  
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

/**
 * Wait for a specific terminal output with retry logic
 */
export async function waitForTerminalOutput(
  page: Page, 
  expectedText: string, 
  options: { timeout?: number; exact?: boolean } = {}
): Promise<void> {
  const { timeout = 30000, exact = false } = options;
  const effectiveTimeout = process.env.CI ? timeout * 2 : timeout;
  
  console.log(`Waiting for terminal output: "${expectedText}" (exact: ${exact}, timeout: ${effectiveTimeout}ms)`);
  
  try {
    await page.waitForFunction(
      ({ expectedText, exact }) => {
        // Try to use the exposed terminal buffer function first
        const win = window as Window & { getTerminalBufferText?: () => string };
        if (typeof win.getTerminalBufferText === 'function') {
          const content = win.getTerminalBufferText() || "";
          return exact ? content.includes(expectedText) : content.toLowerCase().includes(expectedText.toLowerCase());
        }
        // Fallback to DOM text content
        const terminalElement = document.querySelector(".xterm");
        if (!terminalElement) return false;
        const content = terminalElement.textContent || "";
        return exact ? content.includes(expectedText) : content.toLowerCase().includes(expectedText.toLowerCase());
      },
      { expectedText, exact },
      { timeout: effectiveTimeout }
    );
  } catch (error) {
    // Get terminal content for debugging
    const terminalContent = await page.evaluate(() => {
      const win = window as Window & { getTerminalBufferText?: () => string };
      if (typeof win.getTerminalBufferText === 'function') {
        return win.getTerminalBufferText();
      }
      return document.querySelector('.xterm')?.textContent || '';
    });
    console.error(`Failed to find expected text: "${expectedText}"`);
    console.error(`Terminal content: ${terminalContent?.slice(0, 500) || 'No content'}`);
    throw error;
  }
}

/**
 * Get terminal content using the best available method
 */
export async function getTerminalContent(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const win = window as Window & { getTerminalBufferText?: () => string };
    if (typeof win.getTerminalBufferText === 'function') {
      return win.getTerminalBufferText();
    }
    return document.querySelector('.xterm')?.textContent || '';
  });
}

/**
 * Wait for terminal to be in a stable state (no ongoing operations)
 */
export async function waitForTerminalStable(page: Page, stabilityDuration = 1000): Promise<void> {
  const checkInterval = 100;
  let lastContent = "";
  let stableTime = 0;
  
  while (stableTime < stabilityDuration) {
    const currentContent = await getTerminalContent(page);
    
    if (currentContent === lastContent) {
      stableTime += checkInterval;
    } else {
      stableTime = 0;
      lastContent = currentContent;
    }
    
    await page.waitForTimeout(checkInterval);
  }
}

/**
 * Wait for session to be active with proper synchronization
 */
export async function waitForSessionActive(page: Page, timeout = 30000): Promise<void> {
  const effectiveTimeout = process.env.CI ? timeout * 2 : timeout;
  
  console.log('Waiting for session to become active...');
  
  // First wait for connected state
  await page.waitForFunction(
    () => {
      const win = window as Window & { getAblyCliTerminalReactState?: () => { componentConnectionStatus?: string } };
      const state = win.getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === "connected";
    },
    null,
    { timeout: effectiveTimeout }
  );
  
  console.log('Connected state reached, waiting for session activation...');
  
  // Then wait for session to be active
  await page.waitForFunction(
    () => {
      const win = window as Window & { getAblyCliTerminalReactState?: () => { isSessionActive?: boolean } };
      const state = win.getAblyCliTerminalReactState?.();
      return state?.isSessionActive === true;
    },
    null,
    { timeout: effectiveTimeout }
  );
  
  console.log('Session is now active');
  
  // In CI, add extra stabilization time
  if (process.env.CI) {
    await page.waitForTimeout(1000);
  }
}

/**
 * Safely reload page and wait for terminal to be ready
 */
export async function reloadAndWaitForTerminal(page: Page): Promise<void> {
  await page.reload();
  await waitForTerminalReady(page);
  await waitForSessionActive(page);
  // Additional stabilization time for CI
  if (process.env.CI) {
    await page.waitForTimeout(2000);
  }
}

/**
 * Wait for a specific connection state with proper timeout handling
 */
export async function waitForConnectionState(
  page: Page, 
  expectedState: string, 
  timeout = 30000
): Promise<void> {
  const effectiveTimeout = process.env.CI ? timeout * 2 : timeout;
  
  console.log(`Waiting for connection state: ${expectedState}`);
  
  await page.waitForFunction(
    (state) => {
      const win = window as Window & { getAblyCliTerminalReactState?: () => { componentConnectionStatus?: string } };
      const currentState = win.getAblyCliTerminalReactState?.();
      return currentState?.componentConnectionStatus === state;
    },
    expectedState,
    { timeout: effectiveTimeout }
  );
  
  console.log(`Connection state is now: ${expectedState}`);
}

/**
 * Execute a command in the terminal with retry logic
 * Ensures the command is executed successfully even if the terminal is temporarily unresponsive
 */
export async function executeCommandWithRetry(
  page: Page,
  command: string,
  expectedOutput: string,
  options: {
    retries?: number;
    retryDelay?: number;
    timeout?: number;
  } = {}
): Promise<void> {
  const { retries = 3, retryDelay = 1000, timeout = 10000 } = options;
  const terminal = page.locator('.xterm:not(#initial-xterm-placeholder)');
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Executing command (attempt ${attempt}/${retries}): ${command}`);
      
      // Ensure terminal is focused
      await terminal.click();
      await page.waitForTimeout(100);
      
      // Clear any partial input only on retry attempts
      if (attempt > 1) {
        await page.keyboard.press('Control+C');
        await page.waitForTimeout(200);
      }
      
      // Type the command
      await page.keyboard.type(command);
      await page.keyboard.press('Enter');
      
      // Wait for expected output
      await waitForTerminalOutput(page, expectedOutput, { timeout });
      
      console.log(`Command executed successfully: ${command}`);
      return;
    } catch (error) {
      console.log(`Command execution failed (attempt ${attempt}/${retries}): ${error}`);
      
      if (attempt < retries) {
        console.log(`Waiting ${retryDelay}ms before retry...`);
        await page.waitForTimeout(retryDelay);
        
        // Ensure session is still active before retry
        await waitForSessionActive(page);
      } else {
        throw new Error(`Failed to execute command after ${retries} attempts: ${command}`);
      }
    }
  }
}
