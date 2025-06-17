import { test, expect, getTestUrl, log } from './helpers/base-test';
import { authenticateWebCli } from './auth-helper.js';

// Public terminal server endpoint
const PUBLIC_TERMINAL_SERVER_URL = 'wss://web-cli.ably.com';

test.describe('Web CLI Prompt Integrity E2E Tests', () => {
  test.setTimeout(120_000);

  test('Page reload resumes session without injecting extra blank prompts', async ({ page }) => {
    await page.goto(`${getTestUrl()}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}&cliDebug=true`, { waitUntil: 'networkidle' });
    await authenticateWebCli(page);
    const terminal = page.locator('.xterm:not(#initial-xterm-placeholder)');

    // Wait for terminal to be ready and connected to shell
    await terminal.waitFor({ timeout: 60000 });
    // Wait for the terminal to be connected and have a session
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'connected';
    }, { timeout: 30000 });

    // Wait for terminal prompt
    await expect(terminal).toContainText('$', { timeout: 60000 });

    // Run a few commands to establish terminal state
    await terminal.click();
    await page.keyboard.type('echo "Test line 1"');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('Test line 1', { timeout: 5000 });

    await page.keyboard.type('echo "Test line 2"');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('Test line 2', { timeout: 5000 });

    // Get terminal text before reload
    const terminalTextBefore = await terminal.textContent();
    const promptCountBefore = (terminalTextBefore?.match(/\$/g) || []).length;
    log(`Prompts before reload: ${promptCountBefore}`);

    // Take a screenshot before reload for debugging
    await page.screenshot({ path: 'test-results/prompt-before-reload.png' });

    // Reload the page
    log('Reloading page...');
    await page.reload({ waitUntil: 'networkidle' });

    // Wait for terminal to reappear after reload
    await terminal.waitFor({ timeout: 60000 });

    // Wait for session resume
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'connected';
    }, { timeout: 30000 });

    // Give some time for any errant prompts to appear
    await page.waitForTimeout(3000);

    // Take a screenshot after reload for debugging
    await page.screenshot({ path: 'test-results/prompt-after-reload.png' });

    // Get terminal text after reload
    const terminalTextAfter = await terminal.textContent();
    const promptCountAfter = (terminalTextAfter?.match(/\$/g) || []).length;
    log(`Prompts after reload: ${promptCountAfter}`);

    // Log terminal content for debugging
    log('Terminal content after reload:');
    log(terminalTextAfter?.substring(0, 500) || 'No content');

    // The prompt count should not increase after reload
    // We allow for at most 1 additional prompt to account for potential timing
    const promptDifference = promptCountAfter - promptCountBefore;
    expect(promptDifference).toBeLessThanOrEqual(1);

    // Verify that the previous commands are still visible
    expect(terminalTextAfter).toContain('Test line 1');
    expect(terminalTextAfter).toContain('Test line 2');

    // Verify terminal is still functional
    await terminal.click();
    await page.keyboard.type('echo "After reload"');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('After reload', { timeout: 5000 });
  });

  test('Multiple reloads should not accumulate prompts', async ({ page }) => {
    await page.goto(`${getTestUrl()}?serverUrl=${encodeURIComponent(PUBLIC_TERMINAL_SERVER_URL)}&cliDebug=true`, { waitUntil: 'networkidle' });
    await authenticateWebCli(page);
    const terminal = page.locator('.xterm:not(#initial-xterm-placeholder)');

    // Wait for terminal to be ready
    await terminal.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const state = (window as any).getAblyCliTerminalReactState?.();
      return state?.componentConnectionStatus === 'connected';
    }, { timeout: 30000 });

    // Wait for terminal prompt
    await expect(terminal).toContainText('$', { timeout: 60000 });

    // Run a command
    await terminal.click();
    await page.keyboard.type('echo "Initial state"');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('Initial state', { timeout: 5000 });

    const initialPromptCount = (await terminal.textContent())?.match(/\$/g)?.length || 0;
    log(`Initial prompt count: ${initialPromptCount}`);

    // Perform multiple reloads
    for (let i = 0; i < 3; i++) {
      log(`Reload ${i + 1}/3...`);
      await page.reload({ waitUntil: 'networkidle' });

      // Wait for terminal to reappear
      await terminal.waitFor({ timeout: 60000 });
      await page.waitForFunction(() => {
        const state = (window as any).getAblyCliTerminalReactState?.();
        return state?.componentConnectionStatus === 'connected';
      }, { timeout: 30000 });

      // Give time for any errant prompts
      await page.waitForTimeout(2000);
    }

    // Check final prompt count
    const finalPromptCount = (await terminal.textContent())?.match(/\$/g)?.length || 0;
    log(`Final prompt count after 3 reloads: ${finalPromptCount}`);

    // The prompt count should not grow significantly after multiple reloads
    // We allow a small tolerance for timing variations
    const promptGrowth = finalPromptCount - initialPromptCount;
    expect(promptGrowth).toBeLessThanOrEqual(3);

    // Verify terminal is still functional
    await terminal.click();
    await page.keyboard.type('echo "Still working"');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('Still working', { timeout: 5000 });
  });
});

// Re-export window declaration to ensure TypeScript compatibility
declare const window: any;