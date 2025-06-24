# Rate Limit Trigger Test (z-rate-limit-trigger.test.ts)

## Purpose

This test runs **LAST** in the Web CLI E2E test suite (hence the "Z-" prefix) to verify how the application handles various server disconnection scenarios that commonly occur after making many connections.

## What It Tests

1. **Code 4000 Errors**: Server-initiated disconnections
2. **Rate Limiting**: HTTP 429 responses when connection limits are exceeded  
3. **Normal Reconnection**: Standard reconnection behavior verification
4. **UI State Management**: Proper status displays for each scenario

## Why It Runs Last

- After 36+ test connections, the server often starts rate limiting
- This creates a realistic test environment for disconnection handling
- Tests the application's behavior under actual rate limit conditions

## Expected Behaviors in CI

### Scenario 1: Rate Limiting (Most Common in CI)
```
✓ Rate limiting expected due to high connection count or CI environment
✓ CI rate limiting scenario - reconnection attempts in progress
✓ Rate limit scenario handled
```

### Scenario 2: Server Code 4000
```
✓ Server returned code 4000 (user-exit) - verifying proper handling
✓ Code 4000 error handled correctly
```

### Scenario 3: Normal Connection
```
✓ Connected successfully
✓ Reconnection configuration verified (max attempts: 5)
```

## Troubleshooting CI Failures

### Timeout Issues
- **Cause**: Waiting too long for rate limited connections
- **Fix**: Test now uses shorter timeouts in CI (15s vs 30s)

### Test Skipping
The test will skip automatically when:
- `DISABLE_RATE_LIMIT=true`
- `RATE_LIMIT_CONFIG=CI_EMERGENCY`

### Common CI Logs
```bash
[TestRateLimiter] Connection count: 36
Rate limiting expected due to high connection count or CI environment
Using 15000ms timeout for rate limit scenario (CI: true)
✓ CI rate limiting scenario - reconnection attempts in progress
```

## Configuration

- **Timeout**: 2 minutes (120s) to handle rate limit scenarios
- **CI Detection**: Automatically detects GitHub Actions/CI environment
- **Rate Limit Threshold**: Expects rate limiting after 30+ connections

This test validates that the Web CLI gracefully handles real-world server conditions rather than just perfect connection scenarios.