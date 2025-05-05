# Workplan: Terminal Server & Web CLI Improvements

This plan outlines the steps to implement the features tagged with `[feat/terminal-server-improvements]` in `docs/TODO.md`.

**Goal:** Enhance the Web CLI React component, Terminal Server, and related CLI functionalities for a more robust, user-friendly, and production-ready experience.

**Prerequisites:** Familiarity with the Ably CLI codebase, TypeScript, React, Docker, WebSocket communication, and the project's documentation (`.cursor/rules/` and `docs/`).

**Note:** Each step should include implementation, associated unit/integration/e2e/playwright tests, and documentation updates. Follow the Mandatory Development Workflow (`.cursor/rules/Workflow.mdc`) for each step. **Crucially, as each step corresponding to a `docs/TODO.md` task is completed, update that task in `docs/TODO.md` to mark it as done. Also, ensure any relevant documentation in `/docs` or rules in `.cursor/rules/` are updated to reflect the changes made.**

---

## Phase 1: Core Web CLI Component & Connection Logic

### Step 1.1: Integrate Basic Drawer Component
- **Task:** Integrate the existing `CliDrawer` component (`docs/workplans/resources/2025-05-cli-drawer.tsx`) into the web example (`examples/web-cli`).
- **Details:**
    - Set up the example page to offer two modes: full-screen terminal (current) and the new drawer view.
    - Ensure the drawer component renders correctly and basic open/close/resize functionality works.
    - Address initial linting errors in the drawer component (missing imports like `lucide-react`, `@/lib/utils`, and React type import issues). Resolve these based on the `examples/web-cli` project setup or install necessary dependencies.
- **Testing:**
    - Manual verification of drawer rendering and interaction in the example app.
    - Playwright test: Verify the drawer button exists, opens the drawer on click, closes on click, and basic resize works.
- **Status:** `[x] Done`
- **Summary:** Moved component to `examples/web-cli/src/components`, installed deps (`lucide-react`, `clsx`, `tailwind-merge`), created `lib/utils.ts`, fixed lint errors. Modified `App.tsx` for conditional rendering (fullscreen/drawer) with a toggle button, passing `AblyCliTerminal` to the drawer. Linting passes (ignoring TS module resolution error for `@ably/react-web-cli`).

### Step 1.2: Implement Connection Status & Basic Interaction
- **Task:** Display connection status ("Connecting...", "Connected", "Disconnected") within the React component's terminal interface (using `xterm.js` APIs). Show connecting animation/indicator.
- **Details:**
    - The terminal server (`scripts/terminal-server.ts`) and the React component need to exchange status messages.
    - Implement the ASCII connecting indicator as described in `TODO.md`. Clear the indicator once connected.
    - The component should expose connection state changes (connecting, connected, failed, disconnected) as props for the embedding application.
- **Testing:**
    - Unit tests for React component state transitions.
    - Playwright tests: Verify connecting indicator shows, disappears on connection, and state props update correctly.
- **Status:** `[ ] Not Started`
- **Summary:**

### Step 1.3: Robust Reconnection Logic with Backoff
- **Task:** Implement the specified automatic reconnection logic (up to 15 attempts with exponential backoff: 0s, 2s, 4s, 8s, 8s...) within the React component for network/server failures.
- **Details:**
    - Fix the "Attempt X/15" display bug.
    - Show visual feedback during reconnection attempts (countdown timer).
    - Provide an interactive way (e.g., press Enter) within the terminal to *cancel* automatic reconnection attempts.
    - After 15 failed attempts or manual cancellation, display a message and prompt the user to manually trigger a reconnect (e.g., press Enter).
- **Testing:**
    - Unit tests for the backoff strategy, attempt counting, and state management in the React component.
    - Playwright tests: Simulate network disconnects, verify reconnection attempts, backoff timing, cancellation, and manual reconnect prompt.
- **Status:** `[ ] Not Started`
- **Summary:**

### Step 1.4: Handle Server-Initiated Disconnections
- **Task:** Prevent automatic reconnection when the server sends specific error codes (e.g., invalid token, idle timeout, capacity issues). Display the disconnection reason from the server and prompt for manual reconnection.
- **Details:**
    - Define specific error codes/messages the terminal server will send for non-recoverable disconnects.
    - Update the React component's connection logic to check for these codes/messages.
    - Display the server message clearly in the terminal interface.
- **Testing:**
    - Unit tests for handling specific disconnect reasons.
    - Playwright tests: Simulate server sending disconnect errors, verify no auto-reconnect occurs, message is displayed, and manual reconnect is prompted.
- **Status:** `[ ] Not Started`
- **Summary:**

### Step 1.5: Session Resumption (Client & Server)
- **Task:** Implement session resumption on abrupt disconnects using a session ID. Handle page reloads optionally.
- **Details:**
    - **Server:** Issue a unique session ID on initial connection. Store terminal state associated with the ID. On reconnect with a valid session ID (within ~60s), restore the state and send it to the client.
    - **Client (React Component):** Receive and store the session ID. On abrupt disconnect, attempt reconnect using the session ID. Add an optional prop (`resumeOnReload`) to enable storing the session ID in `localStorage` on `unload` and attempting resumption on load. Expose the session ID as a component prop.
- **Testing:**
    - Unit/Integration tests for server-side session handling.
    - Unit tests for client-side session ID storage and reload logic.
    - Playwright tests: Simulate abrupt disconnects and verify session resumption. Test page reload resumption when enabled.
- **Status:** `[ ] Not Started`
- **Summary:**

### Step 1.6: Session conservation
- **Task:** Implement session termination and conserve sessions being created unless needed
- **Details:**
    - **Client (React Component):** If the drawer version of the CLI is closed and the terminal interface is not visible, then a session should not be loaded. A session should only be created when the terminal interface is visible in the browser, which in the case of the full screen version is always, but in the case of the drawer version, it should only appear when the user opens the drawer. If the drawer is closed, or the window tab is no longer visible (i.e. it's a backgrounded tab), then the terminal session should be terminated by the CLI component within 5 minutes of not being visible or the tab being closed, to help conserve resources on the server. The user should be told their session was terminated due to inactivity and they should be given the option to reconnect and start a new session on demand.
- **Testing:**
    - Unit/Integration tests for client-side handling of sessions not being created when the terminal interface is not visible, and the session terminated after 5 minutes of being not visible (hidden tab or drawer closed)
    - Unit tests for client-side handling
    - Playwright tests: Simulate drawer being closed and ensure the terminal session is not started, but then the session automatically starts when the terminal interface becomes visible. Simulate the terminal no longer being visible for 5 minutes, and ensure the session is terminated and the option to start a new session is available and works.
- **Status:** `[ ] Not Started`
- **Summary:**

## Phase 2: Enhancing User Experience & Guidance

### Step 2.1: Install Guidance on Failure/Capacity Issues
- **Task:** Display guidance on installing the native CLI within the web terminal interface when connection fails repeatedly or the server disconnects due to capacity.
- **Details:**
    - Integrate this message into the flows from Step 1.3 (max retries hit) and Step 1.4 (server capacity disconnect).
    - Message should include the install command (`pnpm install -g @ably/cli` - *Note: TODO mentions `@ably/web-cli`, but package is `@ably/cli`*).
- **Testing:**
    - Playwright tests: Verify the install guidance message appears under the specified failure conditions.
- **Status:** `[ ] Not Started`
- **Summary:**

### Step 2.2: Improve Auth Failure Messaging
- **Task:** Improve CLI error handling for 40x auth errors (API Key / Access Token). Show user-friendly messages without stack traces and guide towards `ably login` or `ably auth keys switch`.
- **Details:**
    - Modify `BaseCommand` or relevant error handling logic to catch specific auth error codes (e.g., 40100).
    - Format the output clearly, omitting stack traces for these specific errors.
    - Provide specific guidance based on the likely credential type (Control API token vs API Key).
- **Testing:**
    - Unit tests for error handling logic in `BaseCommand`.
    - Integration tests: Simulate commands failing with 401/403 errors (using `nock` or SDK stubs) and verify the specific output messages.
- **Status:** `[ ] Not Started`
- **Summary:**

### Step 2.3: Add "Login" Prompt for Unauthenticated Users
- **Task:** When `ably` is run standalone (no command) without existing config (`~/.ably/config`) and *not* in web terminal mode, display a prompt suggesting `ably login`.
- **Details:**
    - Modify the root command's logic or an `init` hook.
    - Check for `~/.ably/config` existence and `ABLY_WEB_CLI_MODE`.
    - Append the suggestion message after the standard help output.
- **Testing:**
    - Integration test: Run `ably` command with no config file present and verify the suggestion appears. Test that it *doesn't* appear if config exists or if `ABLY_WEB_CLI_MODE=true`.
- **Status:** `[ ] Not Started`
- **Summary:**

### Step 2.4: Implement "Change Auth" in Web Example
- **Task:** Add a button/link in the web example UI (outside the terminal) to allow changing the `apiKey` and `controlAccessToken` used by the `CliDrawer` component.
- **Details:**
    - Add UI elements (button, modal/form) to the `examples/web-cli` application.
    - The form should display current credentials (potentially masked) and allow inputting new ones.
    - On submit, re-initialize/reconnect the `CliDrawer` component with the new credentials.
- **Testing:**
    - Playwright tests: Verify the "Change Auth" button exists, opens a form, allows input, and triggers a terminal reconnect/re-initialization on submit.
- **Status:** `[ ] Not Started`
- **Summary:**

## Phase 3: Restricted Mode & Server Improvements

### Step 3.1: Implement "Restricted Docs Mode"
- **Task:** Implement the restricted mode for the web example, primarily driven by the absence of `ABLY_ACCESS_TOKEN`.
- **Details:**
    - **CLI:** In `BaseCommand` or relevant commands, check if `ABLY_WEB_CLI_MODE` is true AND `ABLY_ACCESS_TOKEN` is missing/empty.
    - If in restricted mode:
        - Disable Control API commands (e.g., `ably accounts *`, `ably apps *`, `ably auth keys *` etc.) with a message prompting signup/login.
        - Disable specific data plane commands (`ably channels list`, `ably spaces list`, `ably rooms list`, `ably logs *`) with an appropriate message.
    - **Web Example:** Ensure the example can be configured to launch the drawer without providing a `controlAccessToken`.
- **Testing:**
    - Unit/Integration tests: For each restricted command, test that it throws the correct error when `ABLY_WEB_CLI_MODE=true` and no `ABLY_ACCESS_TOKEN` is provided.
    - Playwright tests: Launch the web example without a control token and verify restricted commands fail with the correct messages.
- **Status:** `[ ] Not Started`
- **Summary:**

### Step 3.2: Add Inactivity Timeout to Terminal Server
- **Task:** Implement an inactivity timeout on the terminal server (`scripts/terminal-server.ts`).
- **Details:**
    - Track user activity (data received from the client WebSocket).
    - If no activity for a configurable duration (e.g., 30 minutes from PRD), terminate the Docker container and close the WebSocket connection gracefully, sending a notification message (Step 1.4).
- **Testing:**
    - Integration tests for the terminal server: Simulate client inactivity and verify connection termination and notification.
- **Status:** `[ ] Not Started`
- **Summary:**

### Step 3.3: Fix Web CLI Bugs
- **Task:** Address the bugs listed in `docs/TODO.md` for the web CLI terminal.
    - a) `ably help status` (and potentially other commands showing progress) clearing display.
    - b) Incorrect recognition of quotes (`"` and `'`) in commands like `ably help ask "what is ably"`.
- **Details:**
    - **Bug a):** Investigate how progress updates interact with `xterm.js` rendering in the React component or how the terminal server handles stdout streams. Ensure progress updates correctly overwrite previous lines or append as needed.
    - **Bug b):** Examine how commands and arguments are parsed and passed from the web client through the server to the CLI container. Ensure quotes are preserved or handled correctly during this process. Check shell interpretation within the container.
- **Testing:**
    - Playwright tests: Reproduce the bug scenarios (`ably help status`, `ably help ask "quoted query"`) and verify they are fixed.
- **Status:** `[ ] Not Started`
- **Summary:**

## Phase 4: Native CLI Enhancements (Related)

### Step 4.1: Post-Install Instructions
- **Task:** Ensure that after installing the CLI (`@ably/cli`) globally via npm/pnpm/yarn, the user sees the Ably logo and basic "run `ably`" instructions.
- **Details:**
    - This likely involves configuring the `postinstall` script in `package.json`.
    - The script should conditionally execute only during global installs (`npm install -g` or equivalent).
    - Use the existing logo utility (`src/utils/logo.ts`).
- **Testing:**
    - Manual testing of global install (`npm i -g .`, `pnpm add -g .`) in a clean environment.
    - Potentially an integration test simulating a global install if feasible.
- **Status:** `[ ] Not Started`
- **Summary:**

---

**Completion:** Once all steps are marked as `Done`, have passed the mandatory workflow checks (build, lint, test, docs), **and the corresponding tasks in `docs/TODO.md` are marked complete, and all affected documentation and rules files (`/docs`, `.cursor/rules/`) have been updated,** this work plan is complete.

## Phase 5: Fix bugs or feature advancements identified during this development process

Tasks:

- [ ] Bug: It appears the terminal server is "leaky" and can lose track of how many connections it has open. We should have a test that rapdily creates 30+ connections and abruptly terminates them, and we should then make sure the server reports that there are zero connections and is ready to accept new connections.
- [ ] Feature: The terminal server should expose key metrics via Promotheus
