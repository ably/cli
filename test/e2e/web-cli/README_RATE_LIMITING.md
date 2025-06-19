# Rate Limiting for Playwright E2E Tests

## Overview

This directory contains a centralized rate limiting solution for Playwright tests to prevent hitting the server's 10 connections per minute limit. The solution ensures tests run reliably without overwhelming the WebSocket server.

## Problem

The Web CLI terminal server enforces a rate limit of 10 WebSocket connections per minute per IP address. When running multiple E2E tests, especially in CI environments, tests can fail with connection errors when this limit is exceeded.

## Solution Architecture

### Components

1. **Rate Limiter (`helpers/rate-limiter.ts`)**
   - Global singleton that tracks all connection attempts
   - Uses sliding window algorithm to enforce rate limits
   - Provides queueing mechanism for tests waiting to connect
   - Supports configurable limits and retry logic

2. **Connection Manager (`helpers/connection-manager.ts`)**
   - High-level API for managing WebSocket connections
   - Handles authentication, connection establishment, and cleanup
   - Provides retry logic for command execution
   - Monitors connection health

3. **Rate-Limited Test Helper (`helpers/rate-limited-test.ts`)**
   - Extended Playwright test fixture with rate limiting built-in
   - Drop-in replacement for standard test import
   - Automatically manages rate limiting for page navigation

4. **Configuration (`rate-limit-config.ts`)**
   - Environment-specific configurations (CI, local, stress test)
   - Easy enable/disable via environment variables
   - Debug logging support

## Usage

### Basic Usage

```typescript
// Import rate-limited test instead of standard test
import { test, expect } from './helpers/rate-limited-test';
import { establishConnection, executeCommandWithRetry } from './helpers/connection-manager';

test('my test', async ({ page }, testInfo) => {
  // Establish connection with rate limiting
  await establishConnection(page, {
    testName: testInfo.title,
    serverUrl: getTestUrl()
  });
  
  // Execute commands with retry logic
  await executeCommandWithRetry(page, 'ably --help', 'COMMANDS');
});
```

### Environment Variables

- `DISABLE_RATE_LIMIT=true` - Disable rate limiting entirely
- `DEBUG_RATE_LIMITER=true` - Enable debug logging
- `STRESS_TEST=true` - Use aggressive rate limit configuration
- `CI=true` - Automatically detected, uses conservative settings

### Running Tests

```bash
# Run with default rate limiting
npm run test:e2e:web

# Run with debug logging
DEBUG_RATE_LIMITER=true npm run test:e2e:web

# Run without rate limiting (not recommended)
DISABLE_RATE_LIMIT=true npm run test:e2e:web

# Run stress test
STRESS_TEST=true npm run test:e2e:web
```

## Configuration

The rate limiter uses different configurations based on environment:

| Environment | Max Connections/Min | Retry Delay | Max Retries |
|-------------|-------------------|-------------|-------------|
| Local       | 9                 | 10s         | 3           |
| CI          | 8                 | 15s         | 5           |
| Stress Test | 10                | 6s          | 2           |
| Disabled    | 1000              | 0s          | 1           |

## How It Works

1. **Connection Tracking**: Every WebSocket connection attempt is tracked globally
2. **Sliding Window**: Uses a 60-second sliding window to count connections
3. **Queueing**: When limit is reached, tests queue and wait for capacity
4. **Automatic Retry**: Failed connections are retried with exponential backoff
5. **Cleanup**: Proper cleanup ensures connections are closed between tests

## Migration Guide

See [RATE_LIMITING_MIGRATION.md](./RATE_LIMITING_MIGRATION.md) for detailed instructions on migrating existing tests.

## Monitoring

The rate limiter provides real-time status:

```typescript
import { getRateLimiterStatus } from './helpers/rate-limiter';

const status = getRateLimiterStatus();
console.log(status);
// {
//   recentAttempts: 8,
//   maxAllowed: 10,
//   queueLength: 2,
//   canConnect: true
// }
```

## Best Practices

1. **Always use serial execution**: Tests must run one at a time
2. **Clean up connections**: Always disconnect in afterEach hooks
3. **Use retry logic**: Commands may fail due to transient issues
4. **Monitor in CI**: Check logs for rate limiting warnings
5. **Test locally first**: Verify rate limiting works before pushing

## Troubleshooting

### "Rate limit exceeded" errors
- Check recent connection count with `getRateLimiterStatus()`
- Ensure tests are running serially (`workers: 1`)
- Verify cleanup is happening between tests

### Tests timing out
- Rate limiter may be waiting for capacity
- Check logs for "[RateLimiter] waiting" messages
- Consider increasing test timeouts

### Flaky tests after migration
- Use `waitForConnectionStable()` before commands
- Increase retry attempts in configuration
- Add more robust wait conditions

## Architecture Decisions

1. **Global Singleton**: Ensures rate limiting works across all test contexts
2. **Sliding Window**: More accurate than fixed time windows
3. **Queue System**: Fair ordering for waiting tests
4. **Configurable**: Different limits for different environments
5. **Transparent**: Minimal changes to existing tests

## Future Improvements

1. **Distributed Rate Limiting**: Support for multiple test runners
2. **Adaptive Limits**: Automatically adjust based on server response
3. **Metrics Collection**: Track rate limit performance over time
4. **Connection Pooling**: Reuse connections where possible