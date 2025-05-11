import { test, expect } from '@playwright/test';

// Verifies the red error overlay appears when the server rejects the credentials during the first handshake.

test('shows SERVER DISCONNECT overlay for invalid credentials', async ({ page, baseURL }) => {
  // Provide an obviously invalid JWT-looking token so the terminal-server closes with 4001 Invalid token
  const badToken = 'abc.def.ghi';
  const url = `${baseURL || '/'}?mode=fullscreen&accessToken=${badToken}`;

  await page.goto(url);

  // Wait for the overlay div to appear and contain the expected title
  const overlay = page.locator('.ably-overlay');
  await expect(overlay).toBeVisible({ timeout: 10000 });
  await expect(overlay).toContainText('SERVER DISCONNECT');

  // The header status text should switch to "disconnected"
  await expect(page.locator('.status')).toHaveText('disconnected');
}); 