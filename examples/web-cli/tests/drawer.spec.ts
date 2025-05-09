import { test, expect } from '@playwright/test';

test('should display connection status and connecting animation', async ({ page, baseURL }) => {
  await page.goto(baseURL || '/'); // Ensure baseURL is used if available

  const terminalSelector = '.xterm-viewport'; // Selector for the xterm.js viewport content
  const statusDisplaySelector = '[data-testid="connection-status"]';

  // 1. Initial Connecting State & Animation
  // Wait for the server to send the "connecting" status or client to set it
  await expect(page.locator(statusDisplaySelector)).toHaveText('connecting', { timeout: 10000 });

  // Check for animation text. This is a bit heuristic.
  // We expect the server to send "connecting" which triggers the animation.
  // The animation itself updates rapidly. We'll check for the base string.
  // Need to ensure the terminal has rendered content first.
  await page.waitForSelector(`${terminalSelector} .xterm-rows > :nth-child(1)`); // Wait for first row to render
  
  // Check for one of the animation frames
  // The animation writes with \r, so it will be on the current cursor line or a new line if cursor moved.
  // We might need a more robust way, perhaps by checking multiple frames over a short period.
  // For now, check if the terminal text content contains the base of the animation.
  // This part is tricky because the animation overwrites itself.
  // A better check might be to see if the *last* line or a specific part of the terminal shows it.
  // Let's look for the text appearing, assuming it will be visible for a moment.
  await expect(page.locator(terminalSelector)).toContainText('Connecting.', { timeout: 5000 });

  // 2. Connected State
  // Wait for the server to send "connected" status
  await expect(page.locator(statusDisplaySelector)).toHaveText('connected', { timeout: 15000 }); // Longer timeout for connection

  // Verify animation is gone and "Connected." message is shown
  // The animation line should be cleared, and "Connected." printed on a new line or overwriting it.
  await expect(page.locator(terminalSelector)).toContainText('Connected.', { timeout: 2000 });
  
  // After connection, the animation string should not be present prominently.
  // This check can be flaky if parts of "Connecting..." appear in other output.
  // For now, let's assume that if "Connected." is there, the animation was superseded.
  await expect(page.locator(terminalSelector)).not.toContainText('Connecting...', { timeout: 1000});
  await expect(page.locator(terminalSelector)).not.toContainText('Connecting.. ', { timeout: 1000});

  // 3. Optional: Test Disconnected State (if we can reliably trigger it)
  // This would require a way to make the server send a disconnect message or close the WebSocket.
  // For now, focusing on connecting -> connected.
});

test('should display connection status and connecting animation, then prompt', async ({ page, baseURL }) => {
  await page.goto(baseURL || '/');

  const terminalSelector = '.xterm-viewport';
  const terminalRowsSelector = `${terminalSelector} .xterm-rows`; // Target rows for more precise content checks
  const statusDisplaySelector = '[data-testid="connection-status"]';

  // 1. Initial Connecting State & Animation
  await expect(page.locator(statusDisplaySelector)).toHaveText('connecting', { timeout: 10000 });
  await page.waitForSelector(`${terminalRowsSelector} > div`); // Wait for at least one row to render in terminal
  await expect(page.locator(terminalRowsSelector)).toContainText('Connecting.', { timeout: 5000 });

  // 2. Connected State & Prompt
  await expect(page.locator(statusDisplaySelector)).toHaveText('connected', { timeout: 15000 });

  // Verify animation is gone
  await expect(page.locator(terminalRowsSelector)).not.toContainText('Connecting.', { timeout: 2000 });
  
  // Check for the shell prompt (PS1 for the sandbox is '$ ')
  // The prompt might take a moment to appear after connection and PTY initialization.
  await expect(page.locator(terminalRowsSelector)).toContainText('$ ', { timeout: 5000 });
}); 