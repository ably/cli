# Testing Strategy & Policy

See also: [Debugging Guide](mdc:docs/DEBUGGING.md) for troubleshooting tips.

## Testing Goals & Guiding Principles

1.  **Confidence:** Ensure each command works as intended and avoid regressions.
2.  **Speed & Developer Experience:** Most tests should be quick to run, easy to debug, and not require a live environment.
3.  **Real Integration Coverage (where needed):** Some commands may need to be tested against real APIs (e.g., Ably's pub/sub product APIs and Control APIs) to verify end-to-end flows—especially for mission-critical commands.
4.  **Scalability:** The test setup should scale as commands grow in complexity.
5.  **Mandatory Coverage:** Adding or updating relevant tests is a **required** step for all feature additions or bug fixes. See [.cursor/rules/WORKFLOW.mdc](mdc:.cursor/rules/WORKFLOW.mdc).

## Testing Approach

### Unit Tests (`test/unit`)

*   **Primary Purpose:** Quickly verify command logic, flag parsing, input validation, error handling, and basic output formatting **in isolation**. Focus on testing individual functions or methods within a command class.
*   **Dependencies:** **MUST** stub/mock all external dependencies (Ably SDK calls, Control API requests, filesystem access, `ConfigManager`, etc.). Use libraries like `sinon` and `nock`.
*   **Speed:** Very fast; no network or filesystem dependency.
*   **Value:** Useful for testing complex parsing, conditional logic, and edge cases within a command, but **less effective** at verifying core interactions with Ably services compared to Integration/E2E tests.
*   **Tools:** Mocha, `@oclif/test`, `sinon`.
*   **Example:** Testing `ably apps create --name myApp` ensures correct arguments are parsed and the *mocked* Control API call is made with the expected payload.

### Integration Tests (`test/integration`)

*   **Primary Purpose:** Verify the interaction between multiple commands or components, including interactions with *mocked* Ably SDKs or Control API services. Test the CLI execution flow.
*   **Dependencies:** Primarily stub/mock network calls (`nock` for Control API, `sinon` stubs for SDK methods), but may interact with the local filesystem for config management (ensure isolation). Use `ConfigManager` mocks.
*   **Speed:** Relatively fast; generally avoids real network latency.
*   **Value:** Good for testing command sequences (e.g., `config set` then `config get`), authentication flow logic (with mocked credentials), and ensuring different parts of the CLI work together correctly without relying on live Ably infrastructure.
*   **Tools:** Mocha, `@oclif/test`, `nock`, `sinon`, `execa` (to run the CLI as a subprocess).
*   **Example:** Testing `ably accounts login` (mocked browser flow) -> `ably apps list` (mocked Control API) -> `ably apps switch` -> `ably apps current` (mocked Control API).

### End-to-End (E2E) Tests (`test/e2e`)

*   **Primary Purpose:** Verify critical user flows work correctly against **real Ably services** using actual credentials (provided via environment variables).
*   **Dependencies:** Requires a live Ably account and network connectivity. Uses real Ably SDKs and Control API interactions.
*   **Scope:** Focus on essential commands and common workflows (login, app/key management basics, channel publish/subscribe/presence/history, logs subscribe).
*   **Speed:** Slowest test type due to network latency and real API interactions.
*   **Value:** Provides the highest confidence that the CLI works correctly for end-users in a real environment. **Preferred** over unit tests for verifying core Ably interactions.
*   **Tools:** Mocha, `@oclif/test`, `execa`, environment variables (`E2E_ABLY_API_KEY`, etc.).
*   **Frequency:** Run automatically in CI (GitHub Actions) on PRs and merges. Can be run locally but may incur costs.
*   **Example:** Running `ably channels publish test-channel hello` and then running `ably channels subscribe test-channel` in a separate process to verify the message is received.

### Playwright Tests (`test/e2e/web-cli`)

*   **Primary Purpose:** Verify the functionality of the Web CLI example application (`examples/web-cli`) running in a real browser.
*   **Dependencies:** Requires Docker, Node.js, a browser (installed via Playwright), and the Web CLI example app to be built.
*   **Speed:** Slow; involves starting servers, Docker containers, and browser automation.
*   **Value:** Ensures the embeddable React component, terminal server, and containerized CLI work together as expected.
*   **Tools:** Playwright Test runner (`@playwright/test`), Docker.
*   **Frequency:** Run automatically in CI, separate from Mocha tests.

## Running Tests

Refer to [.cursor/rules/WORKFLOW.mdc](mdc:.cursor/rules/WORKFLOW.mdc) for the mandatory requirement to run tests.

*   **Run All (Unit, Integration, E2E - excluding Playwright):**
    ```bash
    pnpm test
    ```
*   **Run Only Unit Tests:**
    ```bash
    pnpm test:unit
    ```
*   **Run Only Integration Tests:**
    ```bash
    pnpm test:integration
    ```
*   **Run Only E2E Tests (Mocha-based, excluding Playwright):**
    ```bash
    pnpm test:e2e
    ```
*   **Run Only Playwright Web CLI Tests:**
    ```bash
    pnpm test:playwright
    ```
*   **Run Specific File(s):** (Uses Mocha runner by default)
    ```bash
    # Example: Run a specific unit test file
    pnpm test test/unit/commands/apps/create.test.ts

    # Example: Run all tests in the integration/core directory
    pnpm test test/integration/core/**/*.test.ts

    # Example: Run a specific Playwright test file (uses Playwright runner)
    pnpm test test/e2e/web-cli/web-cli.test.ts
    ```
*   **Debugging Tests:** See [docs/DEBUGGING.md](mdc:docs/DEBUGGING.md).

## Test Coverage and Considerations

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

## Codebase Integration & Structure

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
