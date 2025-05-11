import { test, expect, Page } from '@playwright/test';

/*
  The web terminal now renders all reconnection messaging directly **inside** the xterm instance
  rather than overlay HTML elements. The tests have been updated accordingly to interact solely
  with terminal text and keyboard input.
*/

// ---------- Helpers to intercept & control WebSocket connections ----------
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    const active: WebSocket[] = [];

    (window as any).__wsCtl = {
      closeAll: () => {
        active.forEach(ws => {
          ws.dispatchEvent(new CloseEvent('close', { code: 1006, reason: 'test', wasClean: false }));
        });
      },
      count: () => active.length,
    };

    class InterceptWS extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        active.push(this);
        this.addEventListener('close', () => {
          const idx = active.indexOf(this);
          if (idx !== -1) active.splice(idx, 1);
        });
      }
    }

    window.WebSocket = InterceptWS as unknown as typeof WebSocket;
  });
});

async function wsCount(page: Page) {
  return page.evaluate(() => (window as any).__wsCtl.count());
}

async function closeAll(page: Page) {
  await page.evaluate(() => (window as any).__wsCtl.closeAll());
}

// ---------- Tests ----------

test('auto-reconnect can be cancelled then manually restarted using Enter key', async ({ page, baseURL }) => {
  await page.goto(baseURL || '/');

  const statusSel = '.status';
  const termSel = '.xterm-viewport';

  // Wait for initial connection
  await expect(page.locator(statusSel)).toHaveText('connected', { timeout: 15000 });
  expect(await wsCount(page)).toBeGreaterThan(0);

  // Simulate connection loss
  await closeAll(page);
  await expect(page.locator(statusSel)).toHaveText('reconnecting', { timeout: 5000 });

  // Verify attempt message & countdown appear inside terminal
  await expect(page.locator(termSel)).toContainText('Reconnecting (Attempt', { timeout: 5000 });
  await expect(page.locator(termSel)).toContainText('Next attempt in', { timeout: 5000 });

  // Cancel auto-reconnect via <Enter>
  await page.click(termSel);
  await page.keyboard.press('Enter');
  await expect(page.locator(statusSel)).toHaveText('disconnected', { timeout: 5000 });
  await expect(page.locator(termSel)).toContainText('Reconnection attempts cancelled', { timeout: 3000 });

  // Manual reconnect via <Enter>
  await page.keyboard.press('Enter');
  await expect(page.locator(statusSel)).toHaveText('connecting', { timeout: 5000 });
  await expect(page.locator(statusSel)).toHaveText('connected', { timeout: 15000 });
});

test('manual reconnect prompt shown after max automatic attempts', async ({ page, baseURL }) => {
  test.setTimeout(60000);
  await page.goto(baseURL || '/');

  const statusSel = '.status';
  const termSel = '.xterm-viewport';

  await expect(page.locator(statusSel)).toHaveText('connected', { timeout: 15000 });

  // Cause repeated disconnects to exceed max attempts quickly
  for (let i = 0; i < 16; i++) {
    await closeAll(page);
    await page.waitForTimeout(100); // allow component to process
  }

  await expect(page.locator(statusSel)).toHaveText('disconnected', { timeout: 10000 });
  await expect(page.locator(termSel)).toContainText('Failed to reconnect after', { timeout: 5000 });
  await expect(page.locator(termSel)).toContainText('Press Enter to try reconnecting manually', { timeout: 5000 });
}); 