# Environment-Dependent Skip Fixes Summary

## Changes Made

### 1. Fixed Wrong Environment Variable Checks
- **test/e2e/connections/connections.test.ts**: Was checking `ABLY_API_KEY` instead of `E2E_ABLY_API_KEY`
  - **Fix**: Removed the skip entirely as E2E tests should always have environment variables in CI
  
- **test/integration/control-api.test.ts**: Was checking `ABLY_ACCESS_TOKEN` instead of `E2E_ABLY_ACCESS_TOKEN`
  - **Fix**: Updated to check for `E2E_ABLY_ACCESS_TOKEN` (kept the skip as this is a legitimate integration test)

### 2. Removed Unnecessary Skips for Tests That Don't Need Real Keys
- **test/e2e/auth/basic-auth.test.ts** - "should persist config in real file system"
  - **Fix**: Removed skip - this test only tests file operations, doesn't need API keys
  
- **test/e2e/auth/basic-auth.test.ts** - "should handle invalid credentials gracefully"
  - **Fix**: Removed skip - this test sets its own invalid API key for testing

### 3. Removed SKIP_E2E_TESTS Environment Variable Logic
- **test/e2e/core/basic-cli.test.ts**: Had conditional wrapper based on `SKIP_E2E_TESTS`
  - **Fix**: Removed the conditional wrapper - tests should always run in CI
  
- **test/e2e/core/basic-cli-minimal.test.ts**: Had skip logic based on `SKIP_E2E_TESTS`
  - **Fix**: Removed the skip logic
  
- **test/unit/services/control-api.test.ts**: Had conditional wrapper based on `SKIP_E2E_TESTS`
  - **Fix**: Removed the conditional wrapper - unit tests with mocked HTTP don't need API keys

### 4. Updated .env.example
- Removed unnecessary `ABLY_API_KEY` and `ABLY_ACCESS_TOKEN` variables
- These were for a `dev:container` command that no longer exists
- Only E2E-specific environment variables remain

## Results
- All tests now pass successfully ✅
- No more environment-dependent skips except for legitimate integration tests
- CI will always run all tests (as it should)
- Tests that don't need real API keys always run

## Remaining Skipped Tests
Only tests that are intentionally skipped for valid technical reasons:
1. Complex multi-process E2E tests (bench, connection monitoring)
2. Interactive stdin tests that timeout in CI
3. Unit tests requiring complex mocking
4. One test for unsupported functionality (rewind parameter)