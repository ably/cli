/**
 * Quick script to verify rate limiter configuration
 */
import { getRateLimiterState, getRateLimitDelay } from './test-rate-limiter.js';

console.log('Rate Limiter Configuration Check');
console.log('================================');

const state = getRateLimiterState();
console.log('Current state:', state);

console.log('\nConfiguration:');
console.log('- Pause after every 4 tests');
console.log('- Pause duration: 65 seconds');
console.log('- Server limit: 10 connections/minute');

console.log('\nTest scenarios:');
for (let i = 1; i <= 8; i++) {
  const shouldDelay = i > 0 && i % 4 === 0;
  console.log(`After test ${i}: ${shouldDelay ? 'PAUSE for 65s' : 'Continue'}`);
}

const delay = getRateLimitDelay();
console.log(`\nRate limit delay: ${delay}ms (${Math.round(delay/1000)}s)`);