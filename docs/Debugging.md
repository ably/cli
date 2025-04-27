# Debugging Guide

This guide provides tips for debugging common issues when developing the Ably CLI.

## General Tips

*   **Check Logs:** Look for errors or relevant messages in the CLI output, test runner output, server logs (for Web CLI tests), or browser console (for Web CLI tests).
*   **Isolate the Issue:** Try to reproduce the problem with the simplest possible command or test case. Comment out parts of the code or test to narrow down the source of the error.
*   **Consult Documentation:** Review relevant project docs (`docs/`, `.cursor/rules/`) and Ably documentation (<https://ably.com/docs>).

## Debugging Tests

Refer to [docs/Testing.md](mdc:docs/Testing.md) for how to run specific tests.

### Mocha Tests (Unit, Integration, E2E)

*   **Verbose Output:** Run Mocha with increased verbosity if needed (though the default `spec` reporter is usually detailed). Check `scripts/run-tests.sh` for current settings.
*   **Debugger:** Use the Node.js inspector:
    ```bash
    # Add --inspect-brk flag
    node --inspect-brk --import 'data:text/javascript,...' ./node_modules/mocha/bin/mocha ... [your test path]
    ```
    Then attach your debugger (e.g., Chrome DevTools, VS Code debugger).
*   **`console.log`:** Add temporary `console.log` statements in the test or the code being tested.
*   **Mocking Issues (Unit/Integration):**
    *   Verify mocks (`sinon`, `nock`) are correctly set up and restored (`beforeEach`/`afterEach`).
    *   Ensure stubs match the actual function signatures.
    *   Check that network requests are being intercepted as expected (e.g., using `nock.recorder`).
*   **E2E Failures:**
    *   **Credentials:** Ensure `E2E_ABLY_API_KEY` (and any other required keys) are correctly set in your environment (`.env` file locally, secrets in CI).
    *   **Network:** Check for network connectivity issues to Ably services.
    *   **Resource Conflicts:** Ensure previous test runs cleaned up resources correctly (e.g., unique channel names per test run).
    *   **CI vs. Local:** If tests fail only in CI, suspect environment differences (Node version, dependencies, permissions, resources). Check CI logs carefully.

### Playwright Tests (Web CLI)

*   **Test Output:** Playwright provides detailed error messages, including:
    *   The specific action that failed (e.g., `locator.waitFor`, `expect.toContainText`).
    *   The expected vs. received values.
    *   Call logs showing the sequence of actions.
*   **Error Context:** Check the linked `error-context.md` file in `test-results/` for screenshots, DOM snapshots, and console logs at the point of failure.
*   **Browser Console:** Add `page.on('console', ...)` listeners in your test (as shown in `.specstory` examples) to capture browser logs.
*   **Debugging UI Mode:** Run Playwright with the UI for interactive debugging:
    ```bash
    pnpm exec playwright test test/e2e/web-cli/web-cli.test.ts --ui
    ```
*   **Common Issues:**
    *   **Selector Timeouts:** The element didn't appear within the timeout. Check if the server/app started correctly, if there were errors, or if the selector is correct.
    *   **Incorrect Text/Assertions:** The expected text doesn't match the actual text in the terminal (check for subtle differences like whitespace, case sensitivity, or ANSI codes if not using `toContainText`).
    *   **Connection Errors:** Check browser console logs and terminal server logs for WebSocket connection issues (e.g., wrong port, server crash, `ERR_CONNECTION_REFUSED`).
    *   **Build Artifacts:** Ensure the Web CLI example (`examples/web-cli`) was built successfully (`pnpm --filter ably-web-cli-example build`) before the test runs, especially in CI.

## Debugging the CLI Locally

*   **Run with Node Inspector:**
    ```bash
    node --inspect-brk bin/run.js [your command and flags]
    ```
    Attach your debugger.
*   **Verbose Flags:** Use the CLI's built-in `--verbose` flag if available for the command.
*   **Oclif Debugging:** Set the `DEBUG` environment variable for oclif internal logs:
    ```bash
    DEBUG=oclif* bin/run.js [command]
    ```
*   **Check Configuration:** Use `ably config` (opens the config file) to verify stored credentials or settings.
