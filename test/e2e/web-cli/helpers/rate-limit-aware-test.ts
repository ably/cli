/**
 * Test wrapper that ensures rate limit synchronization
 */
import { Page } from 'playwright/test';
import { waitForRateLimitLock } from '../rate-limit-lock';
import { waitForRateLimitIfNeeded, incrementConnectionCount } from '../test-rate-limiter';

export async function beforeTestWithRateLimit(): Promise<void> {
  // Wait for any ongoing rate limit pause to complete
  await waitForRateLimitLock();
  
  // Check if we need to pause for rate limiting
  await waitForRateLimitIfNeeded();
}

export async function authenticateWithRateLimit(
  page: Page, 
  authenticateFn: (page: Page, apiKey: string) => Promise<void>,
  apiKey: string
): Promise<void> {
  // Ensure no rate limit pause is in progress
  await waitForRateLimitLock();
  
  // Check if we need to pause before making connection
  await waitForRateLimitIfNeeded();
  
  // Increment counter and authenticate
  incrementConnectionCount();
  await authenticateFn(page, apiKey);
}

export async function navigateWithRateLimit(page: Page, url: string): Promise<void> {
  // Ensure no rate limit pause is in progress
  await waitForRateLimitLock();
  
  // Check if we need to pause before navigation
  await waitForRateLimitIfNeeded();
  
  // If URL contains apiKey, it will auto-connect
  if (url.includes('apiKey=')) {
    incrementConnectionCount();
  }
  
  await page.goto(url);
}