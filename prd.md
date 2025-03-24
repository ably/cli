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
$ ably rooms typing subscribe -> subscribe to typing indicators and show who is typing and stops typing in realtime
$ ably rooms typing start -> start typing, and remain typing until the CLI is terminated

$ ably logs -> Topic for streaming and retrieving logs
$ ably logs channel-lifecycle subscribe -> Stream logs from [meta]channel.lifecycle meta channel, see https://ably.com/docs/metadata-stats/metadata/subscribe#channel-lifecycle for types of evetns, and the data type.
$ ably logs connection-lifecycle subscribe -> Stream logs from [meta]connection.lifecycle meta channel. 
$ ably logs app subscribe -> Stream logs from the app-wide meta channel `[meta]log`. Rewind is supported for this channel, so offer a rewind option to see recent log entries.
$ ably logs app history -> View historical app logs from `[meta]log` by using the ably pub/sub history API for channels
$ ably logs push subscribe  -> Stream logs from the app push notifications `[meta]log:push`. Rewind is supported for this channel, so offer a rewind option to see recent log entries.
$ ably logs push history ->  -> View historical push logs from `[meta]log:push` by using the ably pub/sub history API for channels

$ ably bench -> Topic for benchmark tests
$ ably bench publisher -> allow a publisher to start publishing messages on a specified channel at a frequency of at most 20 messages per second allowing the total number of messages published to be 10,000. Before the publisher starts publishing though, it will check if there are other subscriber bench clients present on the channel and it will also become present and announce it is a publisher and the details of the test. If there are none, it will ask the user if we should wait for subscribers to be present, or continue with a prompt. Once completed, the client will conrim how many messages were published, if there were any errors, and in the case of REST, what the average latency was for the request to complete, and in the case of Realtime, what the average latency was for a message to be received back. Whilst running the test, the message rate and trailing latency for the last 5 seconds shoudl be shown ,along with the cumulative messages sent and percentage of test execute. This should all be presented in a console UI with a progress bar for example. Support for publishing via REST or Realtime is needed. If a test is already running and another one starts, and error will be shown and the CLI should exit. Each publisher can show others that the test is runing using presence data.
$ ably bench subscriber -> will attach to a channel and be present with data in the presence set indicating it's a subscriber and waiting. Once a publisher bercomes present, the subscriber will indicate a test is starting, and using a UI control, will show running metrics whilst the test is running. Once the test is complete, the summary will be printed out with the test ID, summary of the test paramters, confirmation of how many messages were received or failed, average latencies (based on the publish time assuming clocks are in sync, as the published message will have a latency in the data, and the latency it arrives at Ably is coded into the timestamp field) for end to end, and for it to be received by Ably, with p50, p90, p95 shown. Once the test is done, the subscriber will wait patiently for the next test to start. If a test is running and another one starts, and error will be shown and the CLI should exit.

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

### Usability

- Where applicable, use visually compelling console UI elements to make the experience for a developer delightful

### Documentation

- You need to generate Markdown documentation in this repository that explains clearly how users can install, configure, and use the CLI. See good examples of docs at https://vercel.com/docs/cli, https://supabase.com/docs/reference/cli/start and 

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

### Test coverage

- As features are added to the CLI, suitable tests must be added. 
- End to end tests are preferred for all data plane operations, whereas API mocking is acceptable for the Control API given it has an OpenAPI spec you can depend on.

### APIs the CLI will depend on

#### Ably Control API

For all control plane management of apps and their associated resources, the Control API will be used. 
The control API is documented in full at https://ably.com/docs/api/control-api and has an OpenAPI specification atmhttps://github.com/ably/docs/blob/main/static/open-specs/control-v1.yaml. 
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
