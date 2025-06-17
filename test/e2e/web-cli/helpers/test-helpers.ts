import { Page } from 'playwright/test';

// Helper to suppress console output unless tests fail
let consoleMessages: Array<{ type: string; text: string; time: Date }> = [];
let isTestFailing = false;

export function setupConsoleCapture(page: Page): void {
  consoleMessages = [];
  
  page.on('console', msg => {
    const entry = {
      type: msg.type(),
      text: msg.text(),
      time: new Date(),
    };
    consoleMessages.push(entry);
    
    // Only output immediately if verbose mode or error
    if (process.env.VERBOSE_TESTS || msg.type() === 'error') {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    }
  });
  
  page.on('pageerror', error => {
    console.error('[Page Error]', error);
    isTestFailing = true;
  });
}

export function dumpConsoleOnFailure(): void {
  if (isTestFailing && consoleMessages.length > 0) {
    console.log('\n=== Browser Console Output (Test Failed) ===');
    consoleMessages.forEach(msg => {
      console.log(`[${msg.time.toISOString()}] [${msg.type}] ${msg.text}`);
    });
    console.log('===========================================\n');
  }
  consoleMessages = [];
  isTestFailing = false;
}

export function markTestAsFailing(): void {
  isTestFailing = true;
}

// Helper to get the base URL from environment
export function getTestUrl(): string {
  const baseUrl = process.env.WEB_CLI_TEST_URL;
  if (!baseUrl) {
    throw new Error('WEB_CLI_TEST_URL not set. Is the global setup running?');
  }
  return baseUrl;
}

// Helper to build URL with query params
export function buildTestUrl(params?: Record<string, string>): string {
  const url = new URL(getTestUrl());
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  return url.toString();
}

// Quiet console log that only outputs in verbose mode
export function log(...args: any[]): void {
  if (process.env.VERBOSE_TESTS) {
    console.log(...args);
  }
}