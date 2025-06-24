/**
 * Test rate limiter to ensure we don't exceed server rate limits
 * The server allows 10 connections per minute per IP
 * Uses file-based state to persist across test processes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, '.rate-limiter-state.json');

interface RateLimiterState {
  connectionCount: number;
  lastResetTime: number;
  initialized: boolean;
}

// Configuration
const getConfig = () => {
  // Allow disabling rate limiting for local development or emergency CI runs
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    console.log(`[RateLimit Config] Rate limiting DISABLED`);
    return {
      connectionsPerBatch: 1000,  // Effectively no limit
      pauseDuration: 0,          // No pause
    };
  }
  
  // Emergency CI mode with minimal rate limiting (for when CI times out)
  if (process.env.RATE_LIMIT_CONFIG === 'CI_EMERGENCY') {
    console.log(`[RateLimit Config] Using CI_EMERGENCY configuration (minimal rate limiting)`);
    return {
      connectionsPerBatch: 39,   // All tests in one batch
      pauseDuration: 0,          // No pause (risky but for emergency use)
    };
  }
  
  // Default to CI configuration
  const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.TRAVIS || process.env.CIRCLECI);
  
  // Can be overridden by environment variable
  const configType = process.env.RATE_LIMIT_CONFIG || (isCI ? 'CI_FAST' : 'LOCAL');
  console.log(`[RateLimit Config] Using ${configType} configuration`);
  
  switch (configType) {
    case 'CI': {
      return {
        connectionsPerBatch: 8,    // More efficient for CI (10 per minute limit with 2 buffer)
        pauseDuration: 62000,      // 62 seconds to ensure rate limit window reset
      };
    }
    case 'CI_FAST': {
      return {
        connectionsPerBatch: 9,    // Aggressive for CI (10 per minute limit with 1 buffer)
        pauseDuration: 61000,      // 61 seconds to ensure rate limit window reset
      };
    }
    case 'CI_EMERGENCY': {
      return {
        connectionsPerBatch: 39,   // All tests in one batch (emergency use only)
        pauseDuration: 0,          // No pause (risky)
      };
    }
    case 'LOCAL': {
      return {
        connectionsPerBatch: 8,    // Closer to limit but still safe (10 - 2 buffer)
        pauseDuration: 62000,      // 62 seconds to ensure rate limit window reset
      };
    }
    case 'AGGRESSIVE': {
      return {
        connectionsPerBatch: 9,    // Max safe value (10 - buffer of 1)
        pauseDuration: 61000,      // Just over 1 minute
      };
    }
    default: {
      return {
        connectionsPerBatch: 8,
        pauseDuration: 61000,
      };
    }
  }
};

const config = getConfig();

function readState(): RateLimiterState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('[TestRateLimiter] Failed to read state file:', error);
  }
  
  // Default state
  return {
    connectionCount: 0,
    lastResetTime: Date.now(),
    initialized: false
  };
}

function writeState(state: RateLimiterState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[TestRateLimiter] Failed to write state file:', error);
  }
}

// Initialize on first load
const initialState = readState();
if (!initialState.initialized) {
  console.log(`[TestRateLimiter] Initialized at ${new Date().toISOString()}`);
  console.log(`[TestRateLimiter] Will pause after every ${config.connectionsPerBatch} connections to respect server rate limits`);
  console.log(`[TestRateLimiter] Each pause will be ${Math.round(config.pauseDuration/1000)} seconds to ensure rate limit window reset`);
  
  // Estimate total time for typical test suite (39 tests)
  const estimatedBatches = Math.ceil(39 / config.connectionsPerBatch);
  const estimatedPauses = Math.max(0, estimatedBatches - 1);
  const estimatedWaitTime = estimatedPauses * config.pauseDuration / 1000;
  console.log(`[TestRateLimiter] Estimated wait time for 39 tests: ${Math.round(estimatedWaitTime)}s (${estimatedPauses} pauses)`);
  
  writeState({ ...initialState, initialized: true });
}

export function incrementConnectionCount(): void {
  const state = readState();
  state.connectionCount++;
  console.log(`[TestRateLimiter] Connection count: ${state.connectionCount}`);
  writeState(state);
}

export function shouldDelayForRateLimit(): boolean {
  const state = readState();
  // After every N connections, we should wait to ensure rate limit window resets
  return state.connectionCount > 0 && state.connectionCount % config.connectionsPerBatch === 0;
}

export function getRateLimitDelay(): number {
  return config.pauseDuration;
}

export function resetRateLimitWindow(): void {
  const state = readState();
  state.lastResetTime = Date.now();
  console.log(`[TestRateLimiter] Rate limit window reset at ${new Date(state.lastResetTime).toISOString()}`);
  writeState(state);
}

export async function waitForRateLimitIfNeeded(): Promise<void> {
  if (shouldDelayForRateLimit()) {
    const state = readState();
    const delay = getRateLimitDelay();
    console.log(`[TestRateLimiter] === RATE LIMIT PAUSE ===`);
    console.log(`[TestRateLimiter] Completed ${state.connectionCount} connections`);
    console.log(`[TestRateLimiter] Waiting ${delay}ms (${Math.round(delay/1000)}s) to reset rate limit window...`);
    console.log(`[TestRateLimiter] This ensures we stay under 10 connections/minute`);
    console.log(`[TestRateLimiter] Pause started at ${new Date().toISOString()}`);
    
    try {
      await new Promise(resolve => setTimeout(resolve, delay));
      resetRateLimitWindow();
      console.log(`[TestRateLimiter] Pause ended at ${new Date().toISOString()}`);
      console.log(`[TestRateLimiter] === RESUMING TESTS ===`);
    } catch (error) {
      console.error(`[TestRateLimiter] Error during rate limit pause:`, error);
      throw error;
    }
  }
}

export function getRateLimiterState(): RateLimiterState {
  return readState();
}

export function resetConnectionCount(): void {
  const state = readState();
  state.connectionCount = 0;
  state.lastResetTime = Date.now();
  console.log(`[TestRateLimiter] Connection count reset`);
  writeState(state);
}

// Legacy exports for backward compatibility
export const incrementTestCount = incrementConnectionCount;
export const resetTestCount = resetConnectionCount;