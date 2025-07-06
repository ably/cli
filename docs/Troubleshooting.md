# Troubleshooting Guide

This document provides solutions for common issues encountered when developing or testing the Ably CLI.

---

## Common Build and Testing Errors

### `.js` vs `.ts` Extension Issues

**Problem**: Tests failing with errors about modules not being found or incorrect paths.

**Example Error**:
```
Error: Cannot find module '../commands/publish'
```

**Solution**:
- Check import statements and ensure they reference `.ts` files, not `.js` files.
- When running tests, remember that imports in test files should use the `.ts` extension.

```typescript
// ❌ INCORRECT
import MyCommand from '../../src/commands/my-command'

// ✅ CORRECT
import MyCommand from '../../src/commands/my-command.ts'
```

---

### Memory Leaks in Tests

**Problem**: Tests fail with memory errors or hang indefinitely.

**Example Error**:
```
FATAL ERROR: JavaScript heap out of memory
```

**Solution**:
- Ensure all resources are properly closed, especially Ably clients:

```typescript
// Always close Ably clients in tests
afterEach(async () => {
  await client.close()
})

// For multiple clients, ensure all are closed
afterEach(async () => {
  await Promise.all([
    client1.close(),
    client2.close(),
  ])
})
```

- Check for unclosed connections or long-running promises that never resolve
- Verify that `sinon.restore()` is called in `afterEach` blocks to clean up stubs/mocks

---

### WebSocket Mocking Challenges

**Problem**: Tests involving WebSocket connections fail or hang.

**Example Error**:
```
Timeout of 2000ms exceeded
```

**Solution**:
- For tests involving Realtime connections, be sure to mock the WebSocket properly:

```typescript
// Example of properly mocking a WebSocket connection
beforeEach(() => {
  // Create a fake WebSocket implementation
  const fakeWebSocketInstance = {
    addEventListener: sinon.stub(),
    removeEventListener: sinon.stub(),
    send: sinon.stub(),
    close: sinon.stub()
  }

  // Mock the WebSocket constructor
  global.WebSocket = sinon.stub().returns(fakeWebSocketInstance) as any
})

afterEach(() => {
  // Clean up
  delete (global as any).WebSocket
})
```

- Always trigger the appropriate events to simulate connection success/failure
- Don't forget to restore the original WebSocket constructor after tests

---

### HTTP Request Mocking Issues

**Problem**: Tests involving HTTP requests fail with network errors.

**Example Error**:
```
Error: connect ECONNREFUSED
```

**Solution**:
- Use `nock` or `sinon` to properly mock HTTP requests:

```typescript
// Using nock for HTTP mocking
import * as nock from 'nock'

beforeEach(() => {
  nock('https://control.ably.net')
    .get('/v1/apps')
    .reply(200, { apps: [] })
})

afterEach(() => {
  nock.cleanAll()
})
```

- Ensure all expected HTTP requests are mocked
- For control API requests, check the host being used matches the mocked domain

---

## Running the CLI Locally

### Command Not Found

**Problem**: Unable to run the CLI locally with the `ably` command.

**Solution**:
- Link the CLI locally:
  ```bash
  pnpm link --global
  ```
- Make sure the CLI is built before linking:
  ```bash
  pnpm prepare && pnpm link --global
  ```

### Environment Variables

**Problem**: CLI not using the expected configuration.

**Solution**:
- Check your local configuration with:
  ```bash
  ably config
  ```
- Use environment variables to override config for testing:
  ```bash
  ABLY_API_KEY=your_key ably channels:list
  ```

---

## Linting and Formatting Issues

### ESLint Errors

**Problem**: ESLint reporting errors that don't make sense.

**Solution**:
- Clear ESLint cache and try again:
  ```bash
  pnpm exec eslint --cache --cache-location .eslintcache .
  ```
- For specific files:
  ```bash
  pnpm exec eslint -- path/to/file.ts
  ```

### TypeScript Type Errors

**Problem**: TypeScript compilation errors.

**Example Error**:
```
Property 'x' does not exist on type 'Y'
```

**Solution**:
- Check that type definitions are up to date:
  ```bash
  pnpm install @types/node@latest @types/mocha@latest
  ```
- Use proper type assertions when necessary:
  ```typescript
  const result = (response as any).items as Item[]
  ```
- Add missing type definitions:
  ```typescript
  interface MyConfig {
    apiKey?: string
    controlHost?: string
  }
  ```

---

## Interactive Mode Issues

### Process Exits Unexpectedly

**Problem**: The interactive mode exits with unexpected error codes.

**Solution**:
- Check the exit code to understand what happened (see [Exit Codes documentation](Exit-Codes.md))
- Common exit codes:
  - Exit code 0: Normal exit (usually from 'exit' command)
  - Exit code 42: User typed 'exit' (special code for wrapper)
  - Exit code 130: SIGINT/Ctrl+C (double Ctrl+C or force quit)
  - Exit code 143: SIGTERM received

### Ctrl+C Not Working as Expected

**Problem**: Ctrl+C doesn't interrupt commands or behaves unexpectedly.

**Solution**:
- Use the wrapper script `ably-interactive` for better Ctrl+C handling
- Single Ctrl+C should interrupt running command and return to prompt
- Double Ctrl+C (within 500ms) force quits with exit code 130
- If running without wrapper, Ctrl+C may exit the entire shell

### Command History Not Persisting

**Problem**: Command history is lost between sessions.

**Solution**:
- Check that `~/.ably/history` file exists and is writable
- Verify the `ABLY_HISTORY_FILE` environment variable if using custom location
- Ensure the history file isn't exceeding size limits (default: 1000 commands)

---

## Documentation Issues

If you find errors in documentation or rules, please update them using the proper workflow and submit a pull request.

See documentation in `.cursor/rules/Workflow.mdc` for more details on the development workflow.
