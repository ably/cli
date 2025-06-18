# Web CLI E2E Test Rate Limit Optimizations

## Overview

This document describes the optimizations made to improve the execution time of Web CLI E2E tests while respecting the server's rate limit of 10 connections per minute.

## Key Findings

1. **Multiple Connections per Test**: Several tests make 2-3 WebSocket connections:
   - `session-resume.test.ts`: 2 connections (initial + reload)
   - `prompt-integrity.test.ts`: 3 connections (initial + 2 reloads)
   - `reconnection.test.ts`: 2 connections (initial + reconnection)
   - `web-cli.test.ts`: Multiple for drawer state tests

2. **Conservative Rate Limits**: The original configuration was very conservative:
   - CI: 5 connections/minute (50% of limit)
   - Local: 6 connections/minute (60% of limit)

## Optimizations Applied

### 1. Increased Connection Limits

Updated `rate-limit-config.ts` to use more of the available rate limit:

```typescript
// CI environment
maxConnectionsPerMinute: 8  // Increased from 5
retryDelayMs: 10000        // Reduced from 20000ms

// Local environment  
maxConnectionsPerMinute: 9  // Increased from 6
retryDelayMs: 8000         // Reduced from 15000ms
```

This provides a safety margin while significantly improving throughput.

### 2. Test Execution Optimizer

Created `helpers/test-optimizer.ts` that:
- Profiles each test's connection requirements
- Calculates optimal test execution order
- Groups tests into batches that maximize connection usage
- Estimates total execution time

### 3. Optimized Test Runner

Created `run-optimized-tests.ts` that:
- Runs tests in optimized batches
- Provides detailed progress reporting
- Manages rate limit windows intelligently
- Only waits between batches when necessary

## Expected Improvements

### Before Optimizations
- CI: ~12-15 minutes (with 5 connections/min and 20s delays)
- Local: ~10-12 minutes (with 6 connections/min and 15s delays)

### After Optimizations
- CI: ~6-8 minutes (with 8 connections/min and 10s delays)
- Local: ~5-6 minutes (with 9 connections/min and 8s delays)

**Expected improvement: 40-50% reduction in test execution time**

## Usage

### Standard Test Execution
```bash
# Run all tests with default Playwright
npm run test:e2e:web-cli

# Run with optimized runner
npx tsx test/e2e/web-cli/run-optimized-tests.ts
```

### Environment Variables
```bash
# Run in stress test mode (use full 10/min limit)
STRESS_TEST=true npm run test:e2e:web-cli

# Disable rate limiting (for debugging single tests)
DISABLE_RATE_LIMIT=true npx playwright test specific.test.ts

# Enable debug logging
DEBUG_RATE_LIMITER=true npm run test:e2e:web-cli
```

## Additional Recommendations

1. **Test Refactoring**: Consider refactoring tests that make multiple connections:
   - Combine related test cases to reuse connections
   - Use test fixtures to share authenticated sessions
   - Avoid unnecessary reloads where possible

2. **Parallel Execution**: Once connection usage is optimized per test:
   - Consider running non-overlapping test batches in parallel workers
   - Use the test optimizer to identify safe parallel groups

3. **Monitoring**: 
   - Add metrics collection for actual connection usage
   - Track rate limit hits and delays
   - Identify tests that could be further optimized

4. **Server-Side Improvements**: Consider requesting:
   - Higher rate limits for CI/test environments
   - Connection pooling or session reuse capabilities
   - Separate rate limits for different types of operations

## Troubleshooting

If tests are still hitting rate limits:

1. Check the debug output:
   ```bash
   DEBUG_RATE_LIMITER=true npm run test:e2e:web-cli
   ```

2. Reduce connections per minute temporarily:
   ```bash
   # In rate-limit-config.ts, reduce the limits
   maxConnectionsPerMinute: 7  // Instead of 8 for CI
   ```

3. Identify problematic tests:
   - Look for tests making unexpected connections
   - Check for connection leaks or failed cleanup
   - Use the test profiler to update connection estimates

## Future Enhancements

1. **Dynamic Rate Adjustment**: Automatically adjust rate limits based on server responses
2. **Connection Pooling**: Implement connection reuse across compatible tests  
3. **Smart Batching**: Use machine learning to optimize batch composition
4. **Real-time Monitoring**: Dashboard showing connection usage and test progress