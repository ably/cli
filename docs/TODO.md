# Tasks

## Features

- [ ] Support auto-complete for commands
- [ ] Support auto-update
- [ ] Web example should tell the user to install the CLI locally if there are connection issues / CLI has not loaded
- [ ] Web example should support non logged in mode (i.e. for docs for example) where commands that rely on the control API, or channel enumeration (surfacing other user activity) are disabled. The user should be told that this functionality is not available to anonymous users and they should sign up / login.
- [ ] Connection handling of Web CLI no longer seems to show the connecting state and number of attempts correctly.
- [ ] When an API key or Access Token fails with a 40x error, it should show the error message without a stack trace, and should tell the user to reauth appropriately i.e. using `ably login` for access tokens, or `ably auth keys switch` for API keys. Here is the error message from an access token that failed:
  ```sh
  $ ably apps stats
  ›   Error: No app ID provided and no default app selected. Please specify an app ID or select a default app with "ably apps
  ›   switch".
  $ ably apps switch
  Select an app to switch to:
  Error fetching apps: Error: Control API request failed: 401 Unauthorized - {"message":"Access denied","code":40100,"statusCode":401,"href":"https://help.ably.io/error/40100","details":null}
  ```
- [ ] Ensure `ably account current`, `ably apps current`, and `ably auth keys current` commands exist consisetntly so that the user can see which account, app, and key are currently being used. Additionally, if `ably accounts switch` is called, and the user has not logged in yet, instead of showing the error "Error: No accounts configured. Use "ably accounts login" to add an account.", simply go proxy the request to `ably accounts login`.

## UI/UX Improvements

- [ ] The CLI should standardise on how commands are shown when running the topic such as `ably accounts` where all sub-commands are shown, and only when `--help` is used examples are shown along with all commands.
  - [ ] Note the examples are generally spaced out vertically with a blank line between each, we should be consistent in keeping the vertical spacing concise and remove unnecessary white space.
  - [ ] All CLI commands should be listed in the index.ts files for each topic, and whenever a new command is added, the index.ts file for that topic should be updated.
  - [ ] The output for each empty topic, such as `ably spaces`, should be consistent in format, with the title "Ably [Topic] commands:", then a list of all the commands available, and then provide a comment beneath stating "Run `ably [Topic] COMMAND --help` for more information on a command."
  - [ ] Much like we do for the root help in createCustomWelcomeScreen in help.ts, we should autogenerate this to avoid unnecessary maintenance of the help for the root topics.
  - [ ] Additionally, when the command with --help is run for each command, the auto-generated output should also be colour coded to make it more legible (is this a job for standard oclif themes), and the examples listed should not have vertical space between each one like they currently are.
- [ ] The terminal interface resizes vertically as expected, however the bottom line of the terminal is often partially cropped as a result of it expanding by a few pixels, which appears to add a text line to the terminal, but there is not enough vertical space to show it. As such, the terminal is sort of broken once full as the bottom line is always cropped. Can you ensure that a complete line of text is always visible at the bottom of the terminal.

## Security

- [x] The Docker web terminal restrictions on what commands can be run is pretty poor as you can use & or | operators to simply get around this. For example, running `$ ably > /dev/null | echo "Hello"` returns "Hello", showing that the user can run additional commands.
- [x] Implement read-only filesystem with controlled write access for Docker containers
  - [x] Make the root filesystem read-only using `ReadonlyRootfs: true`
  - [x] Add tmpfs mounts for necessary writable directories with noexec flag
  - [x] Create a dedicated volume for the `~/.ably` config directory
- [x] Add resource limits to Docker containers
  - [x] Set process limits using `PidsLimit`
  - [x] Configure memory limits to prevent resource exhaustion
  - [x] Add CPU quotas to prevent CPU abuse
- [x] Enhance session management with timeouts
  - [x] Add inactivity timeout for terminal sessions
  - [x] Implement maximum session duration limits
  - [x] Ensure proper notification to users before session termination
- [x] Enhance network security for containers
  - [x] Create a restricted network with controlled egress to Ably endpoints only
  - [x] Explicitly block raw socket access
  - [x] Verify that the container drops all unnecessary capabilities
- [x] Implement Docker user namespace remapping for additional isolation
  - [x] Configure Docker daemon for user namespace remapping
  - [x] Ensure container runs with correct mapped user
- [x] Create and apply custom seccomp profile for system call filtering
  - [x] Develop a seccomp profile that allows only necessary syscalls
  - [x] Test and apply the profile to containers
- [x] Implement AppArmor profile for mandatory access control
  - [x] Develop an AppArmor profile with strict filesystem access controls
  - [x] Allow execution only of required binaries
  - [x] Test and apply the profile to containers
- [x] Set up enhanced logging and monitoring for security events
  - [x] Configure logging for blocked syscalls and AppArmor violations
  - [x] Implement monitoring for container resource usage
  - [x] Create alerting for potential security breaches
- [x] Create security testing and audit procedures (See `docs/Security-Testing-Auditing.md`)
- [x] Develop automated tests for container security configuration (Outlined in `docs/Security-Testing-Auditing.md`)
- [x] Create regular security audit workflow (Outlined in `docs/Security-Testing-Auditing.md`)
- [x] Document security hardening measures for future reference (See `docs/Security-Hardening.md` and `docs/Security-Testing-Auditing.md`)

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

- [ ] Document the folder structures and place this in a markdown file. Instruct local IDE to maintain this file.
- [ ] Ensure all changes meet the linting requirements, `pnpm exec eslint [file]`
- [ ] Look for areas of unnecessary duplication as help.ts checking "commandId.includes('accounts login')" when the list of unsupported web CLI commands exists already in BaseCommand WEB_CLI_RESTRICTED_COMMANDS
- [ ] Add inactivity timeout to the terminal server
- [ ] Build binaries and embed into the Docker image which should be published to Docker Hub.
- [ ] Release new versions automatically from Github for NPM
- [ ] Now that we have .editorconfig, ensure all files adhere in one commit
- [ ] We are using a PNPM workspace, but I am not convinced that's a good thing. We should consider not letting the examples or React component dependencies affect the core CLI packaging.
- [ ] Publish Docker image to Github registry and use a path such as `ghcr.io/ably/ably-cli-sandbox` for the published artefact. Building and publishing should use the locally built Ably CLI binary as opposed to the latest version so that local changes can be tested locally.

## Bugs

- [ ] Running `pnpm test [filepath]` does not run the test file only, it runs all tests. The docs state this works so needs fixing.

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
    - [ ] Test encryption flag (`--cipher`) produces encrypted messages and proper decryption
    - [ ] publish / subscribe / batch-publish plus --delay unit testing
  - [ ] `channels presence enter/subscribe`: Mock SDK, flag handling, output formats, SIGINT handling.
    - [ ] Test presence data handling (clientId, data payloads)
    - [ ] Test presence filtering by clientId
  - [ ] `channels occupancy get/subscribe`: Mock SDK, flag handling, output formats, SIGINT handling.
    - [ ] Test occupancy metrics parsing and formatting
    - [ ] Test live updates with simulated changes
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
  - [ ] Test WebSocket connection handling
  - [ ] Test command restriction enforcement
  - [ ] Test environment variable passing
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
  - [ ] Test that presence state is correctly maintained
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
  - [ ] Test WebSocket connection handling
  - [ ] Test command restriction enforcement
  - [ ] Test environment variable passing
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
