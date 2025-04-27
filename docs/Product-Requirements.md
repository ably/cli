# Product Requirements Document: Ably CLI

## 1. Overview

The Ably CLI enables developers to integrate, test, and debug Ably's product features directly from the command line. It also allows managing Ably apps and accounts via the Control API.

## 2. Objective

Provide an intuitive CLI for developers to interact with Ably APIs and SDKs, aiding discovery, initial development, and production use. The CLI should be easily extensible for new product features and persist authentication credentials securely.

## 3. Target Audience

- Software developers using Ably.
- DevOps engineers managing Ably resources.

## 4. Control Plane vs. Data Plane

- **Control Plane**: Manages configuration, administration, setup, and lifecycle of apps, resources, and accounts via the Ably dashboard and Control API (<https://ably.com/docs/api/control-api>).
- **Data Plane**: Handles core product functionality (Pub/Sub, Chat, Spaces) via SDKs and REST APIs (<https://ably.com/docs>).

## 5. Key Features & Functional Requirements

### 5.1. Command Hierarchy

The CLI uses topics (space-separated) to group related commands logically.

*Note: The `topicSeparator` configured for oclif is a space (` `). All commands must respect this configuration.*

**Account Management (`ably accounts`)**
*(Requires Control API access token)*

- `$ ably login [TOKEN]`: Alias for `ably accounts login`. Logs in or prompts for token.
- `$ ably accounts login [TOKEN]`: Authenticates the user with a Control API access token, storing it in the local config. Supports `--alias` for multiple accounts.
- `$ ably accounts list`: Lists locally configured accounts (aliases, token details, user info, account details).
- `$ ably accounts logout [ALIAS]`: Removes the access token and associated data for the specified (or default) account after warning.
- `$ ably accounts current`: Shows the currently selected account (alias or `default`) and verifies the token against the Control API `/me` endpoint.
- `$ ably accounts stats`: Views account stats. Supports `--live` for polling key metrics (peak connections, channels, message throughput, etc.).
- `$ ably accounts switch [ALIAS]`: Switches the active account configuration to the specified alias or prompts for selection.

**App Management (`ably apps`)**
*(Requires Control API access token; operations scoped to the current or specified app)*

- `$ ably apps list`: Lists all apps available in the current account.
- `$ ably apps create`: Creates a new app. Requires `--name`. Supports `--tls-only`.
- `$ ably apps update ID`: Updates the app specified by `ID`. Supports `--name`, `--tls-only`.
- `$ ably apps delete [ID]`: Deletes the specified (or current) app after confirmation. Supports `--force`.
- `$ ably apps set-apns-p12 ID`: Uploads an APNS P12 certificate for the specified app `ID`. Requires `--certificate`. Supports `--password`, `--use-for-sandbox`.
- `$ ably apps stats [ID]`: Views app stats for the specified (or current) app. Supports `--live` polling, `--unit`, `--start`, `--end`, `--limit`.
- `$ ably apps switch [APPID]`: Switches the active app configuration to the specified App ID or prompts for selection.
- `$ ably apps current`: Shows the currently selected app configuration.
- `$ ably apps logs subscribe`: Alias for `ably logs app subscribe`.
- `$ ably apps logs history`: Alias for `ably logs app history`.

**Channel Rules (`ably apps channel-rules`)**
*(Manage Ably channel rules/namespaces via Control API)*

- `$ ably apps channel-rules list`: Lists all channel rules for the current/specified app.
- `$ ably apps channel-rules create`: Creates a channel rule. Requires `--name`. Supports various flags like `--persisted`, `--push-enabled`, etc.
- `$ ably apps channel-rules update NAMEORID`: Updates a channel rule specified by name or ID. Supports various flags.
- `$ ably apps channel-rules delete NAMEORID`: Deletes a channel rule specified by name or ID after confirmation. Supports `--force`.

**Authentication & Authorization (`ably auth`)**
*(Manage data plane auth: API Keys, Tokens)*

- `$ ably auth issue-jwt-token`: Creates an Ably JWT token. Supports `--capability`, `--ttl`, `--client-id`, `--token-only`.
- `$ ably auth issue-ably-token`: Creates an Ably Token. Supports `--capability`, `--ttl`, `--client-id`, `--token-only`.
- `$ ably auth revoke-token TOKEN`: Revokes a specific Ably Token or JWT. Supports revoking by `--client-id`.

**API Key Management (`ably auth keys`)**
*(Manage API keys via Control API)*

- `$ ably auth keys list`: Lists all API keys for the current/specified app.
- `$ ably auth keys create`: Creates a new API key. Requires `--name`. Supports `--capabilities`.
- `$ ably auth keys get KEYNAMEORVALUE`: Shows details for a specific API key (using `APP_ID.KEY_ID` format or full key value).
- `$ ably auth keys update KEYNAME`: Updates properties (name, capabilities) of an API key (using `APP_ID.KEY_ID` format).
- `$ ably auth keys revoke KEYNAME`: Revokes an API key (using `APP_ID.KEY_ID` format) after confirmation. Supports `--force`.
- `$ ably auth keys switch [KEYNAMEORVALUE]`: Sets the default API key for the current app in the local config. Prompts if no key specified.
- `$ ably auth keys current`: Shows the currently configured API key for the selected app.

**Pub/Sub Channels (`ably channels`)**
*(Interact with Ably Pub/Sub using the Realtime SDK)*

- `$ ably channels list`: Lists active channels via channel enumeration API. Supports `--prefix`, `--limit`.
- `$ ably channels publish CHANNEL MESSAGE`: Publishes a message. Supports `--name`, `--encoding`, `--count`, `--delay`, JSON/text message, message interpolation (`{{.Count}}`, `{{.Timestamp}}`), `--transport rest|realtime`.
- `$ ably channels batch-publish [MESSAGE]`: Publishes multiple messages via REST batch API. Supports `--channels`, `--channels-json`, `--spec`.
- `$ ably channels subscribe CHANNELS...`: Subscribes to messages on one or more channels. Supports `--rewind`, `--delta`, `--cipher-*` flags for decryption. Runs until terminated.
- `$ ably channels history CHANNEL`: Retrieves message history. Supports `--start`, `--end`, `--limit`, `--direction`, `--cipher` flags.
- `$ ably channels logs [TOPIC]`: Alias for `ably logs channel-lifecycle subscribe`. (Currently only supports `channel-lifecycle`).
- `$ ably channels occupancy get CHANNEL`: Gets current occupancy metrics for a channel.
- `$ ably channels occupancy subscribe CHANNEL`: Subscribes to live occupancy metrics using the meta channel. Runs until terminated.
- `$ ably channels presence enter CHANNEL`: Enters presence and stays present. Supports `--data`, `--show-others`. Runs until terminated.
- `$ ably channels presence subscribe CHANNEL`: Subscribes to presence events (joins, leaves, updates). Runs until terminated.

**Connections (`ably connections`)**
*(Interact with Pub/Sub connections)*

- `$ ably connections stats`: Shows connection stats (similar to `ably apps stats` but connection-focused). Supports `--live`.
- `$ ably connections test`: Performs a simple connection test. Supports transport options.
- `$ ably connections logs [TOPIC]`: Alias for `ably logs connection-lifecycle subscribe`. (Currently only supports `connection-lifecycle`).

**Chat Rooms (`ably rooms`)**
*(Interact with Ably Chat using the Chat SDK)*

- `$ ably rooms list`: Lists chat rooms (filters channel enumeration).
- `$ ably rooms messages send ROOMID TEXT`: Sends a chat message. Supports `--count`, `--delay`, interpolation.
- `$ ably rooms messages subscribe ROOMID`: Subscribes to chat messages. Runs until terminated.
- `$ ably rooms messages get ROOMID`: Gets historical chat messages.
- `$ ably rooms occupancy get ROOMID`: Gets current occupancy for a room.
- `$ ably rooms occupancy subscribe ROOMID`: Subscribes to live room occupancy. Runs until terminated.
- `$ ably rooms presence enter ROOMID`: Enters presence in a room and stays present. Runs until terminated.
- `$ ably rooms presence subscribe ROOMID`: Subscribes to room presence events. Runs until terminated.
- `$ ably rooms reactions send ROOMID MESSAGEID EMOJI`: Sends a message reaction.
- `$ ably rooms reactions subscribe ROOMID`: Subscribes to message reactions. Runs until terminated.
- `$ ably rooms typing start ROOMID`: Starts sending typing indicators. Runs until terminated.
- `$ ably rooms typing subscribe ROOMID`: Subscribes to typing indicators. Runs until terminated.

**Spaces (`ably spaces`)**
*(Interact with Ably Spaces using the Spaces SDK)*

- `$ ably spaces list`: Lists Spaces (filters channel enumeration).
- `$ ably spaces members enter SPACEID`: Enters a Space and stays present. Runs until terminated.
- `$ ably spaces members subscribe SPACEID`: Subscribes to Space member events (enter, leave, update). Runs until terminated.
- `$ ably spaces locations set SPACEID`: Sets own location and stays updated. Shows other location changes. Runs until terminated. Supports position arguments.
- `$ ably spaces locations subscribe SPACEID`: Subscribes to location updates for all members. Runs until terminated.
- `$ ably spaces locations get-all SPACEID`: Gets current locations for all members and exits.
- `$ ably spaces cursors set SPACEID`: Sets own cursor position. Simulates movement if no position given. Runs until terminated. Supports position arguments.
- `$ ably spaces cursors subscribe SPACEID`: Subscribes to cursor position updates. Uses color coding for changes. Runs until terminated.
- `$ ably spaces cursors get-all SPACEID`: Gets current cursor positions for all members and exits.
- `$ ably spaces locks acquire SPACEID LOCKID`: Acquires a lock and holds it. Shows other lock changes. Runs until terminated.
- `$ ably spaces locks get SPACEID LOCKID`: Checks if a specific lock exists and shows details.
- `$ ably spaces locks get-all SPACEID`: Gets all current locks and exits.
- `$ ably spaces locks subscribe SPACEID`: Subscribes to lock status updates. Uses color coding for changes. Runs until terminated.

**Logging (`ably logs`)**
*(Stream and retrieve logs from meta channels)*

- `$ ably logs app subscribe`: Streams logs from `[meta]log`. Supports `--rewind`.
- `$ ably logs app history`: Retrieves historical logs from `[meta]log`. Supports `--limit`, `--direction`.
- `$ ably logs channel-lifecycle subscribe`: Streams logs from `[meta]channel.lifecycle`.
- `$ ably logs connection-lifecycle subscribe`: Streams logs from `[meta]connection.lifecycle`.
- `$ ably logs connection-lifecycle history`: Retrieves historical connection logs. Supports `--limit`, `--direction`.
- `$ ably logs connection subscribe`: Streams logs from `[meta]connection`. Supports `--rewind`.
- `$ ably logs push subscribe`: Streams logs from `[meta]log:push`. Supports `--rewind`.
- `$ ably logs push history`: Retrieves historical push logs from `[meta]log:push`. Supports `--limit`, `--direction`.

**Integrations (`ably integrations`)**
*(Manage Ably integrations/rules via Control API)*

- `$ ably integrations list`: Lists all integration rules for the current/specified app.
- `$ ably integrations create`: Creates an integration rule. Requires various flags depending on rule type.
- `$ ably integrations get RULEID`: Shows details for a specific integration rule.
- `$ ably integrations update RULEID`: Updates an integration rule. Supports various flags.
- `$ ably integrations delete RULEID`: Deletes an integration rule after confirmation. Supports `--force`.

**Queues (`ably queues`)**
*(Manage Ably Queues via Control API)*

- `$ ably queues list`: Lists all queues for the current/specified app.
- `$ ably queues create`: Creates a queue. Requires various flags.
- `$ ably queues delete QUEUENAME`: Deletes a queue after confirmation. Supports `--force`.

**Benchmarking (`ably bench`)**
*(Run benchmark tests)*

- `$ ably bench publisher CHANNEL`: Starts a publisher test. Measures latency, throughput. Waits for subscribers if `--wait-for-subscribers` is used. Shows progress UI. Supports `--messages`, `--rate`, `--message-size`, `--transport rest|realtime`.
- `$ ably bench subscriber CHANNEL`: Starts a subscriber test. Waits for publisher, measures latency, message count. Shows progress UI. Runs until publisher finishes, then waits for next test.

**Help & Info (`ably help`)**

- `$ ably help ask QUESTION`: Sends a question to the Ably AI Help agent via Control API. Shows "Thinking..." animation. Displays answer and links. Supports `--continue` for follow-up questions, storing conversation context locally.
- `$ ably help contact`: Opens <https://ably.com/contact> in the browser.
- `$ ably help support`: Opens <https://ably.com/support> in the browser.
- `$ ably help status`: Checks Ably service status via <https://ably.com/status/up.json> and directs user to <https://status.ably.com>.
- `$ ably --version`: Shows the CLI version.
- `$ ably [topic]`: If a topic is called without a command, it shows available sub-commands, descriptions, and examples.
- `$ ably [command] --help`: Shows detailed help for a specific command.

**Configuration (`ably config`)**

- `$ ably config`: Opens the local config file (`~/.ably/config`) in the default text editor. Supports `--editor`.

**MCP Server (`ably mcp`)**

- `$ ably mcp start-server`: Starts the CLI in Model Context Protocol (MCP) server mode.

### 5.2. Authentication

Two types:
1.  **Control Plane (User Level)**: Uses Control API access tokens obtained from <https://ably.com/users/access_tokens>. Scoped to one user and one account. Managed via `ably accounts` commands.
2.  **Data Plane (App Level)**: Uses API keys or Ably Tokens/JWTs. Scoped to a single app. Managed via `ably auth` commands. The CLI prioritizes credentials in this order:
    *   Command-line flags (`--api-key`, `--token`, `--access-token`).
    *   Environment variables (`ABLY_API_KEY`, `ABLY_TOKEN`, `ABLY_ACCESS_TOKEN`).
    *   Locally stored configuration (`~/.ably/config`) for the current app/account.

**Convenience Workflow:**
If a data plane command is run without explicit auth flags/env vars and no app/key is configured locally:
- If logged in (`ably accounts login` done), the CLI prompts the user to select an app from their account.
- Then, it prompts the user to select an API key for that app.
- The selected app ID and API key are stored in the local config for future use with that app under the current account profile.

**Login Flow (`ably accounts login`):**
- Displays Ably ASCII art.
- Prompts user to press Enter to open <https://ably.com/users/access_tokens> in browser (unless `--no-browser`).
- Prompts user to paste the obtained token.
- Prompts for an optional alias (`--alias`) to store the account credentials. If no alias, updates the `default` account profile.

### 5.3. Configuration (`~/.ably/config`)

- Stored in TOML format at `~/.ably/config`.
- File permissions should be secured (e.g., `600`).
- Stores Control API access tokens (potentially multiple, identified by `default` or alias).
- Stores the currently active account alias.
- For each account profile, stores the currently active app ID.
- For each account profile, stores a mapping of app IDs to their last used API key.
- `ably config` command opens this file.

### 5.4. Global Arguments

- `--host <value>`: Overrides the default REST/Realtime host for Data Plane SDK calls.
- `--env <value>`: Overrides the default environment (e.g., `production`) for Data Plane SDK calls.
- `--control-host <value>`: Overrides the default Control API host (`control.ably.net`).
- `--access-token <value>`: Overrides any configured Control API access token.
- `--api-key <value>`: Overrides any configured Data Plane API key.
- `--token <value>`: Authenticates Data Plane calls using an Ably Token or JWT instead of an API key.
- `--client-id <value>`: Overrides the default client ID (`ably-cli-<8_random_chars>`) for Data Plane operations when using API key auth. Use `"none"` to disable sending a client ID. Not applicable for token auth.
- `--json`: Outputs results as raw, machine-readable JSON. Suppresses status messages and non-essential logs. Errors are output as JSON.
- `--pretty-json`: Outputs results as formatted, colorized JSON for human readability. Suppresses status messages. Errors are output as JSON.
- `--verbose` (`-v`): Outputs additional status/log events (e.g., connection state changes). Formatted as JSON when used with `--json` or `--pretty-json`.

### 5.5. Usability & Developer Experience

- Helpful inline documentation (`--help`).
- Autocompletion support for bash/zsh.
- Friendly, descriptive error messages with troubleshooting hints.
- Interactive prompts for confirmations (e.g., delete) and selections (e.g., switching accounts/apps without args).
- Use of console UI elements for better visualization (e.g., progress bars in `bench`, tables, status indicators).
- Did-you-mean suggestions for mistyped commands.
- Topic commands (`ably accounts`, `ably apps`, etc.) list sub-commands when called directly.

### 5.6. Embeddable Web Example & React Component

*(This section describes a feature allowing the CLI to run in a browser)*

- **React Component (`@ably/react-cli-terminal` - hypothetical name)**:
    - Embeddable component using Xterm.js (<https://xtermjs.org/>).
    - Connects via WebSocket to a dedicated Terminal Server.
    - Requires `controlAccessToken` and `apiKey` props passed during initialization. These map to `ABLY_ACCESS_TOKEN` and `ABLY_API_KEY` environment variables within the container.
- **Terminal Server**:
    - Listens for WebSocket connections.
    - On connection, spawns a new Docker container running the Ably CLI.
    - Proxies WebSocket stream to the container's stdin/stdout.
    - Terminates Docker container on WebSocket disconnect or after timeout (e.g., 30 mins).
    - Limits concurrent sessions.
    - Includes security measures (see [docker/README.md](../docker/README.md)).
- **Docker Container**:
    - Based on `node:22-alpine` (or similar).
    - Installs `@ably/cli`.
    - Environment variables `ABLY_ACCESS_TOKEN` and `ABLY_API_KEY` must be set and validated on startup.
    - Restricts execution to only the `ably` command for security.
    - Sets an environment variable (e.g., `ABLY_CLI_MODE=web`) to indicate web context.
- **Web CLI Mode Restrictions**:
    - The CLI detects `ABLY_CLI_MODE=web`.
    - Disables commands related to local configuration and switching credentials:
        - `ably accounts login`: Error message (already logged in).
        - `ably accounts list`: Error message (use dashboard).
        - `ably accounts logout`: Error message (cannot log out).
        - `ably accounts switch`: Error message (use dashboard).
        - `ably apps switch`: Error message (use dashboard).
        - `ably auth keys switch`: Error message (use web interface).
        - `ably config`: Error message (no local config).
    - Adapts commands relying on local config:
        - `ably accounts current`: Uses `/me` Control API endpoint based on provided token.
        - `ably apps current`: Uses app ID from `ABLY_API_KEY` and calls Control API for details.
- **Demo Web Example (`/example/web-cli`)**:
    - Simple Vite-based example showing how to use the React component.
    - Reads `ABLY_ACCESS_TOKEN` and `ABLY_API_KEY` from `.env` file or environment.
    - Includes usage instructions in `README.md`.

### 5.7. Model Context Protocol (MCP) Server

*(This section describes running the CLI as an MCP server for AI tools)*

- **Activation**: Run `$ ably mcp start-server`.
- **Technology**: Uses `@modelcontextprotocol/typescript-sdk` in file mode.
- **Authentication**: Relies on environment variables:
    - `ABLY_ACCESS_TOKEN`: Control API token.
    - `ABLY_API_KEY`: Data Plane key.
    - `ABLY_CLIENT_ID`: Optional client ID override (defaults to `ably-mcp-<random>`).
    - `ABLY_CONTROL_HOST`: Optional Control API host override.
    - `ABLY_HOST`: Optional Data Plane host override.
    - `ABLY_ENVIRONMENT`: Optional Data Plane environment override.
- **Behavior**:
    - Disables all interactive prompts.
    - Sets a maximum execution time per request (e.g., 15 seconds). Long-running commands like `subscribe` will run for this duration then exit gracefully.
    - Uses a distinct client ID prefix (`ably-mcp-`).
- **Available MCP Commands (Subset of CLI)**:
    - `ably apps list`
    - `ably apps stats`
    - `ably auth keys list`
    - `ably channels history`
    - `ably channels publish`
    - `ably channels list`
    - `ably channels presence get` (*Note: README has `ably channels presence subscribe` and `enter`, but not `get`. PRD lists `get` but not here. Assuming `get` is intended for MCP based on non-streaming nature.*)

## 6. Technical Requirements

- **Platforms**: Linux, macOS, Windows.
- **Technology**: Node.js, TypeScript, oclif framework (<https://oclif.io/>).
- **Distribution**: npm (`@ably/cli`), Homebrew, standalone executables.
- **Dependencies**: Use `pnpm`. Use SDKs (`ably-js`, `ably-chat-js`, `ably-spaces-js`) for data plane; direct HTTPS for Control API. Use JWT library for token generation.

## 7. Testing Requirements

- Unit, integration, and end-to-end tests are required.
- Data plane operations should ideally have E2E tests.
- Control API interactions can be mocked (based on OpenAPI spec).
- See [Testing Strategy](Testing.md) for strategy.

## 8. API Dependencies

- **Control API**: Used for account/app management. See <https://ably.com/docs/api/control-api> and OpenAPI spec. Requires Control API access token.
- **Ably SDKs**:
    - **Pub/Sub**: Use `ably-js` (<https://github.com/ably/ably-js>). Use `request()` method for REST calls not covered by SDK methods.
    - **Chat**: Use `ably-chat-js` (link TBC). Use underlying `ably-js` `request()` if needed.
    - **Spaces**: Use `ably-spaces-js` (link TBC). Use underlying `ably-js` `request()` if needed.
- **JWT Library**: For generating Ably JWTs (`ably auth issue-jwt-token`).

## 9. Usage Examples (Illustrative)

```sh
# Log in (interactive or provide token)
ably login

# List apps in the current account
ably apps list

# Publish a message to a channel for the current/specified app
ably channels publish my-channel '{"greeting":"Hello"}' --name update

# Subscribe to messages (runs until stopped)
ably channels subscribe my-channel --app "My Specific App"

# Switch active account config
ably accounts switch my-work-alias

# Ask the AI helper a question
ably help ask "How do I use channel history?"
```

## 10. Ably AI Agent (`ably help ask`)

- Uses Control API endpoint `/v1/help`.
- POST request with `{"question": "user question"}`.
- If `--continue` flag is used, sends previous Q&A context along with the new question.
- Displays "Thinking..." animation while waiting.
- Renders Markdown answer and lists source links.
- Stores last Q&A locally for `--continue`. New question without flag resets context.
