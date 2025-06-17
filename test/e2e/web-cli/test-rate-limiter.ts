/**
 * Test rate limiter to ensure we don't exceed server rate limits
 * The server allows 10 connections per minute per IP
 */

let testCount = 0;
let lastResetTime = Date.now();

// Initialize on module load
console.log(`[TestRateLimiter] Initialized at ${new Date().toISOString()}`);
console.log(`[TestRateLimiter] Will pause after every 6 tests to respect server rate limits`);

export function incrementTestCount(): void {
  testCount++;
  console.log(`[TestRateLimiter] Test count: ${testCount}`);
}

export function shouldDelayForRateLimit(): boolean {
  // After every 6 tests, we should wait to ensure rate limit window resets
  // This is conservative - allows for tests that might make 1-2 connections each
  return testCount > 0 && testCount % 6 === 0;
}

export function getRateLimitDelay(): number {
  // Calculate how long we need to wait for the rate limit window to reset
  const timeSinceReset = Date.now() - lastResetTime;
  const windowDuration = 60000; // 60 seconds
  
  if (timeSinceReset < windowDuration) {
    // Wait for the remainder of the window plus a buffer
    return windowDuration - timeSinceReset + 5000; // 5 second buffer
  }
  
  return 5000; // Minimum 5 second delay
}

export function resetRateLimitWindow(): void {
  lastResetTime = Date.now();
  console.log(`[TestRateLimiter] Rate limit window reset at ${new Date(lastResetTime).toISOString()}`);
}

export async function waitForRateLimitIfNeeded(): Promise<void> {
  if (shouldDelayForRateLimit()) {
    const delay = getRateLimitDelay();
    console.log(`[TestRateLimiter] === RATE LIMIT PAUSE ===`);
    console.log(`[TestRateLimiter] Completed ${testCount} tests`);
    console.log(`[TestRateLimiter] Waiting ${delay}ms to reset rate limit window...`);
    console.log(`[TestRateLimiter] This ensures we stay under 10 connections/minute`);
    await new Promise(resolve => setTimeout(resolve, delay));
    resetRateLimitWindow();
    console.log(`[TestRateLimiter] === RESUMING TESTS ===`);
  }
}