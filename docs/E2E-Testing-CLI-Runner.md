# E2E Testing CLI Runner System

## Overview

The CLI runner system provides a robust, unified way to execute CLI commands in E2E tests with comprehensive output capture and automatic debugging on failures.

## Key Features

- **Automatic output capture**: All stdout and stderr are captured in real-time
- **Failure debugging**: On test failure, all CLI command output is automatically displayed
- **Ready signal detection**: Wait for specific patterns or JSON before proceeding  
- **Process lifecycle management**: Automatic cleanup of child processes
- **Event-based architecture**: Monitor output and process events in real-time
- **CI-friendly**: Enhanced reliability in CI environments with file syncing
- **Integrated debugging**: Built-in debugging support via flags and environment variables

## Debugging E2E Tests

The test runner includes standardized debugging support to help diagnose test failures.

### Quick Debug Commands

```bash
# Debug failing E2E tests with full verbosity
pnpm test:e2e --verbose

# Debug specific test files
pnpm test:e2e test/e2e/commands/rooms-e2e.test.ts --debug

# Debug with environment variables
E2E_DEBUG=true ABLY_CLI_TEST_SHOW_OUTPUT=true pnpm test:e2e
```

### Debug Flags & Environment Variables

| Method | Usage | Description |
|--------|-------|-------------|
| `--debug` | `pnpm test:e2e --debug` | Enable detailed debugging output |
| `--show-output` | `pnpm test:e2e --show-output` | Show CLI command output during tests |
| `--verbose` | `pnpm test:e2e --verbose` | Enable both debug and show-output |
| `E2E_DEBUG=true` | Environment variable | Enable detailed debugging output |
| `ABLY_CLI_TEST_SHOW_OUTPUT=true` | Environment variable | Show CLI command output during tests |

### Debug Output Example

When debugging is enabled, you'll see comprehensive information:

```bash
=== TEST DEBUG MODE ENABLED ===
Starting debug run at Wed Dec 18 10:30:45 PST 2024
Environment variables:
  E2E_DEBUG=true
  ABLY_CLI_TEST_SHOW_OUTPUT=true
  E2E_ABLY_API_KEY is configured
=================================

=== Test Execution Details ===
Test pattern: test/e2e/commands/rooms-e2e.test.ts
Using Playwright: false
Starting test execution at: Wed Dec 18 10:30:46 PST 2024
==============================

Cleaning up any existing processes...
Process cleanup complete.
```

## Basic Usage

### Running Simple Commands

```typescript
import { runCommand } from '../../helpers/command-helpers.js';

// Run a one-shot command
const result = await runCommand(['--version']);
expect(result.exitCode).to.equal(0);
expect(result.stdout).to.contain('@ably/cli');
```

### Starting Long-Running Processes

```typescript
import { startSubscribeCommand, waitForOutput } from '../../helpers/command-helpers.js';

// Start a subscriber and wait for ready signal
const subscriber = await startSubscribeCommand(
  ['channels', 'subscribe', 'my-channel', '--client-id', 'test-client'],
  /Connected to Ably and subscribed/, // Ready pattern
  { timeoutMs: 30000 }
);

// Wait for specific output
await waitForOutput(subscriber, 'Message received', 10000);

// Cleanup
await subscriber.kill();
```

### Presence Commands

```typescript
import { startPresenceCommand } from '../../helpers/command-helpers.js';

const presenceRunner = await startPresenceCommand(
  ['rooms', 'presence', 'enter', 'my-room', '--client-id', 'user1'],
  /Entered room/,
  { timeoutMs: 20000 }
);

// Process is ready when the promise resolves
// Cleanup when done
await presenceRunner.kill();
```

## Advanced Features

### Custom Ready Signals

```typescript
// RegEx patterns
const runner = await startCli(argv, outfile, {
  ready: { matcher: /Server started on port \d+/ }
});

// JSON path detection
const runner = await startCli(argv, outfile, {
  ready: { 
    matcher: '{"status":"ready"}',
    jsonPath: 'status' 
  }
});
```

### Multiple Runners in One Test

```typescript
import { cleanupRunners } from '../../helpers/command-helpers.js';

const subscriber = await startSubscribeCommand([...]);
const publisher = await startCli([...]);

try {
  // Test logic here
} finally {
  await cleanupRunners([subscriber, publisher]);
}
```

### Waiting for JSON Events

```typescript
import { waitForJsonEvents } from '../../helpers/command-helpers.js';

// Wait for 3 JSON events that match a filter
const events = await waitForJsonEvents(
  runner,
  3,
  (json) => json.type === 'message',
  15000 // timeout
);
```

## Automatic Failure Debugging

When tests fail, the system automatically outputs:

```
=== E2E TEST FAILURE DEBUG ===
Test: should handle presence events
Error: Timeout waiting for pattern "Action: enter"

--- CLI Command: ably rooms presence subscribe my-room --client-id client1 ---
STDOUT:
Connecting to Ably...
Connected to Ably
Subscribing to presence events...

STDERR:
Warning: Connection took longer than expected

Exit Code: null
=== END E2E TEST FAILURE DEBUG ===
```

## Migration from Legacy Helper

### Before (legacy)
```typescript
const outputPath = await createTempOutputFile();
const processInfo = await runLongRunningBackgroundProcess(
  `bin/run.js channels subscribe ${channelName}`,
  outputPath,
  { readySignal: "Connected to Ably", timeoutMs: 15000 }
);

// Manual polling for output
for (let i = 0; i < 50; i++) {
  const output = await readProcessOutput(outputPath);
  if (output.includes('target event')) break;
  await new Promise(resolve => setTimeout(resolve, 200));
}
```

### After (new system)
```typescript
const subscriber = await startSubscribeCommand(
  ['channels', 'subscribe', channelName],
  /Connected to Ably/,
  { timeoutMs: 15000 }
);

// Clean, promise-based waiting
await waitForOutput(subscriber, 'target event');
```

## Best Practices

1. **Always use cleanup**: Ensure processes are killed in `finally` blocks
2. **Use specific ready signals**: Don't rely on generic timeouts
3. **Set appropriate timeouts**: CI environments need longer timeouts
4. **Use helper functions**: Prefer `startSubscribeCommand` over raw `CliRunner`
5. **Test output incrementally**: Wait for expected patterns step-by-step

## File Organization

- `test/helpers/cli-runner.ts` - Core CliRunner class
- `test/helpers/cli-runner-store.ts` - Test tracking system  
- `test/helpers/command-helpers.ts` - High-level helper functions
- `test/root-hooks.ts` - Automatic failure debugging setup

## Benefits Over Legacy System

- **Elimination of "Failed to read process output file" errors**
- **Real-time output capture without file I/O race conditions**  
- **Automatic test failure debugging without manual setup**
- **Consistent patterns across all E2E tests**
- **Better CI reliability with proper process management**
- **Clear separation of concerns with helper functions**

The system automatically tracks CLI runners per test and provides comprehensive debugging output when tests fail, making it much easier to diagnose issues in CI environments. 