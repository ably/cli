# Testing strategy & policy

## Testing Goals & Guiding Principles

1. Confidence: Ensure each command works as intended and avoid regressions.
2. Speed & Developer Experience: Most tests should be quick to run, easy to debug, and not require a live environment.
3. Real Integration Coverage (where needed): Some commands may need to be tested against real APIs (e.g. Ably’s pub/sub product APIs and Control APIs) to verify end-to-end flows—especially for mission-critical commands.
4.Scalability: The test setup should scale as commands grow in complexity.

## Testing Approach

### Unit Tests (Command-level, stubbed HTTP calls)

- Primary Purpose: Quickly verify logic, parse user inputs, handle expected errors.
- Test Speed: Very fast; no external network dependency.
  - Tools & Techniques:
    - Mocha for testing framework along with @oclif/test
    - Nock for stubbing HTTP requests.
    - sinon for function/method stubs or spies.
    - [nyc](mdc:https:/npm.im/nyc) for code coverage (bundled with oclif)
- Example: Testing the `ably apps create` command, ensuring that if you pass `--name myApp`, it calls the POST /apps endpoint with the correct payload.

### Integration Tests (Higher-level, partial real environment)

- Primary Purpose: Verify multiple commands or flows together, but still mostly stub out network calls.
- Key Differences from Unit:
  - Might test a sequence of commands to ensure they produce expected output or state.
  - Use a test user or ephemeral environment tokens, but still stub the heavy-lifting network calls.
- Tools & Techniques:
  - execa or child_process.spawn to run the CLI in a subprocess, capturing stdout/stderr.
  - Maintain a local mock server for REST opeations if some calls are required.

### End-to-End Tests (Real environment)

- Primary Purpose: Ensure that the entire command pipeline works with real Ably endpoints.
- Scope: Test critical flows (e.g., creating an app, listing channels, sending messages, etc.) with real Ably credentials.
- Challenges: Requires stable environment, correct credentials, potential costs if usage-based.
- Frequency: Run on merges to main and pull requests, but not typically locally
- Tools & Techniques:
  - Same as integration tests (execa/spawn), but with real environment variables/tokens.
  - Secret credetials to be stored GitHub Actions (e.g., via repository secrets).

## Code Base Integration & Structure

### Folder Structure

The CLI will use common folder structures for tests as follows:

.
├── src
│   ├── commands
│   │   ├── apps
│   │   │   └── create.ts
│   │   └── realtime
│   │       └── connect.ts
│   └── ...
├── test
│   ├── unit
│   │   ├── apps
│   │   │   └── create.test.ts
│   │   └── realtime
│   │       └── connect.test.ts
│   ├── integration
│   │   └── cli-flows.test.ts
│   └── e2e
│       └── e2e.test.ts
└── ...

- test/unit mirrors the command structure, focusing on command-level logic.
- test/integration contains broader tests of multiple commands or realistic user flows, but generally mocking out network.
- test/e2e has real environment-dependent tests, possibly fewer in number, but ensuring real interactions.

## Testing coverage and considerations

- Each command's code should be isolated code by stubbing out all network requests and external dependencies to ensure we have coverage over expected inputs and outputs
- All tests should provide coverage for the following modes:
  - Local CLI human readable - primary use case for the CLI is users executing the CLI locally and expecting human readable responses
  - Local JSON mode (`--json`) - this use case is for developers using the CLI in their scripts, such as bash commands with `jq` to parse responses. It is important the only output from commands with `--json` is JSON without any superfluous information such as state change events unnecessary for the command result.
  - Local Pretty JSON mode (`--pretty-json`) - this use case is for developers using the CLI locally but preferring to see raw JSON output. We need to ensure JSON is colour coded.
  - Web CLI mode - in this mode the CLI is invoked from a Docker container via the web terminal we provide. Tests should simulate the Web CLI mode by injecting the `ABLY_WEB_CLI_MODE=true` environment variable when runnin commands. In addition, we should have a few end to end tests that execute commands directly to the Docker container itself, and thne some tests should be run to spin up the example web server and ensure the basic features of the Web CLI works in the browser.
- For tests that subscribe or run on indefinitely waiting for events, the test suite will have to send a SIGINT to stop the command.
- Testing commands where Realtime Ably clients are used, it's not practical to stub the network requests as the underlying websocket protocol is complicated which would result in this test suite being too coupled to the underlying protocol. Stubbing should be done on the SDK interfaces themselves instead.
- Some end to end tests will exist that concurrent perform actions like publishing and subscribing to messages to ensure the CLI works with real network requests.