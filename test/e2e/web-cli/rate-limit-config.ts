/**
 * Rate limiter configuration for Playwright tests
 * 
 * This file centralizes all rate limiting configuration and provides
 * environment-specific settings.
 */

import { configureRateLimiter } from './helpers/rate-limiter';

// Environment detection
const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.TRAVIS || process.env.CIRCLECI);
const isDebug = process.env.DEBUG_RATE_LIMITER === 'true';
const isStressTest = process.env.STRESS_TEST === 'true';

// Configuration profiles
const configs = {
  // Conservative configuration for CI environments
  ci: {
    maxConnectionsPerMinute: 5, // Very conservative for CI to avoid flakiness
    windowDurationMs: 60000,
    retryDelayMs: 20000, // 20 seconds between retries
    maxRetries: 3
  },
  
  // Standard configuration for local development
  local: {
    maxConnectionsPerMinute: 6, // Well below the 10/min limit to account for reconnections
    windowDurationMs: 60000,
    retryDelayMs: 15000, // 15 seconds between retries
    maxRetries: 2
  },
  
  // Aggressive configuration for stress testing
  stress: {
    maxConnectionsPerMinute: 10, // Use full limit
    windowDurationMs: 60000,
    retryDelayMs: 6000, // 6 seconds between retries
    maxRetries: 2
  },
  
  // Disabled configuration (for debugging individual tests)
  disabled: {
    maxConnectionsPerMinute: 1000, // Effectively no limit
    windowDurationMs: 1000, // Very short window
    retryDelayMs: 0,
    maxRetries: 1
  }
};

// Select configuration based on environment
export function setupRateLimiter() {
  let config;
  
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    console.log('[RateLimit Config] Rate limiting DISABLED');
    config = configs.disabled;
  } else if (isStressTest) {
    console.log('[RateLimit Config] Using STRESS configuration');
    config = configs.stress;
  } else if (isCI) {
    console.log('[RateLimit Config] Using CI configuration');
    config = configs.ci;
  } else {
    console.log('[RateLimit Config] Using LOCAL configuration');
    config = configs.local;
  }
  
  // Apply configuration
  configureRateLimiter(config);
  
  // Log configuration if debug is enabled
  if (isDebug) {
    console.log('[RateLimit Config] Configuration:', JSON.stringify(config, null, 2));
  }
  
  return config;
}

// Export individual configs for testing
export { configs };

// Auto-setup on import (can be disabled by setting MANUAL_RATE_LIMIT_SETUP=true)
if (process.env.MANUAL_RATE_LIMIT_SETUP !== 'true') {
  setupRateLimiter();
}