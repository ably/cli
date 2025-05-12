/* eslint-disable unicorn/consistent-function-scoping, unicorn/prefer-dom-node-text-content, unicorn/no-await-expression-member */
import { test, expect, type BrowserContext } from 'playwright/test';
import { startWebServer, stopWebServer, startTerminalServer, stopTerminalServer } from './reconnection-utils';

const WEB_SERVER_PORT = Number(process.env.WEB_SERVER_PORT) || 48101;
const TERMINAL_SERVER_PORT = Number(process.env.TERMINAL_SERVER_PORT) || 48100;
const WS_URL = `ws://localhost:${TERMINAL_SERVER_PORT}`;
const PROMPT = '$ ';

// Allow time – we spin up real Docker containers
test.setTimeout(120_000);

let context: BrowserContext;
let webServerProcess: any;
let terminalServerProcess: any;

async function ensureServers() {
  if (!webServerProcess) webServerProcess = await startWebServer(WEB_SERVER_PORT);
  if (!terminalServerProcess) terminalServerProcess = await startTerminalServer(TERMINAL_SERVER_PORT);
}

test.beforeEach(async () => {
  await ensureServers();
});

test.describe('Prompt integrity & exit behaviour', () => {
  test.beforeAll(async ({ browser }) => {
    await ensureServers();
    context = await browser.newContext();
  });

  test.afterAll(async () => {
    if (terminalServerProcess) await stopTerminalServer(terminalServerProcess);
    if (webServerProcess) await stopWebServer(webServerProcess);
    await context.close();
  });

  async function waitForPrompt(page: import('playwright/test').Page) {
    await page.waitForFunction(() => {
      const term = document.querySelector('.xterm');
      return term && term.textContent?.trim().endsWith('$');
    }, { timeout: 60_000 });
  }

  test('Page reload resumes session without injecting extra blank prompts', async () => {
    const page = await context.newPage();
    await page.goto(`http://localhost:${WEB_SERVER_PORT}?serverUrl=${encodeURIComponent(WS_URL)}`, { waitUntil: 'networkidle' });
    const terminal = page.locator('.xterm');

    await waitForPrompt(page);

    const initialText = (await terminal.innerText()).trimEnd();

    // Reload the page and wait for resume
    await page.reload({ waitUntil: 'networkidle' });
    await waitForPrompt(page);

    const afterReloadText = (await terminal.innerText()).trimEnd();
    expect(afterReloadText).toBe(initialText);

    // Reload once more to guard against cumulative effects
    await page.reload({ waitUntil: 'networkidle' });
    await waitForPrompt(page);
    const afterSecondReloadText = (await terminal.innerText()).trimEnd();
    expect(afterSecondReloadText).toBe(initialText);

    await page.close();
  });

  test('Typing `exit` ends session and prevents automatic resume on refresh', async () => {
    const page = await context.newPage();
    await page.goto(`http://localhost:${WEB_SERVER_PORT}?serverUrl=${encodeURIComponent(WS_URL)}`, { waitUntil: 'networkidle' });
    const terminal = page.locator('.xterm');

    await waitForPrompt(page);

    // Send exit command
    await terminal.focus();
    await page.keyboard.type('exit');
    await page.keyboard.press('Enter');

    // Wait for the overlay indicating disconnected state
    await page.waitForSelector('.ably-overlay', { timeout: 15_000 });

    // Reload – component should NOT auto-resume, overlay should still be visible
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.ably-overlay', { timeout: 15_000 });

    // Ensure prompt is NOT present
    const txt = await terminal.innerText();
    expect(txt.includes(PROMPT)).toBeFalsy();

    await page.close();
  });
}); 