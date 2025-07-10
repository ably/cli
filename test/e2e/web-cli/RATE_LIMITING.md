# Web CLI E2E Test Rate Limiting

The web-cli terminal server has rate limits: **10 connections per minute per IP address**.

## Current Configuration

The test suite implements rate limiting to avoid hitting server limits:

- **LOCAL**: 5 connections per batch, 65s pause
- **CI**: 8 connections per batch, 65s pause  
- **AGGRESSIVE**: 9 connections per batch, 61s pause

## Running Tests

### Standard (with rate limiting)
```bash
pnpm test:e2e:web-cli
```

### Faster (aggressive rate limiting)
```bash
./test/e2e/web-cli/run-tests-fast.sh
# OR
RATE_LIMIT_CONFIG=AGGRESSIVE pnpm test:e2e:web-cli
```

### Fastest (no rate limiting - use with caution!)
```bash
DISABLE_RATE_LIMIT=true pnpm test:e2e:web-cli
```
⚠️ **Warning**: Disabling rate limiting may cause tests to fail with 429 errors!

## Test Execution Time

With 29 tests making ~31 connections:

- **Standard**: ~12-15 minutes (4 pauses × 62s = 4 min pauses)
- **Aggressive**: ~10-12 minutes (3 pauses × 61s = 3 min pauses)  
- **No limits**: ~5-7 minutes (no pauses, but may fail)

## Debugging

To see rate limiter state:
```bash
DEBUG_RATE_LIMITER=true pnpm test:e2e:web-cli
```

## Why Some Tests Make Multiple Connections

Some tests intentionally make multiple connections:
- Authentication tests: Test different auth methods
- Session resume tests: Test page reloads (2-3 connections)
- Reconnection tests: Test disconnection/reconnection scenarios

## Troubleshooting

If tests are timing out:
1. Check the global timeout in `playwright.config.ts` (currently 20 minutes)
2. Use `RATE_LIMIT_CONFIG=AGGRESSIVE` for faster execution
3. Run specific test files instead of the full suite
4. Check if the server rate limits have changed