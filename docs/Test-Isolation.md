# Test Stability & Isolation Plan

This document outlines the plan to refactor the test suite for improved stability and isolation, allowing all tests to be run reliably with a single command.

## Goal

Ensure true test isolation, preventing side effects between tests (especially regarding shared state like environment variables, filesystem, and Ably connections). Enable running the entire test suite via `pnpm test` using the `test/**/*.test.ts` pattern.

## Tasks

### Phase 1: Expose Hidden Issues & Isolate ConfigManager

-   [ ] **Remove `--exit` Flag:**
    -   Modify `scripts/run-tests.sh` to remove the `--exit` flag from the `mocha` command.
    -   *Goal:* Prevent Mocha from forcefully exiting, revealing hangs caused by resource leaks or incomplete asynchronous operations.
-   [ ] **Isolate `ConfigManager` Filesystem:**
    -   Modify `test/unit/services/config-manager.test.ts`.
    -   In a `before` hook for the `describe` block, create a unique temporary directory using `fs.mkdtempSync(path.join(os.tmpdir(), 'ably-cli-config-test-'))`. Store the path.
    -   In `beforeEach`, back up the original `process.env.ABLY_CLI_CONFIG_DIR` (if any) and set it to the unique temporary directory path.
    -   In `afterEach`, restore the original `process.env.ABLY_CLI_CONFIG_DIR`.
    -   In an `after` hook for the `describe` block, delete the unique temporary directory using `fs.rmSync(uniqueTempDir, { recursive: true, force: true })`.
    -   *Goal:* Prevent `ConfigManager` tests from interfering with the global config directory or other tests' configuration.
-   [ ] **Verify `ConfigManager` Stubbing:**
    -   Review `test/unit/services/config-manager.test.ts`.
    -   Ensure all filesystem stubs (`fs.existsSync`, `fs.mkdirSync`, etc.) are correctly created within a `sinon.createSandbox()` in `beforeEach` and restored in `afterEach`.
    -   *Goal:* Confirm filesystem interactions are properly mocked within the scope of each test.
-   [ ] **Remove `ConfigManager` Isolation Hack:**
    -   Remove `process.env.NODE_TEST_CONTEXT = 'config-manager-only'` from `test/unit/services/config-manager.test.ts`.
    -   Remove the corresponding checks in `test/setup.ts`.
    -   *Goal:* Eliminate the workaround now that proper isolation is being implemented.

### Phase 2: Enhance Global Cleanup & Resource Tracking

-   [ ] **Strengthen Global Cleanup (`test/setup.ts`):**
    -   Review `globalCleanup` function.
    -   Ensure *all* Ably Realtime clients created during tests (including helpers) are tracked via `trackAblyClient`.
    -   Improve Realtime client closing logic: Use `client.connection.once('closed', ...)` and `client.connection.once('failed', ...)` with appropriate timeouts. Ensure listeners (`.on()`/`.once()`) attached during tests are removed using `.off()`.
    -   Add diagnostic logging within `globalCleanup` to track which clients are being closed.
    -   *Goal:* Make global cleanup more robust to catch dangling Ably connections.
-   [ ] **Consider Root Hook Plugin:**
    -   Evaluate replacing the current `test/setup.ts` approach (relying on side effects and `beforeExit`) with Mocha's Root Hook Plugin (`--require test/root-hooks.ts`).
    -   *Goal:* Potentially achieve a cleaner, more standard structure for global setup/teardown.

### Phase 3: Isolate E2E and Integration Tests

-   [ ] **Ensure Ably Client Tracking:**
    -   Review all E2E (`test/e2e/**/*.test.ts`) and Integration (`test/integration/**/*.test.ts`) test files and helpers (`test/helpers/e2e-test-helper.ts`).
    -   Verify that *every* instance of `Ably.Rest` or `Ably.Realtime` created is passed to `trackAblyClient` from `test/setup.ts`.
    -   *Goal:* Guarantee all Ably clients are registered for global cleanup.
-   [ ] **Refine Background Process Cleanup:**
    -   Modify `test/helpers/e2e-test-helper.ts`.
    -   Update tests that use `runBackgroundProcess` to store the returned `ChildProcess` object.
    -   In `afterEach` hooks for these tests, explicitly call `killProcess` on the stored process objects.
    -   Refine `killProcess` to use appropriate signals (SIGINT, SIGTERM, SIGKILL) and handle errors gracefully. Remove the broad `cleanupBackgroundProcesses` function that uses `pkill`.
    -   *Goal:* Precisely manage the lifecycle of background processes started during tests.
-   [ ] **Ensure Temporary File Cleanup:**
    -   Review tests using `createTempOutputFile` from `test/helpers/e2e-test-helper.ts`.
    -   Ensure `afterEach` hooks delete these temporary files using `fs.unlink` or `fs.rmSync`.
    -   *Goal:* Prevent clutter and potential side effects from leftover test files.

### Phase 4: Consolidate Test Execution

-   [ ] **Refactor `package.json` Test Scripts:**
    -   Modify the `test` script to use a single `run-tests.sh` call with the `test/**/*.test.ts` pattern. Example: `"test": "./scripts/run-tests.sh "test/**/*.test.ts" --timeout 30000"`
    -   Remove the separate `test:configmanager` and `test:other` scripts.
    -   Remove the `SKIP_E2E_TESTS=true` prefix from the test command (assuming `.env` provides necessary credentials).
    -   *Goal:* Simplify test execution to a single, standard command.
-   [ ] **Verify Full Suite Pass:**
    -   Run `pnpm test` multiple times.
    -   Confirm all tests (unit, integration, E2E) pass reliably without isolation issues or hangs.
    -   *Goal:* Validate the success of the isolation refactoring.

