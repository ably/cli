/**
 * Rate limit hooks to ensure tests wait for rate limit pauses
 */
import { test } from './base-test';
import { waitForRateLimitLock } from '../rate-limit-lock';

/**
 * Setup rate limit checking before each test
 * This should be called in every test file's describe block
 */
export function useRateLimitChecking() {
  test.beforeEach(async () => {
    // Wait for any ongoing rate limit pause before starting the test
    await waitForRateLimitLock();
  });
}