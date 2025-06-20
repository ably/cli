# Tasks

## Features

- [ ] Consider changing the transport to use Ably instead of direct WebSocket to the terminal server
`timeout` is a good safe guard anyway to avoid human intervention when commands lock up.
- [ ] Support new endpoint client options when available in our public APIs -> https://github.com/ably/ably-js/pull/1973

## API and Architecture

- [ ] Ensure all Ably channels commands that should use the REST API do, by default
- [ ] Standardise on use of createAblyClient for both Rest and Realtime. It's odd that we have to explicitly call showAuthInfoIfNeeded when using Ably.Rest, but not for createAblyClient. CreateAblyClient should simply support Rest and Realtime, and ensure showAuthInfoIfNeeded will only execute once in case both Rest and Realtime are used.
- [ ] MCP server is not fully implemented, see log below. We should implement it so that it works fully for resources as expected.
  ```text
  2025-04-11T23:03:05.759Z [ably] [info] Message from client: {"method":"prompts/list","params":{},"jsonrpc":"2.0","id":24}
  2025-04-11T23:03:05.760Z [ably] [info] Message from server: {"jsonrpc":"2.0","id":24,"error":{"code":-32601,"message":"Method not found"}}
  2025-04-11T23:03:09.718Z [ably] [info] Message from client: {"method":"resources/list","params":{},"jsonrpc":"2.0","id":25}
  2025-04-11T23:03:10.969Z [ably] [info] Message from server: {"jsonrpc":"2.0","id":25,"result":{"resources":[{"name":"Default","uri":"ably://apps/cPr1qg","current":true},{"name":"Collaboration Tampermonkey","uri":"ably://apps/hdBgGA","current":false}]}}
  2025-04-11T23:03:10.969Z [ably] [info] Message from client: {"method":"prompts/list","params":{},"jsonrpc":"2.0","id":26}
  2025-04-11T23:03:10.970Z [ably] [info] Message from server: {"jsonrpc":"2.0","id":26,"error":{"code":-32601,"message":"Method not found"}}
  2025-04-11T23:03:14.716Z [ably] [info] Message from client: {"method":"resources/list","params":{},"jsonrpc":"2.0","id":27}
  2025-04-11T23:03:15.346Z [ably] [info] Message from client: {"method":"resources/read","params":{"uri":"ably://apps/cPr1qg"},"jsonrpc":"2.0","id":28}
  2025-04-11T23:03:15.350Z [ably] [info] Message from server: {"jsonrpc":"2.0","id":28,"error":{"code":-32602,"message":"MCP error -32602: Resource ably://apps/cPr1qg not found"}}
  2025-04-11T23:03:15.493Z [ably] [info] Message from server: {"jsonrpc":"2.0","id":27,"result":{"resources":[{"name":"Default","uri":"ably://apps/cPr1qg","current":true},{"name":"Collaboration Tampermonkey","uri":"ably://apps/hdBgGA","current":false}]}}
  ```

## Best Practices

- [ ] Look for areas of unnecessary duplication as help.ts checking "commandId.includes('accounts login')" when the list of unsupported web CLI commands exists already in BaseCommand WEB_CLI_RESTRICTED_COMMANDS
- [ ] Now that we have .editorconfig, ensure all files adhere in one commit
- [ ] We are using a PNPM workspace, but I am not convinced that's a good thing. We should consider not letting the examples or React component dependencies affect the core CLI packaging.
- [ ] Implement token bearer auth for web CLI usage to minimise exposure of API keys and access tokens. This same thinking should apply to anonymous users (in spite of the API key being recycled), and the CLI needs to handle expiring tokens. See https://ably.atlassian.net/wiki/spaces/product/pages/4033511425/PDR-070+Web+CLI+technical+architecture?focusedCommentId=4051042310.

## Bugs

- [ ] Running `pnpm test [filepath]` does not run the test file only, it runs all tests. The docs state this works so needs fixing.
- [ ] Running the tests in debug mode seem to indicate here is a loop of some sort causing slowness: `DEBUG=* pnpm test test/e2e/core/basic-cli.test.ts` to replicate this issue, see how man times `config loading plugins [ './dist/src' ]` is loadedx
- [ ] Test filters don't appear to be working with pnpm `pnpm test --filter 'resume helpers'` shows warning 'Warning: Cannot find any files matching pattern "helpers"' and then runs all tests.
- [ ] When the server times out due to inactivity, the message "--- Session Ended (from server): Session timed out due to inactivity ---" is shown. At this time, the CLI should have shown a dialog saying the client was disconnected and prompting the user to interact by pressing Enter to reconnect. It should not automatically reconnect to conserve resources for idle connections.
- [ ] The text inside the web terminal is now not wrapping, but instead it's scrolling off to the left showing a "<" char to the left of teh line. THis is not what is expected and should wrap to the next line. Need to tweak the bash settings.
- [ ] One of the Playwright tests is flakey -> https://github.com/mattheworiordan/ably-cli/actions/runs/15327667612/job/43126212502
      `test/e2e/web-cli/prompt-integrity.test.ts:94:3 › Prompt integrity & exit behaviour › Typing `exit` ends session and page refresh starts a NEW session automatically`

## Test coverage

### Unit tests

- [ ] **Core CLI & Infrastructure:**
  - [x] `BaseCommand`: Flag parsing, error handling, output modes (JSON, pretty-JSON, Web CLI), API client creation (mocked), `showAuthInfoIfNeeded`, `setupCleanupHandler`, `parseApiKey`, `ensureAppAndKey` flows.
    - [x] Test global flags (--host, --env, --control-host, --access-token, --api-key, --client-id, --verbose) propagation and overrides across commands.
    - [x] Test invalid API key/token error flows and correct JSON error output
    - [ ] Test interpolation and variable substitution in message templates (`{{.Count}}`, `{{.Timestamp}}`)
    - [x] Test conflict error when using `--json` and `--pretty-json` together.
    - [x] Test `parseApiKey` with invalid formats (missing key secret, malformed string).
    - [ ] Test `setClientId` behavior for explicit `--client-id none` and default random UUID.
    - [x] Test `ensureAppAndKey` fallback with env vars vs interactive prompts when config missing.
    - [ ] Test error output JSON structure for invalid API key or token.
  - [ ] `login.ts`: Mocked account login flow interaction.
  - [x] `config.ts`: Mocked config read/write operations.
  - [ ] `help` commands: Output generation, argument handling.
    - [ ] Test `help ask` AI agent integration with mocked responses
    - [ ] Test help command with and without web-cli-help flag
  - [ ] `hooks/init/alias-command.ts`: Command aliasing logic.
  - [x] `hooks/command_not_found/did-you-mean.ts`: Command suggestion logic.
    - [x] Test Levenshtein distance calculation for command suggestions
    - [x] Test formatting of suggestions
  - [x] `services/config-manager.ts`: Test storage and retrieval of account, app, and API key information
  - [x] `services/control-api.ts`: Test Control API request formatting and error handling
  - [x] `services/interactive-helper.ts`: Test interactive prompts (mocked)
  - [ ] Output Formatting Utilities: Table formatting, colorization logic.
- [ ] **Accounts:**
  - [ ] `accounts login/logout/list/switch/current/stats`: Mock Control API calls, flag handling, output formats, config interactions.
    - [ ] Test account login flow with browser opener mock
    - [ ] Test account storing with and without aliases
    - [ ] Test switch functionality between different accounts
    - [ ] Test invalid access token input error and user guidance output
- [ ] **Apps:**
  - [ ] `apps create/list/update/delete/switch/current/set-apns-p12`: Mock Control API calls, flag handling, output formats, config interactions.
    - [ ] Test app creation with all available options
    - [ ] Test app update with partial data
    - [ ] Test P12 certificate file upload handling
    - [ ] Test failure scenarios: duplicate app names, API error mapping
  - [ ] `apps stats`: Mock Control API calls, flag handling, output formats.
    - [ ] Test stats parsing and formatting for different time ranges
    - [ ] Test --live polling functionality with mocked responses
  - [ ] `apps logs history/subscribe`: Mock Control API/SDK, flag handling, output formats, SIGINT handling.
    - [ ] Test logs filtering by types and parameters
    - [ ] Test SIGINT handling for log subscription
  - [ ] `apps channel-rules create/list/update/delete`: Mock Control API calls, flag handling, output formats.
    - [ ] Test rule creation with various permission combinations
    - [ ] Test namespace pattern validations
- [ ] **Auth:**
  - [ ] `auth issue-ably-token/issue-jwt-token/revoke-token`: Mock SDK/API calls, flag handling, output formats.
    - [ ] Test token generation with different capabilities
    - [ ] Test token TTL parameter handling
    - [ ] Test JWT token claims and signing
    - [ ] Test invalid capability JSON and error reporting
  - [ ] `auth keys create/list/get/update/revoke/switch/current`: Mock Control API calls, flag handling, output formats, config interactions.
    - [ ] Test key creation with different capability sets
    - [ ] Test key revocation flow including confirmation
- [ ] **Channels (Pub/Sub):**
  - [x] `channels list/publish/subscribe/history/batch-publish`: Mock SDK/API calls, flag handling, encoding, output formats, SIGINT handling.
    - [x] Test message encoding/decoding (including binary data)
    - [x] Test channel reuse for multiple publish operations
    - [x] Test batch publish with file input
    - [x] Test `--count` and `--delay` options apply correct number/timing of messages
    - [x] Test encryption flag (`--cipher`) produces encrypted messages and proper decryption
    - [x] Test publish / subscribe / batch-publish plus --delay unit testing
  - [x] `channels presence enter/subscribe`: Mock SDK, flag handling, output formats, SIGINT handling.
    - [x] Test presence data handling (clientId, data payloads)
    - [x] Test presence filtering by clientId
  - [x] `channels occupancy get/subscribe`: Mock SDK, flag handling, output formats, SIGINT handling.
    - [x] Test occupancy metrics parsing and formatting
    - [x] Test live updates with simulated changes
- [ ] **Channel Rules (Legacy):**
  - [ ] `channel-rule create/list/update/delete`: Mock Control API calls, flag handling, output formats. (Verify necessity).
- [ ] **Connections:**
  - [ ] `connections stats`: Mock REST API call, flag handling, output formats.
    - [ ] Test different stat aggregation periods
    - [ ] Test connection types filtering
  - [ ] `connections test`: Mock SDK connection attempts, flag handling, output formats.
    - [ ] Test different transport options (WebSockets, HTTP)
    - [ ] Test environment selection
  - [ ] `connections logs`: Verify proxying to `logs connection subscribe`.
- [ ] **Logs:**
  - [ ] `logs connection/connection-lifecycle/channel-lifecycle/push/app`: Mock SDK/API calls, flag handling, output formats, SIGINT handling.
    - [ ] Test log filtering by types and channels
    - [ ] Test rewind capability for supported channels
    - [ ] Test formatted output for different log types
    - [ ] Test rewind and live subscription flags interop and error conditions
- [ ] **Queues:**
  - [ ] `queues create/list/delete`: Mock Control API calls, flag handling, output formats.
    - [ ] Test queue creation with various TTL and size options
    - [ ] Test deletion confirmation flow
    - [ ] Test invalid TTL or size parameters produce meaningful errors
- [ ] **Integrations:**
  - [ ] `integrations create/list/get/update/delete`: Mock Control API calls, flag handling, output formats.
    - [ ] Test creation of different integration types
    - [ ] Test source/target configuration validation
    - [ ] Test invalid integration configuration fields rejected
- [ ] **Spaces:**
  - [ ] `spaces list`: Mock SDK/API call, flag handling, output formats.
  - [ ] `spaces members/locks/locations/cursors`: Mock Spaces SDK calls, flag handling, output formats, SIGINT handling for subscribe commands.
    - [ ] Test location coordinate handling and updates
    - [ ] Test cursor movement simulation
    - [ ] Test lock acquisition and conflict handling
    - [ ] Test auto-simulation of cursor movement when no coordinates provided
- [ ] **Rooms (Chat):**
  - [ ] `rooms list`: Mock Chat SDK/API call, flag handling, output formats.
  - [ ] `rooms messages/occupancy/reactions/presence/typing`: Mock Chat SDK calls, flag handling, output formats, SIGINT handling for subscribe commands.
    - [ ] Test message formatting and rendering
    - [ ] Test typing indicators state handling
    - [ ] Test reactions to specific message ids
    - [ ] Test `--count` and `--delay` interpolation identical to channels
    - [ ] Test invalid room ID errors handled gracefully
- [ ] **Benchmarking:**
  - [ ] `bench publisher/subscriber`: Mock SDK, complex flag interactions, parameter validation, summary generation logic.
    - [ ] Test metrics calculation (throughput, latency)
    - [ ] Test synchronization between publisher and subscriber
    - [ ] Test throttling and rate limiting
    - [ ] Test invalid rate limits (>20 msgs/sec) are rejected early
- [ ] **MCP:**
  - [ ] `mcp start-server`: Server startup logic, argument parsing.
    - [ ] Test MCP request handling for supported commands
    - [ ] Test resource URI parsing
    - [ ] Test timeout handling for long-running operations
    - [ ] Test unsupported MCP methods return JSON-RPC "Method not found"
  - [ ] Test resource listing and operations
- [ ] **Web CLI:** Test the terminal server with mocked Docker container.
  - [x] Test WebSocket connection handling
  - [x] Test command restriction enforcement
  - [x] Test environment variable passing
- [ ] **Web CLI Restrictions:** For each restricted command, simulate `ABLY_WEB_CLI_MODE` and assert correct error message

### Integration tests

- [ ] **Core CLI:** `config set` -> `config get`, default/topic help output, command not found hook trigger.
  - [x] Test that a user's config file is correctly written with expected values and structure
  - [x] Test that topics show proper help information with examples
  - [x] Test `ably help` without arguments lists all high-level topics correctly.
  - [ ] Test interactive `ensureAppAndKey` prompts sequence in one CLI invocation.
- [ ] **Accounts:** Mocked login -> list -> current -> switch -> current -> logout sequence.
  - [ ] Verify account state is properly maintained across commands
  - [ ] Test that logout properly clears sensitive information
- [ ] **Apps:** Mocked create -> list -> current -> switch -> update -> delete sequence; mocked channel-rules CRUD sequence.
  - [ ] Verify app selection state affects subsequent commands
  - [ ] Test that app properties are properly persisted after update
- [ ] **Auth:** Mocked keys create -> list -> current -> switch -> update -> revoke sequence.
  - [ ] Test that key capabilities are correctly applied
  - [ ] Verify that revoked keys can no longer be used
- [x] **Channels (Pub/Sub):** Mocked publish -> subscribe, publish -> history, presence enter -> presence subscribe, occupancy get/subscribe sequences.
  - [x] Test message delivery from publish to subscribe
  - [x] Test that published messages appear in history
  - [x] Test that presence state is correctly maintained
  - [x] Test occupancy metrics correctly reflect channel activity
- [ ] **Queues:** Mocked create -> list -> delete sequence.
  - [ ] Test queue configuration validation
- [ ] **Integrations:** Mocked create -> list -> get -> update -> delete sequence.
  - [ ] Test that integration rules are properly applied
- [ ] **Spaces:** Mocked SDK interactions for members, locks, locations, cursors (e.g., enter -> subscribe, acquire -> get).
  - [ ] Test concurrent lock operations
  - [ ] Test member entry/exit notifications
- [ ] **Rooms (Chat):** Mocked SDK interactions for messages, occupancy, reactions, presence, typing (e.g., enter -> subscribe, send -> subscribe).
  - [ ] Test message threading and ordering
  - [ ] Test reaction aggregation
- [ ] **Benchmarking:** Local publisher/subscriber run (mocked SDK connections), report generation.
  - [ ] Test report formatting and data accuracy
- [ ] **MCP:** Local server start, mock client connection, basic request/response test.
  - [ ] Test resource listing and operations
- [ ] **Web CLI:** Test the terminal server with mocked Docker container.
  - [x] Test WebSocket connection handling
  - [x] Test command restriction enforcement
  - [x] Test environment variable passing
- [ ] **Web CLI Restrictions:** For each restricted command, simulate `ABLY_WEB_CLI_MODE` and assert correct error message

### End to End (e2e) tests

- [ ] **Core CLI:** `ably --version`, `ably help`, `ably help ask`.
  - [x] Verify version output matches package.json
  - [ ] Test AI help agent with real queries
  - [ ] Test interactive login flow end-to-end using pseudo-TTY simulation.
- [ ] **Accounts:** Real login flow (interactive/token), `list`, `current`, `stats`.
  - [ ] Test end-to-end login with browser redirect
  - [ ] Test stats retrieval with different time periods
- [ ] **Apps:** Real create, list, delete; real `stats`, `channel-rules list`, `apps logs subscribe`.
  - [ ] Create app with specific settings and verify creation
  - [ ] Test app lifecycle from creation to deletion
- [ ] **Auth:** Real keys create, list, revoke; real `issue-ably-token`.
  - [ ] Create key with specific capabilities and verify they work
  - [ ] Test token creation and use with client libraries
- [x] **Channels (Pub/Sub):** Real publish/subscribe, history, presence enter/subscribe, list.
  - [x] Test cross-client communication
  - [x] Test message persistence and retrieval
  - [x] Test presence enter/leave operations
  - [x] Test occupancy metrics for active channels
  - [x] Test subscribe functionality with real-time message delivery
- [ ] **Connections:** Real `test`, `stats`.
  - [ ] Test connection across different networks/environments
  - [ ] Verify connection metrics are accurately reported
- [ ] **Logs:** Real `connection subscribe`, `push subscribe`.
  - [ ] Test log delivery timing and completeness
  - [ ] Verify push notification logs appear correctly
- [ ] **Queues:** Real create, list, delete.
  - [ ] Test queue throughput and message retention
- [ ] **Integrations:** Real create, list, delete.
  - [ ] Test integration with real external services (e.g., AWS, Google)
- [ ] **Spaces:** Real basic enter, subscribe members, set location, get-all locations.
  - [ ] Test multi-client collaboration scenarios
  - [ ] Test spatial data consistency across clients
- [ ] **Rooms (Chat):** Real enter presence, send message, subscribe messages.
  - [ ] Test chat message delivery and ordering
  - [ ] Test persistent history across sessions
- [ ] **Benchmarking:** Real publisher/subscriber run against Ably app.
  - [ ] Test with various message sizes and rates
  - [ ] Measure real-world performance metrics
- [ ] **Web Example:** Test the web terminal interface with real commands.
  - [ ] Test terminal rendering and command execution
  - [ ] Test session timeout and reconnection
- [ ] **Environment Overrides:** Test `--host`, `--env`, `--control-host` flags override endpoints
