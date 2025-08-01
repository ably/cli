# Testing Strategy & Policy

<div align="center">
<h3>📘 ESSENTIALS FIRST 📘</h3>
</div>

> **💡 QUICK START:** Run `pnpm test` for all tests or `pnpm test:unit` for faster unit tests.
> **📋 MANDATORY:** All code changes require related tests. See [Workflow.mdc](mdc:.cursor/rules/Workflow.mdc).
> **🐛 DEBUGGING:** See [Debugging Guide](mdc:docs/Debugging.md) for troubleshooting tips and the [Debug Test Execution](#-debug-test-execution) section below.
> **🔍 TROUBLESHOOTING:** See [Troubleshooting Guide](mdc:docs/Troubleshooting.md) for common errors.

---

## 🚀 Testing Goals & Guiding Principles

1.  **Confidence:** Ensure each command works as intended and avoid regressions.
2.  **Speed & Developer Experience:** Most tests should be quick to run, easy to debug, and not require a live environment.
3.  **Real Integration Coverage (where needed):** Some commands may need to be tested against real APIs (e.g., Ably's pub/sub product APIs and Control APIs) to verify end-to-end flows—especially for mission-critical commands.
4.  **Scalability:** The test setup should scale as commands grow in complexity.
5.  **Mandatory Coverage:** Adding or updating relevant tests is a **required** step for all feature additions or bug fixes.

---

## 🏃‍♂️ Running Tests

Refer to [.cursor/rules/Workflow.mdc](mdc:.cursor/rules/Workflow.mdc) for the mandatory requirement to run tests.

| Test Type | Command | Description |
|-----------|---------|-------------|
| **All Tests** | `pnpm test` | Run all test types except Playwright |
| **Unit Tests** | `pnpm test:unit` | Fast tests with mocked dependencies |
| **Integration Tests** | `pnpm test:integration` | Tests with mocked Ably services |
| **E2E Tests** | `pnpm test:e2e` | Tests against real Ably services |
| **Playwright Tests** | `pnpm test:playwright` | Web CLI browser tests |

**Run Specific Files:**
```bash
# CLI Tests - Run a specific test file
pnpm test test/unit/commands/bench/bench.test.ts

# CLI Tests - Run all tests in a directory
pnpm test test/unit/commands/auth/**/*.test.ts
```

---

## 🐛 Debug Test Execution

The test runner includes built-in debugging support to help diagnose test failures, especially for E2E tests that interact with real services.

### Debugging Flags

| Flag | Description |
|------|-------------|
| `--debug` | Enable detailed test debugging output |
| `--show-output` | Show CLI command output during tests |
| `--verbose` | Enable both debug and show-output (full verbosity) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `E2E_DEBUG=true` | Enable detailed test debugging output |
| `ABLY_CLI_TEST_SHOW_OUTPUT=true` | Show detailed CLI output during tests |
| `TEST_DEBUG=true` | Alias for E2E_DEBUG |

### Examples

```bash
# Debug E2E tests with verbose output
pnpm test:e2e --debug

# Debug specific failing tests with full verbosity
pnpm test:e2e test/e2e/commands/rooms* --verbose

# Debug using environment variables
E2E_DEBUG=true pnpm test:e2e

# Debug specific test file with output capture
pnpm test:e2e test/e2e/commands/spaces-e2e.test.ts --show-output

# Debug all E2E command tests with full verbosity
pnpm test:e2e:commands --verbose
```

### Debug Output Features

When debugging is enabled, you'll see:
- ✅ **Detailed timing information** for test execution phases
- ✅ **Environment variable status** (API keys, debug flags)
- ✅ **Command execution details** (patterns, arguments, runner type)
- ✅ **Process cleanup information** (hanging processes detection)
- ✅ **Enhanced error reporting** with exit codes and timing
- ✅ **Pre/post test cleanup** to avoid process conflicts

**Example debug output:**
```bash
=== TEST DEBUG MODE ENABLED ===
Starting debug run at Wed Dec 18 10:30:45 PST 2024
Environment variables:
  E2E_DEBUG=true
  TEST_DEBUG=true
  NODE_OPTIONS=--trace-warnings --trace-deprecation
  ABLY_CLI_TEST_SHOW_OUTPUT=true
  E2E_ABLY_API_KEY is configured
=================================

=== Test Execution Details ===
Test pattern: test/e2e/commands/rooms*
Additional args: --timeout 30000
Using Playwright: false
Starting test execution at: Wed Dec 18 10:30:46 PST 2024
==============================

=== Running Mocha Tests ===
Executing command: CURSOR_DISABLE_DEBUGGER=true NODE_OPTIONS="..." node --import '...' ./node_modules/mocha/bin/mocha --require ./test/setup.ts --forbid-only --allow-uncaught --exit --reporter spec 'test/e2e/commands/rooms*' --timeout 30000 --exclude 'test/e2e/web-cli/**/*.test.ts'
```

---

### 🔧 Pre-Push Validation

The `scripts/pre-push-validation.sh` script runs a comprehensive test suite:

```bash
# Run the full pre-push validation
./scripts/pre-push-validation.sh
```

The script will:
- Build and prepare the project
- Run linter checks
- Run all unit, integration, and E2E tests
- Clean up automatically after completion

---

<details>
<summary><h2>📊 Testing Approach - Expand for Details</h2></summary>

### 🧪 Unit Tests (`test/unit`)

*   **Primary Purpose:** Quickly verify command logic, flag parsing, input validation, error handling, and basic output formatting **in isolation**. Focus on testing individual functions or methods within a command class.
*   **Dependencies:** **MUST** stub/mock all external dependencies (Ably SDK calls, Control API requests, filesystem access, `ConfigManager`, etc.). Use libraries like `sinon` and `nock`.
*   **Speed:** Very fast; no network or filesystem dependency.
*   **Value:** Useful for testing complex parsing, conditional logic, and edge cases within a command, but **less effective** at verifying core interactions with Ably services compared to Integration/E2E tests.

**CLI Core and Commands:**
*   **Tools:** Mocha, `@oclif/test`, `sinon`.
*   **Location:** Primarily within the `test/unit/` directory, mirroring the `src/` structure.
*   **Execution:** Run all unit tests with `pnpm test:unit` or target specific files, e.g., `pnpm test test/unit/commands/bench/bench.test.ts`.

**Example (Mocha/Sinon):**
```typescript
// Example unit test with proper mocking
import {expect} from '@oclif/test'
import * as sinon from 'sinon'
import {AblyCommand} from '../../src/base/ably-command'

describe('MyCommand', () => {
  let mockClient: any

  beforeEach(() => {
    // Set up mocks
    mockClient = {
      channels: {
        get: sinon.stub().returns({
          publish: sinon.stub().resolves()
        })
      },
      close: sinon.stub().resolves()
    }
    sinon.stub(AblyCommand.prototype, 'getAblyClient').resolves(mockClient)
  })

  afterEach(() => {
    sinon.restore()
  })

  it('publishes a message to the specified channel', async () => {
    // Test implementation
  })
})
```

**React Web CLI Components (`@ably/react-web-cli`):**
*   **Frameworks:** [Vitest](https://vitest.dev/) and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/). Vitest provides a Jest-compatible API for running tests, assertions, and mocking. React Testing Library is used to interact with components like a user would.
*   **Location:** Test files are co-located with the components they test (e.g., `packages/react-web-cli/src/AblyCliTerminal.test.tsx`).
*   **Execution:**
    *   Run all tests for `@ably/react-web-cli`: `pnpm --filter @ably/react-web-cli test`.
    *   Individual files via Vitest CLI: `pnpm exec vitest packages/react-web-cli/src/AblyCliTerminal.test.tsx`.
*   **Mocking:** Dependencies (e.g., `@xterm/xterm`, WebSockets) are mocked using Vitest's capabilities (`vi.mock`, `vi.fn`).

#### 🏗️ Testing Pyramid for React Web CLI Components

While developing the browser-based **Web CLI** we have found that an "inverted" test pyramid (many end-to-end Playwright tests, few unit tests) quickly becomes brittle and slows the feedback loop.  We therefore adopt a **pyramid approach** for this part of the codebase:

1.  **Unit tests (_broad base_) –** Exhaustive coverage of core logic that can execute **in isolation**:
    * `global-reconnect` timing & state machine.
    * React hooks and helpers inside `AblyCliTerminal` (without a real browser).
    * Mock **all** browser APIs (`WebSocket`, `xterm.js`, timers).

2.  **Focused E2E / Playwright tests (_narrow top_) –** Only verify **user-visible** flows:
    * Automatic reconnect succeeds when the server is restarted.
    * Users can cancel the reconnect countdown and later trigger a manual reconnect.

Everything else (exact countdown rendering, every internal state transition, console noise) is left to the unit layer.  This greatly reduces flake due to timing variance and Docker start-up times.

> **Tip for contributors:** If you find yourself mocking several browser APIs in a Playwright test, it probably belongs in a unit test instead.

### 🔄 Integration Tests (`test/integration`)

*   **Primary Purpose:** Verify the interaction between multiple commands or components, including interactions with *mocked* Ably SDKs or Control API services. Test the CLI execution flow.
*   **Dependencies:** Primarily stub/mock network calls (`nock` for Control API, `sinon` stubs for SDK methods), but may interact with the local filesystem for config management (ensure isolation). Use `ConfigManager` mocks.
*   **Speed:** Relatively fast; generally avoids real network latency.
*   **Value:** Good for testing command sequences (e.g., `config set` then `config get`), authentication flow logic (with mocked credentials), and ensuring different parts of the CLI work together correctly without relying on live Ably infrastructure.
*   **Tools:** Mocha, `@oclif/test`, `nock`, `sinon`, `execa` (to run the CLI as a subprocess).

Refer to the [Debugging Guide](mdc:docs/Debugging.md) for tips on debugging failed tests, including Playwright and Mocha tests.

### 🌐 End-to-End (E2E) Tests (`test/e2e`)

*   **Primary Purpose:** Verify critical user flows work correctly against **real Ably services** using actual credentials (provided via environment variables).
*   **Dependencies:** Requires a live Ably account and network connectivity. Uses real Ably SDKs and Control API interactions.
*   **Scope:** Focus on essential commands and common workflows (login, app/key management basics, channel publish/subscribe/presence/history, logs subscribe).
*   **Speed:** Slowest test type due to network latency and real API interactions.
*   **Value:** Provides the highest confidence that the CLI works correctly for end-users in a real environment. **Preferred** over unit tests for verifying core Ably interactions.
*   **Tools:** Mocha, `@oclif/test`, `execa`, environment variables (`E2E_ABLY_API_KEY`, etc.).
*   **Frequency:** Run automatically in CI (GitHub Actions) on PRs and merges. Can be run locally but may incur costs.

**Example:**
```typescript
// Example E2E test with real services
import {expect, test} from '@oclif/test'
import {execSync} from 'child_process'

describe('channels commands', function() {
  // Longer timeout for E2E tests
  this.timeout(10000)

  const testChannel = `test-${Date.now()}`
  const testMessage = 'Hello E2E test'

  it('can publish and then retrieve history from a channel', async () => {
    // Publish a message
    execSync(`ABLY_API_KEY=${process.env.E2E_ABLY_API_KEY} ably channels publish ${testChannel} "${testMessage}"`)

    // Wait a moment for message to be stored
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Get message from history
    const result = execSync(
      `ABLY_API_KEY=${process.env.E2E_ABLY_API_KEY} ably channels history ${testChannel} --json`
    ).toString()

    const history = JSON.parse(result)
    expect(history).to.be.an('array').with.lengthOf.at.least(1)
    expect(history[0].data).to.equal(testMessage)
  })
})
```

### 🎭 Playwright Tests (`test/e2e/web-cli`)

*   **Primary Purpose:** Verify the functionality of the Web CLI example application (`examples/web-cli`) running in a real browser.
*   **Dependencies:** Requires Node.js, a browser (installed via Playwright), and the Web CLI example app to be built.
*   **Speed:** Slow; involves browser automation and WebSocket connections.
*   **Value:** Ensures the embeddable React component works correctly with the hosted terminal server.
*   **Tools:** Playwright Test runner (`@playwright/test`).
*   **Frequency:** Run automatically in CI, separate from Mocha tests.

</details>

---

<details>
<summary><h2>🔧 Advanced Testing Guidance - Expand for Details</h2></summary>

## 📝 Test Coverage and Considerations

*   **Adding/Updating Tests:** When adding features or fixing bugs, add or update tests in the appropriate category (Unit, Integration, E2E, Playwright).
*   **Focus:** Prioritize **Integration and E2E tests** for verifying core functionality involving Ably APIs/SDKs, as unit tests with extensive mocking provide less confidence in these areas.
*   **Output Modes:** Tests should cover different output modes where relevant:
    *   Default (Human-readable)
    *   JSON (`--json`)
    *   Pretty JSON (`--pretty-json`)
*   **Web CLI Mode:** Integration/E2E tests for commands with different behavior in Web CLI mode should simulate this using `ABLY_WEB_CLI_MODE=true` environment variable. The Playwright tests cover the actual Web CLI environment.
*   **Test Output:** Test output (stdout/stderr) should be clean. Avoid polluting test logs with unnecessary debug output from the CLI itself. Failures should provide clear error messages.
*   **Asynchronous Operations:** Use `async/await` properly. Avoid brittle `setTimeout` calls where possible; use event listeners or promise-based waits.
*   **Resource Cleanup:** Ensure tests clean up resources (e.g., close Ably clients, kill subprocesses, delete temp files). Use the `afterEach` or `afterAll` hooks and helpers like `trackAblyClient`.
*   **Realtime SDK Stubbing:** For Unit/Integration tests involving the Realtime SDK, stub the SDK methods directly (`sinon.stub(ably.channels.get('...'), 'subscribe')`) rather than trying to mock the underlying WebSocket, which is complex and brittle.
*   **Credentials:** E2E tests rely on `E2E_ABLY_API_KEY` (and potentially others) being set in the environment (locally via `.env` or in CI via secrets). **Never** hardcode credentials in tests.

## 🗂️ Codebase Integration & Structure

### Folder Structure

```
.
├── src
│   └── commands/
├── test/
│   ├── e2e/                # End-to-End tests (runs against real Ably)
│   │   ├── core/           # Core CLI functionality E2E tests
│   │   ├── channels/       # Channel-specific E2E tests
│   │   └── web-cli/        # Playwright tests for the Web CLI example
│   │       └── web-cli.test.ts
│   ├── helpers/            # Test helper functions (e.g., e2e-test-helper.ts)
│   ├── integration/        # Integration tests (mocked external services)
│   │   └── core/
│   ├── unit/               # Unit tests (isolated logic, heavy mocking)
│   │   ├── base/
│   │   ├── commands/
│   │   └── services/
│   ├── setup.ts            # Full setup for E2E tests (runs in Mocha context)
│   └── mini-setup.ts       # Minimal setup for Unit/Integration tests
└── ...
```

### E2E Test Organization

E2E tests are organized by feature/topic (e.g., `channels-e2e.test.ts`, `presence-e2e.test.ts`) to improve maintainability and allow targeted runs. They use shared helpers from `test/helpers/e2e-test-helper.ts`.

</details>

---

## 🎯 Best Practices Quick Reference

1. **✅ DO** prioritize Integration and E2E tests for core Ably functionality
2. **✅ DO** clean up all resources in tests (clients, connections, mocks)
3. **✅ DO** use proper mocking (`sinon`, `nock`) for Unit/Integration tests
4. **✅ DO** avoid testing implementation details when possible (test behavior)
5. **✅ DO** use path-based test execution for faster development workflow

6. **❌ DON'T** rely solely on unit tests for Ably API interactions
7. **❌ DON'T** leave resources unclosed (memory leaks)
8. **❌ DON'T** use brittle `setTimeout` when avoidable
9. **❌ DON'T** hardcode credentials or API keys in tests

---

<div align="center">
🔍 For detailed troubleshooting help, see the <a href="mdc:docs/Troubleshooting.md">Troubleshooting Guide</a>.
</div>
