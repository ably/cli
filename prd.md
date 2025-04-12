# Product Requirements Document: Ably CLI

## Overview

The Ably CLI will enable developers to easily integrate, test and debug Ably's product features directly from the command line. 
In addition, via the Control API, it will enable developers to provision and configure their apps and accounts.

## Objective

Provide an intuitive CLI that helps developers interact with Ably product APIs and SDKs.
Developers should be able to discover features of the product through the CLI, and use the CLI as part of their getting started experience, development of their initial apps and later in production.
The CLI should be straightforward and easily extensible to ensure product teams can add features to the CLI as soon as they available in the relevant product's Javascript SDK. 
The CLI should persist authentication tokens and API keys so that commands can easily be executed without explicitly passing in API keys to every call.

## Target Audience

- Software developers using Ably to build realtime features
- DevOps engineers managing Ably resources and deployments

## CLI for both the control and data planes

The CLI is intended for us with both our control plane as well as our data plane. We define these as follows:

*Control Plane* is used to inspect and manage the configuration, administration, setup, and lifecycle of apps, resources and accounts. 
The Control Plane is available as part of the Ably logged in dashboards and also via our *Control API*.
The Control Plane is shared between all products and is considered a platform capability as opposed to a specific product capability.
The documentation for this API is available at https://ably.com/docs/api/control-api and https://github.com/ably/docs/blob/main/static/open-specs/control-v1.yaml. 

*Data Plane* handles the core product functionality, runtime operations, data processing, and user interactions—typically exposed through our SDKs but also through raw REST APIs.
Each of our products has its own unique data plane, be that in the form of an SDK or additionally unique REST endpoints.
The documentation for each product is available at https://ably.com/docs.

## Key Features & Functional Requirements

### CLI command hierarchy

We are committed to delivering a great developer experience, and our CLI is no exception. 
As such, the interface and information architecture of the topics and commands offered by the CLI are critical to delivering an intuitive, simple and delightful experience for developers.
In the proposed CLI interface below, we use topics to group or nest commands that are conceptuallyu related together, whilst 
ensuring each command has an intuitive name that ensures a developer can discover the features of the CLI without reverting to documentation.

Below is the proposed information architecture / interface for the CLI, which maps to the conceptual concepts of the Ably platform and products.

# The following commands are scoped to the account and depend on the control API access token for authentication

$ ably login -> proxy convenience to $ ably accounts login
$ ably accounts login -> this command will take the user through the authentication process, and then persist the access token in the local config which will be used by default for all subsequent commands that depend on the control API. When logging in, if no alias is provided, the default account token is overwritten. If an alias is provided, an additional token is stored in the config indexed by that alias name.
$ ably accounts list -> list all the accounts already configured in the local config indexed by their alias name (unless `default`), which includes the the token ID, capabilities, user email, and account ID and name.
$ ably accounts logout -> will warn the user that this is descructive and all configuration for this account will be deleted. If executed, this will remove the access token and any associated data from the local config file.
$ ably accounts current -> confirms which account is currently selected (including the assigned alias name unless `default`) and makes a call to the control API https://control.ably.net/v1/me endpoint to confirm the token is valid and confirm the account details
$ ably accounts stats -> view account stats, with a --live option which polls every 6 seconds and returns key metrics such as peak connections, channels, message throughput, and cumulative messages sent etc.
$ ably accounts switch -> switch to the provided account ID or account alias

$ ably auth -> Topic that houses all product authentication commands (those used to access the data planes of those products).

# The following commands are all scoped to an app, so if there is not a default app in the config, the --app [name OR ID] argument is required, or a key or token must be provided as an argument

$ ably auth issue-jwt-token -> Creates an Ably JWT, which is the preferred approach for tokens. Capabilities and other token options can be specified. (see https://ably.com/docs/auth/token and https://ably.com/docs/auth/capabilities)
$ ably auth issue-ably-token -> Creates an Ably Token. Capabilities and other token options can be specified (see https://ably.com/docs/auth/token and https://ably.com/docs/auth/capabilities)
$ ably auth revoke-token [token] -> Revokes the token provided (see https://ably.com/docs/auth/revocation)
$ ably auth keys -> This is a sub-topic for key management
$ ably auth keys list -> list all keys in the app (uses the Control API)
$ ably auth keys revoke [key identifier or complete key] -> revoke a key in the app (uses the Control API)
$ ably auth keys get [key identifier or complete key] -> view all the details for a key (uses the Control API)
$ ably auth keys update [key identifier or complete key] -> update properties of the key such as capabilities and the name
$ ably auth keys switch [key identifier or complete key] -> switch to this key for all client requests for this app. This API key will be stored in the config for the currently selected app.
$ ably auth keys current -> Show the current key if one is configured for this app in the config. Note that for each app only one key can be configured, but switching between apps will remember the last configured key for the app if used before.

$ ably apps -> Topic for manage apps
$ ably apps list -> list all apps available 
$ ably apps create -> create a new app 
$ ably apps update -> update the current app or named app from the --app argument 
$ ably apps delete -> delete the app following confirmation by the user in the CLI
$ ably apps set-apns-p12 -> allow a user to upload a P12 cert for use with APNS
$ ably apps stats -> view app stats, with a --live option which polls every 6 seconds and returns key metrics such as peak connections, channels, message throughput, and cumulative messages sent etc.
$ ably apps switch -> switch to this app for all subsequent requests
$ ably apps current -> Show the current app if one is configured for the account.
$ ably apps logs subscribe -> proxy for ably logs apps subscribe
$ ably apps logs history -> proxy for ably logs apps history
$ ably apps channel-rules -> Manage Ably channel rules (named namespaces in the Control API)
$ ably apps channel-rules list -> list all channel rules
$ ably apps channel-rules create -> create a channel rule
$ ably apps channel-rules update -> update a channel rule
$ ably apps channel-rules delete -> delete a channel rule (prompt for interactive confirmation)

$ ably channels -> Topic for Ably Pub/Sub channels
$ ably channels list -> use the channel enumeration API to return a list of live channels
$ ably channels publish -> publish a message to a channel with optional support for encryption. Support --count and --delay arguments to send multiple messages, with interpolation for `{{.Count}}` and `{{.Timestamp}}` in the message argument.
$ ably channels batch-publish -> use the REST batch publish API to publish a batch of messages
$ ably channels subscribe -> subscribe to messages published on one or more provided channels. Support for encryption, deltas, and rewind are available as arguments. Stay subscribed until terminated.
$ ably channels occupancy -> returns the occupany on a channel, with a --live option to subscribe to occupancy ongoing using the meta occupancy channel
$ ably channels history -> provides access to historical messages on a channel
$ ably channels presence -> this is a topic that groups presence functionality together
$ ably channels presence enter -> enter presence and remain present until the script is terminated. Show who is entering and leaving whilst present,
$ ably channels presence subscribe -> show the complete list of members present, then show events of who is entering or leaving, until the script is terminated.
$ ably channels logs channel-lifecycle -> set up as an alias to ably logs channel-lifecycle

$ ably config -> opens the config TOML file with the default text editor 

$ ably connections logs connections-lifecycle -> set up as an alias to ably logs connection-lifecycle
$ ably connections stats -> this is largely a duplication of ably app stats, however it is focussed on connection stats only. This should also support the --live option.
$ ably connections test -> simply connects to Ably, confirms that the conenction was established, and closes the connection. Allows transport params options so that WebSockets can be disabled for example, and only HTTP is used, or only WebSockets is used without HTTP support.

$ ably rooms -> Topic for Ably Chat
$ ably rooms list -> list chat rooms using the channel enumeration API, filtering out those that are not chat
$ ably rooms messages send -> send a chat message. Support --count and --delay arguments to send multiple messages, with interpolation for `{{.Count}}` and `{{.Timestamp}}` in the message argument.
$ ably rooms messages subscribe -> subscribe to chat messages
$ ably rooms messages get -> get historical messages
$ ably rooms occupancy -> returns the occupany on a channel, with a --live option to subscribe to occupancy ongoing using the meta occupancy channel
$ ably rooms presence subscribe -> show the complete list of members present, then show events of who is entering or leaving, until the script is terminated.
$ ably rooms presence enter -> enter a room and remain present until the script is terminated. Show who is entering and leaving whilst present,
$ ably rooms reactions subscribe -> subscribe to room reactions
$ ably rooms reactions send -> send a room reaction
$ ably rooms typing subscribe -> subscribe to typing indicators and show who is typing and stops typing in realtime
$ ably rooms typing start -> start typing, and remain typing until the CLI is terminated

$ ably spaces -> Topic for Ably Spaces
$ ably spaces list -> list Spaces using the channel enumeration API, filtering out those that are not chat
$ ably spaces members subscribe -> show the complete list of members present, then show events of who is entering or leaving, until the script is terminated.
$ ably spaces members enter -> enter a space and remain present until the script is terminated. Show who is entering and leaving whilst present.
$ ably spaces locations set -> allow a location to be set, and remain at this location until the script is terminated. Show other location changes whilst the script is running.
$ ably spaces locations subscribe -> subcribe to the set of locations, show all locations, and then show location changes as they happen
$ ably spaces locations get-all -> show all current locations for a space and then exit
$ ably spaces cursors set -> allows a specific x and y location to be set, but if not position is set, then the client will simulate movements of a mouse moving periodically.
$ ably spaces cursors subscribe -> show a table of all cursors and their positions, and show changes as they happen. Use colour coding to show when changes have been made, and after 2s revert back to the default colour.
$ ably spaces cursors get-all -> retrieve all current cursors, show the details, and exit.
$ ably spaces locks acquire -> acquire a lock for the provided ID, and keep that lock until the script is terminated. Show any other changes to locks whilst the script is running.
$ ably spaces locks subscribe -> show a table of all locks and show live updates. Use colour coding to show when changes have been made, and after 2s revert back to the default colour.
$ ably spaces locks get -> a lock ID argument is required, confirm if a lock exists or not and show the lock if one does exist
$ ably spaces locks get-all -> show a list of all locks and exit

$ ably logs -> Topic for streaming and retrieving logs
$ ably logs channel-lifecycle subscribe -> Stream logs from [meta]channel.lifecycle meta channel, see https://ably.com/docs/metadata-stats/metadata/subscribe#channel-lifecycle for types of evetns, and the data type.
$ ably logs connection-lifecycle subscribe -> Stream logs from [meta]connection.lifecycle meta channel. 
$ ably logs app subscribe -> Stream logs from the app-wide meta channel `[meta]log`. Rewind is supported for this channel, so offer a rewind option to see recent log entries.
$ ably logs app history -> View historical app logs from `[meta]log` by using the ably pub/sub history API for channels
$ ably logs push subscribe  -> Stream logs from the app push notifications `[meta]log:push`. Rewind is supported for this channel, so offer a rewind option to see recent log entries.
$ ably logs push history ->  -> View historical push logs from `[meta]log:push` by using the ably pub/sub history API for channels

$ ably integrations -> Manage Ably integrations (named rules in the Control API)
$ ably integrations list -> list all integrations in the app
$ ably integrations get -> get an integration by ID
$ ably integrations create -> create an integration rule
$ ably integrations update -> update an integration rule
$ ably integrations delete -> delete an integration rule (prompt for interactive confirmation)

$ ably queues -> Manage Ably Queues
$ ably queues list -> list all queues in the app
$ ably queues create -> create a queue
$ ably queues delete -> delete a queue (prompt for interactive confirmation)

$ ably bench -> Topic for benchmark tests
$ ably bench publisher -> allow a publisher to start publishing messages on a specified channel at a frequency of at most 20 messages per second allowing the total number of messages published to be 10,000. Before the publisher starts publishing though, it will check if there are other subscriber bench clients present on the channel and it will also become present and announce it is a publisher and the details of the test. If there are none, it will ask the user if we should wait for subscribers to be present, or continue with a prompt. Once completed, the client will conrim how many messages were published, if there were any errors, and in the case of REST, what the average latency was for the request to complete, and in the case of Realtime, what the average latency was for a message to be received back. Whilst running the test, the message rate and trailing latency for the last 5 seconds shoudl be shown ,along with the cumulative messages sent and percentage of test execute. This should all be presented in a console UI with a progress bar for example. Support for publishing via REST or Realtime is needed. If a test is already running and another one starts, and error will be shown and the CLI should exit. Each publisher can show others that the test is runing using presence data.
$ ably bench subscriber -> will attach to a channel and be present with data in the presence set indicating it's a subscriber and waiting. Once a publisher bercomes present, the subscriber will indicate a test is starting, and using a UI control, will show running metrics whilst the test is running. Once the test is complete, the summary will be printed out with the test ID, summary of the test paramters, confirmation of how many messages were received or failed, average latencies (based on the publish time assuming clocks are in sync, as the published message will have a latency in the data, and the latency it arrives at Ably is coded into the timestamp field) for end to end, and for it to be received by Ably, with p50, p90, p95 shown. Once the test is done, the subscriber will wait patiently for the next test to start. If a test is running and another one starts, and error will be shown and the CLI should exit.

$ ably help -> Topic to get help from Ably
$ ably help ask -> Ask a question to the Ably AI agent for help. This is done by using the Control API and sending a request to the /v1/help endpoint. Notes on how this works below.
$ ably help contact -> Contact us -> open a browser to https://ably.com/contact
$ ably help support -> Get support from Ably -> open a browser to https://ably.com/support
$ ably help status -> Check the status of the Ably service using the https://ably.com/status/up.json endpoint, and if {status:true} then Ably is up and there are no open incidents, and if {status:false}, then there are open incidents. Either way, tell the user to go to https://status.ably.com to get the Ably status.

$ ably --version -> returns the version of the CLI

### Authentication

There are two distinct types of authentication needs for the CLI.

1. User level (Control Plae) -> an Ably registered user can generate access tokens for use with the Control API. 
   Access tokens are used to access the Control API and are bound to a single account. 
   All control API operations performed with access tokens are made on behalf of the user who issued the token and have the same rights that that user has for that account.

2. App level (Data Plane) -> every call to the Ably product data plane APIs, that is the APIs offered by the products such as Ably Pub/Sub and Ably Chat, requires authentication with an API key or a token generated from an API key.
API keys are issued for apps and can only belong to one app. Apps are sandboxed ensuring API keys cannot be shared across apps and data cannot traverse the boundaries of the app.
   As a result, users of the CLI, when using commands that depend on the data plane, must provide an API key, a token, or have a default app and API key selected from within the CLI.
   As a convenience, if a user has logged in using `ably accounts login`, but has not yet selected an app and is not explicitly providing auth credentials (like an API key or token), then 
     the user will be told that no app is in use and if they press Enter, we will list the apps and let them select one (using a nice interactive CLI UI).
     Once they have selected an app, they will then be shown a list of API keys, and they will too select one.
     Once that is done, the default app ID will be stored in the config for the current access token, and the API key will be stored alongside the list of known apps so that subsequent 
     requests for that app can be automatically authenticated.
  
Note:

- The expected behaviour is that users will obtain an access token, log into the CLI with this token, and this in turn will be used to browse apps and select an API key for all data plane operations.
- However, it is also perfectly valid for a user to use the CLI and simply pass in an explicit API key, Ably JWT token or Control API access token with an argument, and the CLI will operate without any local config needed.
- We provide conveniences in the `ably auth` commands so that users can issue Ably JWT Tokens or Ably Tokens for testing purposes. Whilst we support CLI data plane commands being issued with Ably JWT Tokens or Ably native Tokens, we expect this is unlikely and API keys will be used instead given they are not short-lived.
- When users run the command `ably login`, we should delight with some colourful ASCII art derived from the Ably.com logo. Then ask the user to Press Enter to open the browser to obtain a token, which in turn will take the user to https://ably.com/users/access_tokens. They will then be asked to enter the token in the CLI, once entered, they will be offered the option of entering an alias name for the account or leave empty for the default account.


### Debugging & Logging

- Flags for enabling debugging of the CLI itself
- Log command which has options to subscribe to named log channels and show live logs. Log channel types are described in https://ably.com/docs/metadata-stats/metadata/subscribe, but must include [meta]connection.lifecycle, [meta]channel.lifecycle, [meta]clientEvents:connections, [meta]clientEvents:apiRequests, [meta]log, [meta]log:push.
- Some log channels like [meta]log and [meta]log:push support rewind, so offer the option to rewind or view historical logs with the history feature

### Developer Experience

- Helpful inline documentation and examples (`--help`).
- Autocompletion for bash/zsh shells.
- Friendly, descriptive error handling and troubleshooting suggestions.
- Interactive commands where applicable.

### Configuration

- The CLI will follow popular conventions for storing sensitive configuration information and store the config in the user's home directory using the path `~/.ably/config`
	- We need ensure we treat the Ably config file as sensitive (secure file permissions, etc.).
	- Examples from other CLIs include ~/.aws/credentials, ~/.kube/config, ~/.config/gh/hosts.yml, etc.
- It is expected that the TOML format will be used for the config file as this is human readable and easy to use.
- The configuration file will mostly be used to store credentials for control plane and data plane access.
  - In practice, most users will only have one login and one account at Ably. 
  - However, we do need to support users who have access to multiple accounts, either because their organisation has multiple accounts or because perhaps they have a free account and a company paid account. 
  - Each Control API token is scoped to only one account, so if we a user has access to multiple accounts, then they will need one local access token per account.
  - When a user logs in with `ably accounts login`, if they do not choose to create an alias for the account, then the access token will be stored in the default account. 
  - If a user does provide an alias when logging in, then the access token and all other related credentials for the apps, will be stored in a separate section in the configuration file. This will allow a user to switch between accounts and retain the credentials.
- When users switch accounts, the config must store which account is current.
- When users switch apps, the config must store which app is current. Multiple app configs are stored with each account so that users can switch between apps and the last configured key will be used automatically.
- When users switch keys, the config should replace the existing app key with the new switched one. Each app has only one associated key.


### Global arguments

- `--host`: Override the host endpoint for all product API calls. In the product SDKs, this is typically the `host` option. Note that specifying the host will override both the Realtime and REST host for the Realtime client.
- `--env`: Override the the environment for all product API calls. In the product SDKs, this is typically the `env` option.
- `--control-host`: Override the host endpoint for the control API, which defaults to control.ably.net. 
- `--access-token`: Overrides any configured access token used for the Control API
- `--api-key`: Overrides any configured API key used for the Control API
- `--client-id`: Overrides any default client ID when using API authentication. By default, if API key authentication is being used, then the client ID is automatically defined as `ably-cli-` with a random set of 8 characters generated. This ensures that operations like presence will work, and other clients can easily see that events are being generated from the CLI.
- `--json`: Instead of regular human readable output from the CLI, only valid JSON will be outputted for consumption by other services such as `jq`
- `--pretty-json`: Much like the `--json` argument, only JSON will be outputted, however the JSON will be formatted and colorized to make it more human readable.

#### JSON and Pretty JSON modes

1. CLI commands by default provide user-friendly readable outputs, with colour coding, and status updates where useful can be included in the response.
2. When `--json` argument is used, the assumption is that this is designed as a machine readable format, i.e. when piped into a jq command, or when made available to MCP servers. The JSON output should only include the output expected from the command and exclude any status updates or meta information. For example, subscribing to messages, should only output the messages received and not emit any updates on connection state. The exception to this is when there is a terminal/critical error where the CLI needs to output the error state and stop. In JSON mode, oclif's regular `log` commands suppress logging so that output is limited to intended data as opposed to logging and progress information.
3. When `--pretty-json` argument is used, this follows the same assumptions as `--json`, with the difference being that the CLI can now assume a human is reading the JSON, and as such, we prettify the JSON output and colour code it to make it more legible.

### Usability

- Where applicable, use visually compelling console UI elements to make the experience for a developer delightful

#### Structure of commands

- Whenever a topic (or command with sub-commands) exists with as a plural, such as `ably accounts`, as a convenience, we should ensure anyone typing in `ably account` mistakenly will still be directed to the same command and sub-commands. So `ably account` and `ably account stats`, for example, will work without exactly the same as `ably accounts` and `ably accounts stats` with all supported arguments. The singular version however will not be visible in any commands that list topics or commands thus ensuring the CLI is not polluted with these convenience aliases, that is they are effectively hidden and not discoverable.
- oclif supports two styles of commands, either with spaces delimiting the commands such as `ably account stats` or colons delimiting the commands such as `ably account:stats`. This CLI uses spaces only and all documentation and helpers in the command files must use spaces consistently.
- If a user issues a command to any topic (commmands with sub-commands), as a convenience the CLI should show the list of commands available with simple descriptions and simple examples where applicable. For example, calling `ably accounts` should show the list of all sub-commands.

### Documentation

- You need to generate Markdown documentation in this repository that explains clearly how users can install, configure, and use the CLI. See good examples of docs at https://vercel.com/docs/cli, https://supabase.com/docs/reference/cli/start and 

### Embeddable web example and React component for CLI

This repository should include an example of the CLI running inside of a web browser using direct command execution. This will be achieved by:

- Create a React Ably CLI component that can be used by other web applications to provide this CLI as an interactive terminal inside a browser.
- The React Ably CLI component will open a WebSocket connetion to a terminal server.
- This repository will include a new terminal server role which will listen for new WebSocket connections, and when a new connection comes in, it will open a new docker container, and connect the WebSocket to that container. If the WebSocket connection drops, the docker session will be closed and all artefacts deleted. Sessions older than 30 minutes are terminated, and there will be a configurable number of max concurrent sessions.
- The docker container will be based on an node:22-alpine base image, with the Ably CLI installed using `npm intall @ably/cli`. 
- The docker container will prevent the user from doing anything apart from running the `ably` command. Every other command should be rejected to prevent any abuse of these containers running when new websocket connections are established.
- The React Ably CLI will use Xterm JS (https://xtermjs.org/docs/) to display a fully functional terminal inside the browser. Note https://github.com/Qovery/react-xtermjs may be a useful library to consider as well.
- The React component should require two arguments, a control access token and an API key. This will map to the ABLY_ACCESS_TOKEN env var OR --access-token global argument, and ABLY_API_KEY env var or --api-key global argument.
- The demo web example should be built with Vite and kept very simple. It assumes the user is running the CLI in the context of a single app, account and key, and chosing a different key, app or account is handlded from within the UI of the web interface in real use case examples.
- The environment variables ABLY_ACCESS_TOKEN and ABLY_API_KEY are defined in the environment or in a .env file in that folder. The demo should exist in a folder /example/web-cli.
- Please include an example for how developers can use the React Web CLI component from installing it to embedding it in the README.md file. 
- The web terminal that is run from Docker should exit immediately with a suitable error message is ABLY_ACCESS_TOKEN and ABLY_API_KEY are not valid. ABLY_API_KEY has three parts, app ID, key ID, and key secret in the format [APP_ID].[KEY_ID]:[KEY_SECRET]. Ensure all are present and exit with a suitable error message if not.
- When the web terminal is running, the CLI should be able to detect that it is running in web mode via an environment variable set by the Docker terminal scripts. When running in this mode, the Ably CLI will have some intentionally reduced functionality to reflect the fact that switching accounts, apps, or keys is done via the UI, not the terminal, and the need for a local configuration is thus not needed. The CLI code should introduce a mechanism to clearly manage the rules of which commands are not runnable in Web CLI mode along with suitable error messages shown to the user. The commands not allowed at present are:
  - ably accounts login -> should tell the user they are already logged in and cannot log in again via the web CLI
  - ably accounts list -> should tell the user this feature is not available in the web CLI, please use the web dashboard at https://ably.com/accounts/
  - ably accounts current -> should show the current account information by using the me control API request, but needs to assume a local config does not exist
  - ably accounts logout -> should tell the user they cannot log out via the web CLI
  - ably accounts switch -> should tell the user they cannot change accounts in the web CLI, and should use the dashboard at https://ably.com/accounts/ to switch accounts
  - ably apps switch -> should tell the user they cannot switch apps from within the web CLI and should use the web dashboard at https://ably.com/dashboard
  - ably apps current -> should determine the app info by using the app ID extacted from the ABLY_API_KEY, adn then using the control API to get the app information,.
  - ably auth keys switch -> should tell the user they cannot switch apps from within the web CLI and should use the web interface to change keys
  - ably config -> should not be visible in the list of comamnds, but if called explicitly, should tell the user that a local config is not supported in the web CLI version
  - ably config -> should not be visible in the list of comamnds, but if called explicitly, should tell the user the same message as above for ably accounts login

## Technical Requirements

### Supported Platforms

- Linux
- macOS
- Windows

### Technology

- Built with Node.JS
- Uses the oclif framework, see https://github.com/oclif/oclif and https://oclif.io/
- Built with TypeScript

### Distribution

- Must be publishable to popular package managers Homebrew and npm
- Standalone executables are available for direct download

### Integration & Extensibility

- Supports both JSON output and human-readable more friendly formats typical in CLIs
- JSON output format for easy scripting and integration.
- Ideally potential plugins or extensions for future integrations, but I believe we can lean on the oclif framework for this.

### Model Context Protocol (MCP) Server

This CLI can also act as an MCP server for AI use cases, specifically focussed on IDE tools and AI desktop tools like Claude that support MCP.
Given MCP passes in ENV vars, we need to ensure the following environmnet variables are supported so that the MCP server can handle authentication with Ably data and control planes.
Where we currently generate a random client ID with the cli prefix, we should now use an mcp prefix to make it clear the origination of the requests.
The CLI offers interactive mode in some places. When MCP is being used, we need to ensure interactive features are not enabled so that AI tools can use MCP without any blocking.
All MCP requests should have a max time of 15s per request, so that if we are, for example, subscribing to messages, we will capture the subscription for 15 seconds, and then gracefully exit the application, indicating we terminated the response from continuing indefinitely.
Only a subset of commands from the CLI will be available, all of them listed explicitly below. The commands should support relevant arguments and options where available.
The Node MCP Typescript SDK library should be used to deliver the MCP server, see https://github.com/modelcontextprotocol/typescript-sdk.
The MCP server should run in file mode i.e. it will be run locally with the MCP client.

#### MCP commands available

The following commands from the CLI should be made available in the MCP server:

```
ably apps list
ably apps stats

ably auth keys list

ably channels history
ably channels publish
ably channels list
ably channels presence get
````

#### Environment variables

- ABLY_ACCESS_TOKEN - overrides the default access token used for the control API
- ABLY_API_KEY - overrides the default API key used for the data plane
- ABLY_CLIENT_ID - overrides the default client ID assigned
- ABLY_CONTROL_HOST - overrides the default control API host
- ABLY_HOST - overrides the default data plane host
- ABLY_ENVIRONMENT - overrides the default data plane environment

### Test coverage

- As features are added to the CLI, suitable tests must be added. 
- End to end tests are preferred for all data plane operations, whereas API mocking is acceptable for the Control API given it has an OpenAPI spec you can depend on.

### APIs the CLI will depend on

#### Ably Control API

For all control plane management of apps and their associated resources, the Control API will be used. 
The control API is documented in full at https://ably.com/docs/api/control-api and has an OpenAPI specification at https://github.com/ably/docs/blob/main/static/open-specs/control-v1.yaml. 
All authentication with the Control API requires a Control API token that is configurable by a registered Ably user at https://ably.com/users/access_tokens.
An access token is associated with a single user and a single account, and all API endpoints, apart from one, can be called without knowing which account the access token belongs to.
The exception is the https://control.ably.net/v1/accounts/{id}/stats endpoint, which requires an account ID. The CLI can however determine the account ID for the current token by calling the https://control.ably.net/v1/me, and reading the account.id JSON value.

#### Ably Pub/Sub

For all CLI commands that depend on the Pub/Sub product, or lower level platform features (mostly underpinned by the Pub/Sub product), the Ably Javascript Realtime SDK must be used. See https://github.com/ably/ably-js.
Whilst there are raw REST API endpoints available for Pub/Sub, this CLI should not use them as the Realtime SDK exposes a `request` method that enables REST API calls to the pub/sub service, but the SDK handles authentication, request retries, fallback behaviour, encoding etc. As such, using the SDK `request` method for all REST requests is required when a suitable method in the SDK does not already exist.

#### Ably Chat

For all CLI commands that depend on the Ably Chat product, Ably Javascript Chat SDK must be used. See [TBC]
Whilst there are raw REST API endpoints available for Ably Chat, this CLI should not use them. 
If the CLI requires access to a REST API endpoint, and this endpoint is not made available directly in the Chat Javascript SDK, then it should use the underlying Pub/Sub SDK's `request` method to call the API.

#### JWT 

To generate JWT tokens, the CLI will need to depend on a JWT library to generate the Ably JWT tokens.

## Usage Examples

```sh
ably login
ably channels list --app appId
ably channels publish channelName '{"name":"update","data":"Hello, World"}'
ably subscribe my-channel --app "App name"
ably apps list
ably accounts switch account-alias
```

### Ably AI Agent

The Ably AI agent is available as an endpoint within the control API under /v1/help.
The request made to that endpont is a POST request with body  {"question":<string with question>}
An example response is below. When waiting for a response, we will show a "Thinking..." message with an animation to indicate the system is preparing an answer. Once the answer comes back, we should output the response, along with the list of links from the array at the end of the response.

Once an answer is provided:
- Suggest to the user that they can do a follow up question with syntax `ably help ask --continue "Question"`
- We should store the last question and answer locally so that we can provide the context if there is a --continue command
- When the --continue flag is used, inject the previous conversation thread, including all previous questions and answers
- Any subsequent question without --continue, resets the locally stored info and stores the most recent question and answer

```json
{
  "answer": " \n\nHere's how to get started with Ably:\n\n1. Create an Ably account and get your API key [(1)](https://ably.com/docs/getting-started/quickstart#step-2)\n\n2. Add the Ably Client Library SDK to your project. For JavaScript, you can either:\n\n```html\n<script src=\"https://cdn.ably.com/lib/ably.min-2.js\"></script>\n```\n[(1)](https://ably.com/docs/getting-started/quickstart#step-2)\n\nOr install via NPM:\n```\nnpm install ably\n```\n[(1)](https://ably.com/docs/getting-started/quickstart#step-2)\n\n3. Connect to Ably:\n```javascript\nconst ably = new Ably.Realtime('YOUR-API-KEY');\nawait ably.connection.once('connected');\nconsole.log('Connected to Ably!');\n```\n[(1)](https://ably.com/docs/getting-started/quickstart#step-2)\n\n4. Subscribe to a channel:\n```javascript\nconst channel = ably.channels.get('quickstart');\nawait channel.subscribe('greeting', (message) => {\n  console.log('Received a greeting message in realtime: ' + message.data)\n});\n```\n[(1)](https://ably.com/docs/getting-started/quickstart#step-2)\n\n5. Publish a message:\n```javascript\nawait channel.publish('greeting', 'hello!');\n```\n[(1)](https://ably.com/docs/getting-started/quickstart#step-2)\n\nNote: For production environments, you should use token authentication instead of basic authentication with an API key to avoid exposing it client-side [(1)](https://ably.com/docs/getting-started/quickstart#step-2)",
  "links": [
    {
      "label": "1",
      "type": "documentation",
      "url": "https://ably.com/docs/getting-started/quickstart",
      "title": "Ably Pub/Sub | Quickstart guide",
      "breadcrumbs": [
        "Docs",
        "Ably Pub/Sub | Quickstart guide"
      ],
      "description": null
    }
  ]
}
```
