# CI Rate Limiting Configuration Guide

## Available Configurations

### `CI_FAST` (Default for CI)
- **Connections per batch**: 9
- **Pause duration**: 61 seconds  
- **Estimated wait time for 39 tests**: ~244s (4 pauses)
- **Total estimated CI time**: ~8-10 minutes
- **Risk**: Low (stays well under rate limits)

### `CI` (Conservative)
- **Connections per batch**: 8
- **Pause duration**: 62 seconds
- **Estimated wait time for 39 tests**: ~248s (4 pauses)  
- **Total estimated CI time**: ~8-10 minutes
- **Risk**: Very Low

### `CI_EMERGENCY` (Emergency Use Only)
- **Connections per batch**: 39 (all tests)
- **Pause duration**: 0 seconds
- **Estimated wait time**: 0s (no pauses)
- **Total estimated CI time**: ~3-4 minutes
- **Risk**: HIGH - May hit rate limits causing test failures

### `DISABLE_RATE_LIMIT=true` (Emergency Use Only)
- **No rate limiting**: Complete bypass
- **Risk**: VERY HIGH - Will definitely hit rate limits

## Usage in CI

Add environment variable to your CI workflow:

```yaml
# Normal CI runs (recommended)
env:
  RATE_LIMIT_CONFIG: CI_FAST

# Emergency runs when CI times out
env:
  RATE_LIMIT_CONFIG: CI_EMERGENCY

# Complete bypass (use only as last resort)
env:
  DISABLE_RATE_LIMIT: true
```

## Troubleshooting

If CI tests timeout:
1. First try `RATE_LIMIT_CONFIG: CI_FAST` (default)
2. If still timing out, try `RATE_LIMIT_CONFIG: CI_EMERGENCY` 
3. Only use `DISABLE_RATE_LIMIT: true` as absolute last resort

Note: Emergency configurations may cause test failures due to rate limiting by the server.