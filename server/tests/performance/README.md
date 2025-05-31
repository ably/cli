# Load Testing Suite for Ably CLI Terminal Server

This directory contains load testing scripts to verify that the security measures and resource limits work correctly under load.

## Overview

The load testing suite includes:

- **Connection Rate Limiting Tests**: Verify rate limiting works under concurrent connection load
- **Session Management Tests**: Test session creation and management under load
- **Container Resource Limit Tests**: Verify Docker container resource limits are enforced
- **Performance Benchmarks**: Measure baseline performance metrics

## Usage

These tests are designed to be **run one-off** and are **not part of the regular test suite** due to their resource-intensive nature and requirement for a running terminal server.

### Prerequisites

1. **Running Terminal Server**: Tests require a running terminal server instance
2. **Docker Access**: Container tests require Docker to be available
3. **WebSocket Support**: Tests use WebSocket connections

### Running Tests

#### Run All Load Tests
```bash
# Set the server URL (optional, defaults to ws://localhost:8080)
export TERMINAL_SERVER_URL="ws://localhost:8080"

# Run all load tests
cd server
npm test -- tests/performance/load-test.ts
```

#### Run Specific Test Categories
```bash
# Connection rate limiting tests only
npm test -- tests/performance/load-test.ts --grep "Connection Rate Limiting"

# Session management tests only
npm test -- tests/performance/load-test.ts --grep "Session Management"

# Container resource tests only
npm test -- tests/performance/load-test.ts --grep "Container Resource Limits"

# Performance benchmarks only
npm test -- tests/performance/load-test.ts --grep "Performance Benchmarks"
```

#### Run Individual Tests
```bash
# Specific test by name
npm test -- tests/performance/load-test.ts --grep "should handle rapid connection attempts"
```

### Environment Variables

- `TERMINAL_SERVER_URL`: WebSocket URL of the terminal server (default: `ws://localhost:8080`)
- `CI`: Set to skip tests in CI environments
- `GITHUB_ACTIONS`, `TRAVIS`, `CIRCLECI`: Auto-detected CI environments

### Test Categories

#### 1. Connection Rate Limiting Under Load
- Tests rapid concurrent connection attempts (20 connections)
- Verifies rate limiting activation under high load
- Tests recovery after rate limit cooldown period
- Expected behavior: Some connections succeed, rate limiting activates when limits exceeded

#### 2. Session Management Under Load
- Tests concurrent session creation attempts (10 sessions)
- Uses dummy credentials to test session handling
- Verifies server handles session requests gracefully
- Expected behavior: Sessions are handled (even if auth fails with dummy credentials)

#### 3. Container Resource Limits Under Load
- Tests concurrent Docker container creation (5 containers)
- Tests memory limit enforcement with memory-intensive tasks
- Verifies containers are killed when exceeding resource limits
- Expected behavior: Containers are created and resource limits are enforced

#### 4. Performance Benchmarks
- Measures connection establishment time
- Measures session creation overhead
- Provides timing statistics for performance analysis
- Expected behavior: Reasonable performance within defined thresholds

## Test Configuration

### Connection Limits
- **Concurrent Connections**: 20 (tests rate limiting activation)
- **Connection Timeout**: 10 seconds
- **Recovery Test Cooldown**: 30 seconds (shortened for testing)

### Session Limits
- **Concurrent Sessions**: 10
- **Session Creation Timeout**: 15 seconds
- **Uses dummy credentials**: Tests server behavior, not actual authentication

### Container Limits
- **Container Requests**: 5 concurrent
- **Memory Stress Test**: 3 containers with 64MB limit trying to allocate 80MB
- **Expected OOM Exit Codes**: 137 (SIGKILL) or 1 (general error)

### Performance Thresholds
- **Average Connection Time**: < 5 seconds
- **Max Connection Time**: < 10 seconds
- **Session Creation Time**: < 30 seconds

## Interpreting Results

### Connection Rate Limiting
```
Connection results: { successful: 5, rejected: 10, errors: 5 }
```
- `successful`: Connections that completed successfully
- `rejected`: Connections rejected due to rate limiting
- `errors`: Connections that failed for other reasons

### Session Management
```
Session creation results:
{ created: 2, auth_failed: 6, timeout: 2 }
```
- `created`: Sessions created successfully (rare with dummy credentials)
- `auth_failed`: Sessions handled but authentication failed (expected)
- `timeout`: Sessions that didn't respond in time

### Container Resource Limits
```
Container creation results: 5 successful, 0 failed
Memory stress test results: 3 containers, 2 killed by OOM
```
- Shows container creation success rate
- Shows how many containers were killed by Out-of-Memory limits

### Performance Benchmarks
```
Connection timing stats:
  Average: 1250.45ms
  Min: 980.12ms
  Max: 2100.89ms
```
- Provides baseline performance metrics
- All timings should be within reasonable thresholds

## Troubleshooting

### Common Issues

#### "Skipping load tests in CI environment"
- Tests automatically skip in CI environments
- Run manually in development environments

#### Connection Failures
```
Connection 0 failed: Error: connect ECONNREFUSED 127.0.0.1:8080
```
- Ensure terminal server is running on the specified URL
- Check firewall and network connectivity

#### Docker Errors
```
Container 0 failed: Cannot connect to the Docker daemon
```
- Ensure Docker is installed and running
- Check Docker permissions for the user running tests

#### Rate Limiting Not Triggered
```
Rate limiting not triggered - server may have high limits
```
- Server configuration may have higher limits than test expectations
- This is normal for development environments with relaxed limits

### Adjusting Test Parameters

To modify test behavior, edit the constants in `load-test.ts`:

```typescript
// Increase concurrent connections to trigger rate limiting sooner
const concurrentConnections = 50;

// Adjust session count for session management tests
const sessionCount = 20;

// Modify container resource limits
const memoryStressContainers = 5;
```

## CI/CD Integration

These tests are **intentionally excluded** from CI pipelines because:

1. **Resource Intensive**: Require significant CPU/memory/Docker resources
2. **External Dependencies**: Require running terminal server instance
3. **Variable Results**: Performance can vary significantly across environments
4. **Long Running**: Tests can take several minutes to complete

For CI integration, consider:
- Running on dedicated load testing infrastructure
- Using smaller test parameters
- Running as part of nightly/weekly builds rather than on every commit

## Security Considerations

- Tests use dummy credentials that will fail authentication
- Tests create temporary Docker containers that are cleaned up
- Rate limiting tests may temporarily block IP addresses
- Container tests may consume significant system resources

Always run load tests in isolated development environments, not production systems. 