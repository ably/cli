/*
 * The Playwright runner compiles this file in a Node environment that lacks DOM
 * typings. We declare a global `window` to keep TypeScript happy when Mocha
 * inadvertently tries to transpile this Playwright spec (e.g. when the Mocha
 * runner receives the file path but execution is later excluded). This avoids
 * TS2304: Cannot find name 'window'.
 */
declare const window: any;

import { test, expect, type Page as _Page } from 'playwright/test';
import { startWebServer, stopWebServer, startTerminalServer, stopTerminalServer } from './reconnection-utils';

const WEB_SERVER_PORT = Number(process.env.WEB_SERVER_PORT) || 48001;
const TERMINAL_SERVER_PORT = Number(process.env.TERMINAL_SERVER_PORT) || 48000;
const WS_URL = `ws://localhost:${TERMINAL_SERVER_PORT}`;

test.describe('Web CLI Reconnection Route Test Diagnostic', () => {
  let terminalServerProcess: any;
  let webServerProcess: any;

  test.beforeAll(async () => {
    terminalServerProcess = await startTerminalServer(TERMINAL_SERVER_PORT);
    webServerProcess = await startWebServer(WEB_SERVER_PORT);
  });

  test.afterAll(async () => {
    await stopWebServer(webServerProcess);
    await stopTerminalServer(terminalServerProcess);
  });

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`[Browser Console] ${msg.text()}`));
    await page.unroute('**/*');
    await page.evaluate(() => { delete (window as any).DEBUG_RouteHandlerCalledForWS; });
  });

  test('page.route should intercept WebSocket after page.goto(sameUrl)', async ({ page }) => {
    const pageUrl = `http://localhost:${WEB_SERVER_PORT}?serverUrl=${encodeURIComponent(WS_URL)}`;
    
    console.log('[Test] Initial page load...');
    await page.goto(pageUrl);
    await expect(page.locator('.xterm')).toContainText('$', { timeout: 20000 });
    console.log('[Test] Initial connection and prompt verified.');

    console.log(`[Test] Setting up route for ${WS_URL} to log and continue.`);
    let routeHandlerWasCalled = false;
    await page.route(WS_URL, async (route) => {
      console.log(`[Test] Route Handler for ${WS_URL} was called for URL: ${route.request().url()}`);
      routeHandlerWasCalled = true;
      await page.evaluate(() => { (window as any).DEBUG_RouteHandlerCalledForWS = true; });
      route.continue();
    });

    console.log('[Test] Performing second page.goto(sameUrl)...');
    await page.goto(pageUrl, { waitUntil: 'networkidle' }); // Or 'load' or 'domcontentloaded'
    console.log('[Test] Second page.goto(sameUrl) completed.');
    
    // Wait for the flag to be set by the route handler, or timeout
    try {
      await page.waitForFunction(() => (window as any).DEBUG_RouteHandlerCalledForWS === true, { timeout: 10000 });
      console.log('[Test] Browser flag DEBUG_RouteHandlerCalledForWS is true.');
    } catch (e) {
      console.log('[Test] Timeout waiting for DEBUG_RouteHandlerCalledForWS flag.');
    }
    
    expect(routeHandlerWasCalled).toBe(true); // This is the key assertion
  });
}); 