# Ably CLI

[![npm version](https://badge.fury.io/js/@ably%2Fcli.svg)](https://badge.fury.io/js/@ably%2Fcli)

[Ably](https://ably.com) CLI for [Ably Pub/Sub](https://ably.com/pubsub), [Ably Spaces](https://ably.com/spaces), [Ably Chat](https://ably.com/chat) and the [Ably Control API](https://ably.com/docs/account/control-api).

This project is in beta. This CLI is being actively developed, may change and may have bugs. 
Please [get in touch](https://ably.com/contact) if you have feedback, feature requests or want to report bugs. We will start an issue tracker shortly.

<!-- toc -->
* [Ably CLI](#ably-cli)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage

> [!WARNING] 
> This CLI is not installable from NPM due to a [bug in the TypeScript definitions of the ably-js lib](https://github.com/ably/ably-js/pull/1988). 
> Once that PR is merged and a new version is released, the usage instructions below will work.
> Until then, git clone this repo, run `pnpm install` to install dependencies, then build the CLI with `pnpm run pepare`
> Run the CLI with `pnpm run cli`

<!-- usage -->
```sh-session
$ npm install -g @ably/cli
$ ably COMMAND
running command...
$ ably (--version)
@ably/cli/0.1.2 darwin-arm64 node-v22.14.0
$ ably --help [COMMAND]
USAGE
  $ ably COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`ably accounts`](#ably-accounts)
* [`ably accounts current`](#ably-accounts-current)
* [`ably accounts list`](#ably-accounts-list)
* [`ably accounts login [TOKEN]`](#ably-accounts-login-token)
* [`ably accounts logout [ALIAS]`](#ably-accounts-logout-alias)
* [`ably accounts stats`](#ably-accounts-stats)
* [`ably accounts switch [ALIAS]`](#ably-accounts-switch-alias)
* [`ably apps`](#ably-apps)
* [`ably apps create`](#ably-apps-create)
* [`ably apps current`](#ably-apps-current)
* [`ably apps delete ID`](#ably-apps-delete-id)
* [`ably apps list`](#ably-apps-list)
* [`ably apps set-apns-p12 ID`](#ably-apps-set-apns-p12-id)
* [`ably apps stats ID`](#ably-apps-stats-id)
* [`ably apps switch [APPID]`](#ably-apps-switch-appid)
* [`ably apps update ID`](#ably-apps-update-id)
* [`ably auth`](#ably-auth)
* [`ably auth keys`](#ably-auth-keys)
* [`ably auth keys current`](#ably-auth-keys-current)
* [`ably auth keys get KEYNAMEORVALUE`](#ably-auth-keys-get-keynameorvalue)
* [`ably auth keys list`](#ably-auth-keys-list)
* [`ably auth keys revoke KEYNAME`](#ably-auth-keys-revoke-keyname)
* [`ably auth keys switch [KEYNAMEORVALUE]`](#ably-auth-keys-switch-keynameorvalue)
* [`ably auth keys update KEYNAME`](#ably-auth-keys-update-keyname)
* [`ably bench`](#ably-bench)
* [`ably bench publisher CHANNEL`](#ably-bench-publisher-channel)
* [`ably bench subscriber CHANNEL`](#ably-bench-subscriber-channel)
* [`ably channels`](#ably-channels)
* [`ably channels history CHANNEL`](#ably-channels-history-channel)
* [`ably channels list`](#ably-channels-list)
* [`ably channels occupancy`](#ably-channels-occupancy)
* [`ably channels occupancy get CHANNEL`](#ably-channels-occupancy-get-channel)
* [`ably channels occupancy subscribe CHANNEL`](#ably-channels-occupancy-subscribe-channel)
* [`ably channels presence`](#ably-channels-presence)
* [`ably channels presence enter CHANNEL`](#ably-channels-presence-enter-channel)
* [`ably channels presence subscribe CHANNEL`](#ably-channels-presence-subscribe-channel)
* [`ably channels publish CHANNEL MESSAGE`](#ably-channels-publish-channel-message)
* [`ably channels subscribe CHANNELS`](#ably-channels-subscribe-channels)
* [`ably config`](#ably-config)
* [`ably login [TOKEN]`](#ably-login-token)
* [`ably rooms`](#ably-rooms)
* [`ably rooms list`](#ably-rooms-list)
* [`ably rooms messages`](#ably-rooms-messages)
* [`ably rooms messages get ROOMID`](#ably-rooms-messages-get-roomid)
* [`ably rooms messages send ROOMID TEXT`](#ably-rooms-messages-send-roomid-text)
* [`ably rooms messages subscribe ROOMID`](#ably-rooms-messages-subscribe-roomid)
* [`ably rooms typing`](#ably-rooms-typing)
* [`ably rooms typing start ROOMID`](#ably-rooms-typing-start-roomid)
* [`ably rooms typing subscribe ROOMID`](#ably-rooms-typing-subscribe-roomid)

## `ably accounts`

Manage Ably accounts and your configured access tokens

```
USAGE
  $ ably accounts

DESCRIPTION
  Manage Ably accounts and your configured access tokens

EXAMPLES
  $ ably accounts stats
```

_See code: [src/commands/accounts/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/accounts/index.ts)_

## `ably accounts current`

Show the current Ably account

```
USAGE
  $ ably accounts current [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Show the current Ably account

EXAMPLES
  $ ably accounts current
```

_See code: [src/commands/accounts/current.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/accounts/current.ts)_

## `ably accounts list`

List locally configured Ably accounts

```
USAGE
  $ ably accounts list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  List locally configured Ably accounts

EXAMPLES
  $ ably accounts list
```

_See code: [src/commands/accounts/list.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/accounts/list.ts)_

## `ably accounts login [TOKEN]`

Log in to your Ably account

```
USAGE
  $ ably accounts login [TOKEN] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [-a <value>] [--no-browser]

ARGUMENTS
  TOKEN  Access token (if not provided, will prompt for it)

FLAGS
  -a, --alias=<value>         Alias for this account (default account if not specified)
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --no-browser            Do not open a browser

DESCRIPTION
  Log in to your Ably account

EXAMPLES
  $ ably accounts login

  $ ably accounts login --alias mycompany
```

_See code: [src/commands/accounts/login.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/accounts/login.ts)_

## `ably accounts logout [ALIAS]`

Log out from an Ably account

```
USAGE
  $ ably accounts logout [ALIAS] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [-f]

ARGUMENTS
  ALIAS  Alias of the account to log out from (defaults to current account)

FLAGS
  -f, --force                 Force logout without confirmation
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Log out from an Ably account

EXAMPLES
  $ ably accounts logout

  $ ably accounts logout mycompany
```

_See code: [src/commands/accounts/logout.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/accounts/logout.ts)_

## `ably accounts stats`

Get account stats with optional live updates

```
USAGE
  $ ably accounts stats [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--start <value>] [--end <value>] [--unit minute|hour|day|month] [--limit
    <value>] [--format json|pretty] [--live] [--interval <value>]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --end=<value>           End time in milliseconds since epoch
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --interval=<value>      [default: 6] Polling interval in seconds (only used with --live)
  --limit=<value>         [default: 10] Maximum number of stats records to return
  --live                  Subscribe to live stats updates
  --start=<value>         Start time in milliseconds since epoch
  --unit=<option>         [default: minute] Time unit for stats
                          <options: minute|hour|day|month>

DESCRIPTION
  Get account stats with optional live updates

EXAMPLES
  $ ably accounts stats

  $ ably accounts stats --unit hour

  $ ably accounts stats --start 1618005600000 --end 1618091999999

  $ ably accounts stats --limit 10

  $ ably accounts stats --format json

  $ ably accounts stats --live

  $ ably accounts stats --live --interval 15
```

_See code: [src/commands/accounts/stats/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/accounts/stats/index.ts)_

## `ably accounts switch [ALIAS]`

Switch to a different Ably account

```
USAGE
  $ ably accounts switch [ALIAS] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>]

ARGUMENTS
  ALIAS  Alias of the account to switch to

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Switch to a different Ably account

EXAMPLES
  $ ably accounts switch

  $ ably accounts switch mycompany
```

_See code: [src/commands/accounts/switch.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/accounts/switch.ts)_

## `ably apps`

Manage Ably apps

```
USAGE
  $ ably apps

DESCRIPTION
  Manage Ably apps

EXAMPLES
  $ ably apps list

  $ ably apps create

  $ ably apps update

  $ ably apps delete
```

_See code: [src/commands/apps/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/apps/index.ts)_

## `ably apps create`

Create a new app

```
USAGE
  $ ably apps create --name <value> [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--client-id <value>] [--tls-only] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --name=<value>          (required) Name of the app
  --tls-only              Whether the app should accept TLS connections only

DESCRIPTION
  Create a new app

EXAMPLES
  $ ably apps create --name "My New App"

  $ ably apps create --name "My New App" --tls-only

  $ ably apps create --name "My New App" --access-token "YOUR_ACCESS_TOKEN"
```

_See code: [src/commands/apps/create.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/apps/create.ts)_

## `ably apps current`

Show the currently selected app

```
USAGE
  $ ably apps current [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Show the currently selected app

EXAMPLES
  $ ably apps current

  $ ably apps current --format json
```

_See code: [src/commands/apps/current.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/apps/current.ts)_

## `ably apps delete ID`

Delete an app

```
USAGE
  $ ably apps delete ID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [-f]

ARGUMENTS
  ID  App ID to delete

FLAGS
  -f, --force                 Skip confirmation prompt
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Delete an app

EXAMPLES
  $ ably apps delete app-id

  $ ably apps delete app-id --access-token "YOUR_ACCESS_TOKEN"

  $ ably apps delete app-id --force
```

_See code: [src/commands/apps/delete.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/apps/delete.ts)_

## `ably apps list`

List all apps

```
USAGE
  $ ably apps list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  List all apps

EXAMPLES
  $ ably apps list

  $ ably apps list --access-token "YOUR_ACCESS_TOKEN"

  $ ably apps list --format json
```

_See code: [src/commands/apps/list.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/apps/list.ts)_

## `ably apps set-apns-p12 ID`

Upload Apple Push Notification Service P12 certificate for an app

```
USAGE
  $ ably apps set-apns-p12 ID --certificate <value> [--host <value>] [--env <value>] [--control-host <value>]
    [--access-token <value>] [--api-key <value>] [--client-id <value>] [--password <value>] [--use-for-sandbox]
    [--format json|pretty]

ARGUMENTS
  ID  App ID to set the APNS certificate for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --certificate=<value>   (required) Path to the P12 certificate file
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --password=<value>      Password for the P12 certificate
  --use-for-sandbox       Whether to use this certificate for the APNS sandbox environment

DESCRIPTION
  Upload Apple Push Notification Service P12 certificate for an app

EXAMPLES
  $ ably apps set-apns-p12 app-id --certificate /path/to/certificate.p12

  $ ably apps set-apns-p12 app-id --certificate /path/to/certificate.p12 --password "YOUR_CERTIFICATE_PASSWORD"

  $ ably apps set-apns-p12 app-id --certificate /path/to/certificate.p12 --use-for-sandbox
```

_See code: [src/commands/apps/set-apns-p12.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/apps/set-apns-p12.ts)_

## `ably apps stats ID`

Get app stats with optional live updates

```
USAGE
  $ ably apps stats ID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--start <value>] [--end <value>] [--unit minute|hour|day|month] [--limit
    <value>] [--format json|pretty] [--live] [--interval <value>]

ARGUMENTS
  ID  App ID to get stats for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --end=<value>           End time in milliseconds since epoch
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --interval=<value>      [default: 6] Polling interval in seconds (only used with --live)
  --limit=<value>         [default: 10] Maximum number of stats records to return
  --live                  Subscribe to live stats updates
  --start=<value>         Start time in milliseconds since epoch
  --unit=<option>         [default: minute] Time unit for stats
                          <options: minute|hour|day|month>

DESCRIPTION
  Get app stats with optional live updates

EXAMPLES
  $ ably apps stats app-id

  $ ably apps stats app-id --unit hour

  $ ably apps stats app-id --start 1618005600000 --end 1618091999999

  $ ably apps stats app-id --limit 10

  $ ably apps stats app-id --format json

  $ ably apps stats app-id --live

  $ ably apps stats app-id --live --interval 15
```

_See code: [src/commands/apps/stats/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/apps/stats/index.ts)_

## `ably apps switch [APPID]`

Switch to a different Ably app

```
USAGE
  $ ably apps switch [APPID] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>]

ARGUMENTS
  APPID  ID of the app to switch to

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Switch to a different Ably app

EXAMPLES
  $ ably apps switch APP_ID

  $ ably apps switch
```

_See code: [src/commands/apps/switch.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/apps/switch.ts)_

## `ably apps update ID`

Update an app

```
USAGE
  $ ably apps update ID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--name <value>] [--tls-only] [--format json|pretty]

ARGUMENTS
  ID  App ID to update

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --name=<value>          New name for the app
  --tls-only              Whether the app should accept TLS connections only

DESCRIPTION
  Update an app

EXAMPLES
  $ ably apps update app-id --name "Updated App Name"

  $ ably apps update app-id --tls-only

  $ ably apps update app-id --name "Updated App Name" --tls-only

  $ ably apps update app-id --name "Updated App Name" --access-token "YOUR_ACCESS_TOKEN"
```

_See code: [src/commands/apps/update.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/apps/update.ts)_

## `ably auth`

Authentication commands for Ably

```
USAGE
  $ ably auth

DESCRIPTION
  Authentication commands for Ably

EXAMPLES
  $ ably auth keys list

  $ ably auth keys get KEY_ID

  $ ably auth keys revoke KEY_ID

  $ ably auth keys update KEY_ID

  $ ably auth keys switch KEY_ID
```

_See code: [src/commands/auth/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/auth/index.ts)_

## `ably auth keys`

Key management commands

```
USAGE
  $ ably auth keys

DESCRIPTION
  Key management commands

EXAMPLES
  $ ably auth keys list

  $ ably auth keys get KEY_ID

  $ ably auth keys revoke KEY_ID

  $ ably auth keys update KEY_ID

  $ ably auth keys switch KEY_ID
```

_See code: [src/commands/auth/keys/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/auth/keys/index.ts)_

## `ably auth keys current`

Show the current API key for the selected app

```
USAGE
  $ ably auth keys current [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--app <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID to check key for (uses current app if not specified)
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Show the current API key for the selected app

EXAMPLES
  $ ably auth keys current

  $ ably auth keys current --app APP_ID

  $ ably auth keys current --format json
```

_See code: [src/commands/auth/keys/current.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/auth/keys/current.ts)_

## `ably auth keys get KEYNAMEORVALUE`

Get details for a specific key

```
USAGE
  $ ably auth keys get KEYNAMEORVALUE [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--client-id <value>] [--app <value>] [--format json|pretty]

ARGUMENTS
  KEYNAMEORVALUE  Key name (APP_ID.KEY_ID) or full value of the key to get details for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID the key belongs to (uses current app if not specified)
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Get details for a specific key

EXAMPLES
  $ ably auth keys get APP_ID.KEY_ID

  $ ably auth keys get KEY_ID --app APP_ID

  $ ably auth keys get APP_ID.KEY_ID --format json
```

_See code: [src/commands/auth/keys/get.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/auth/keys/get.ts)_

## `ably auth keys list`

List all keys in the app

```
USAGE
  $ ably auth keys list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--app <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID to list keys for (uses current app if not specified)
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  List all keys in the app

EXAMPLES
  $ ably auth keys list

  $ ably auth keys list --app APP_ID

  $ ably auth keys list --format json
```

_See code: [src/commands/auth/keys/list.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/auth/keys/list.ts)_

## `ably auth keys revoke KEYNAME`

Revoke an API key (permanently disables the key)

```
USAGE
  $ ably auth keys revoke KEYNAME [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--app <value>] [--force]

ARGUMENTS
  KEYNAME  Key name (APP_ID.KEY_ID) of the key to revoke

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID the key belongs to (uses current app if not specified)
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --force                 Skip confirmation prompt
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Revoke an API key (permanently disables the key)

EXAMPLES
  $ ably auth keys revoke APP_ID.KEY_ID

  $ ably auth keys revoke KEY_ID --app APP_ID

  $ ably auth keys revoke APP_ID.KEY_ID --force
```

_See code: [src/commands/auth/keys/revoke.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/auth/keys/revoke.ts)_

## `ably auth keys switch [KEYNAMEORVALUE]`

Switch to a different API key for the current app

```
USAGE
  $ ably auth keys switch [KEYNAMEORVALUE] [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--client-id <value>] [--app <value>]

ARGUMENTS
  KEYNAMEORVALUE  Key name (APP_ID.KEY_ID) or full value of the key to switch to

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID to switch keys for (uses current app if not specified)
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Switch to a different API key for the current app

EXAMPLES
  $ ably auth keys switch

  $ ably auth keys switch APP_ID.KEY_ID

  $ ably auth keys switch KEY_ID --app APP_ID
```

_See code: [src/commands/auth/keys/switch.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/auth/keys/switch.ts)_

## `ably auth keys update KEYNAME`

Update a key's properties

```
USAGE
  $ ably auth keys update KEYNAME [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--app <value>] [--name <value>] [--capabilities <value>]

ARGUMENTS
  KEYNAME  Key name (APP_ID.KEY_ID) of the key to update

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID the key belongs to (uses current app if not specified)
  --capabilities=<value>  New capabilities for the key (comma-separated list)
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --name=<value>          New name for the key

DESCRIPTION
  Update a key's properties

EXAMPLES
  $ ably auth keys update APP_ID.KEY_ID --name "New Name"

  $ ably auth keys update KEY_ID --app APP_ID --capabilities "publish,subscribe"

  $ ably auth keys update APP_ID.KEY_ID --name "New Name" --capabilities "publish,subscribe"
```

_See code: [src/commands/auth/keys/update.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/auth/keys/update.ts)_

## `ably bench`

Commands for running benchmark tests

```
USAGE
  $ ably bench

DESCRIPTION
  Commands for running benchmark tests

EXAMPLES
  $ ably bench publisher my-channel
  $ ably bench subscriber my-channel
```

_See code: [src/commands/bench/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/bench/index.ts)_

## `ably bench publisher CHANNEL`

Run a publisher benchmark test

```
USAGE
  $ ably bench publisher CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [-m <value>] [-r <value>] [-t rest|realtime] [--wait-for-subscribers]
    [--message-size <value>]

ARGUMENTS
  CHANNEL  The channel name to publish to

FLAGS
  -m, --messages=<value>      [default: 1000] Number of messages to publish (max 10,000)
  -r, --rate=<value>          [default: 15] Messages per second to publish (max 20)
  -t, --transport=<option>    [default: realtime] Transport to use for publishing
                              <options: rest|realtime>
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --message-size=<value>  [default: 100] Size of the message payload in bytes
      --wait-for-subscribers  Wait for subscribers to be present before starting

DESCRIPTION
  Run a publisher benchmark test

EXAMPLES
  $ ably bench publisher my-channel

  $ ably bench publisher --messages 5000 --rate 10 my-channel

  $ ably bench publisher --transport realtime my-channel
```

_See code: [src/commands/bench/publisher.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/bench/publisher.ts)_

## `ably bench subscriber CHANNEL`

Run a subscriber benchmark test

```
USAGE
  $ ably bench subscriber CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [-t rest|realtime]

ARGUMENTS
  CHANNEL  The channel name to subscribe to

FLAGS
  -t, --transport=<option>    [default: realtime] Transport to use for subscribing
                              <options: rest|realtime>
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Run a subscriber benchmark test

EXAMPLES
  $ ably bench subscriber my-channel

  $ ably bench subscriber --transport realtime my-channel
```

_See code: [src/commands/bench/subscriber.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/bench/subscriber.ts)_

## `ably channels`

Interact with Ably Pub/Sub channels

```
USAGE
  $ ably channels

DESCRIPTION
  Interact with Ably Pub/Sub channels

EXAMPLES
  $ ably channels publish my-channel '{"name":"message","data":"Hello, World"}'

  $ ably channels subscribe my-channel

  $ ably channels occupancy get my-channel

  $ ably channels occupancy live my-channel

  $ ably channels list
```

_See code: [src/commands/channels/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/index.ts)_

## `ably channels history CHANNEL`

Retrieve message history for a channel

```
USAGE
  $ ably channels history CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--limit <value>] [--direction backwards|forwards] [--start <value>]
    [--end <value>] [--format json|pretty] [--cipher-key <value>] [--cipher-algorithm <value>] [--cipher-key-length
    <value>] [--cipher-mode <value>]

ARGUMENTS
  CHANNEL  Channel name to retrieve history for

FLAGS
  --access-token=<value>       Overrides any configured access token used for the Control API
  --api-key=<value>            Overrides any configured API key used for the product APIs
  --cipher-algorithm=<value>   [default: aes] Encryption algorithm to use
  --cipher-key=<value>         Encryption key for decrypting messages (hex-encoded)
  --cipher-key-length=<value>  [default: 256] Length of encryption key in bits
  --cipher-mode=<value>        [default: cbc] Cipher mode to use
  --client-id=<value>          Overrides any default client ID when using API authentication
  --control-host=<value>       Override the host endpoint for the control API, which defaults to control.ably.net
  --direction=<option>         [default: backwards] Order of messages
                               <options: backwards|forwards>
  --end=<value>                End time for the history query (ISO 8601 format)
  --env=<value>                Override the environment for all product API calls
  --format=<option>            [default: pretty] Output format (json or pretty)
                               <options: json|pretty>
  --host=<value>               Override the host endpoint for all product API calls
  --limit=<value>              [default: 25] Maximum number of messages to return
  --start=<value>              Start time for the history query (ISO 8601 format)

DESCRIPTION
  Retrieve message history for a channel

EXAMPLES
  $ ably channels history my-channel

  $ ably channels history my-channel --limit 50

  $ ably channels history my-channel --direction forwards

  $ ably channels history my-channel --format json

  $ ably channels history my-channel --start "2023-01-01T00:00:00Z" --end "2023-01-02T00:00:00Z"
```

_See code: [src/commands/channels/history.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/history.ts)_

## `ably channels list`

List active channels using the channel enumeration API

```
USAGE
  $ ably channels list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [-p <value>] [--limit <value>] [--format json|pretty]

FLAGS
  -p, --prefix=<value>        Filter channels by prefix
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --format=<option>       [default: pretty] Output format (json or pretty)
                              <options: json|pretty>
      --host=<value>          Override the host endpoint for all product API calls
      --limit=<value>         [default: 100] Maximum number of channels to return

DESCRIPTION
  List active channels using the channel enumeration API

EXAMPLES
  $ ably channels list

  $ ably channels list --prefix my-channel

  $ ably channels list --limit 50

  $ ably channels list --format json
```

_See code: [src/commands/channels/list.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/list.ts)_

## `ably channels occupancy`

Get occupancy metrics for a channel

```
USAGE
  $ ably channels occupancy

DESCRIPTION
  Get occupancy metrics for a channel

EXAMPLES
  $ ably channels occupancy get my-channel

  $ ably channels occupancy live my-channel
```

_See code: [src/commands/channels/occupancy.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/occupancy.ts)_

## `ably channels occupancy get CHANNEL`

Get current occupancy metrics for a channel

```
USAGE
  $ ably channels occupancy get CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  CHANNEL  Channel name to get occupancy for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Get current occupancy metrics for a channel

EXAMPLES
  $ ably channels occupancy:get my-channel

  $ ably channels occupancy:get --api-key "YOUR_API_KEY" my-channel
```

_See code: [src/commands/channels/occupancy/get.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/occupancy/get.ts)_

## `ably channels occupancy subscribe CHANNEL`

Subscribe to real-time occupancy metrics for a channel

```
USAGE
  $ ably channels occupancy subscribe CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  CHANNEL  Channel name to subscribe to occupancy for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Subscribe to real-time occupancy metrics for a channel

EXAMPLES
  $ ably channels occupancy subscribe my-channel

  $ ably channels occupancy subscribe --api-key "YOUR_API_KEY" my-channel

  $ ably channels occupancy subscribe --format json my-channel
```

_See code: [src/commands/channels/occupancy/subscribe.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/occupancy/subscribe.ts)_

## `ably channels presence`

Manage presence on Ably channels

```
USAGE
  $ ably channels presence

DESCRIPTION
  Manage presence on Ably channels

EXAMPLES
  $ ably channels presence enter my-channel

  $ ably channels presence subscribe my-channel
```

_See code: [src/commands/channels/presence.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/presence.ts)_

## `ably channels presence enter CHANNEL`

Enter presence on a channel and remain present until terminated

```
USAGE
  $ ably channels presence enter CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--data <value>] [--show-others]

ARGUMENTS
  CHANNEL  Channel name to enter presence on

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --data=<value>          [default: {}] Presence data to publish (JSON string)
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --show-others           Show other presence events while present

DESCRIPTION
  Enter presence on a channel and remain present until terminated

EXAMPLES
  $ ably channels presence:enter my-channel

  $ ably channels presence:enter my-channel --data '{"status":"online"}'

  $ ably channels presence:enter my-channel --client-id "user123"
```

_See code: [src/commands/channels/presence/enter.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/presence/enter.ts)_

## `ably channels presence subscribe CHANNEL`

Subscribe to presence events on a channel

```
USAGE
  $ ably channels presence subscribe CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  CHANNEL  Channel name to subscribe to presence on

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Subscribe to presence events on a channel

EXAMPLES
  $ ably channels presence:subscribe my-channel

  $ ably channels presence:subscribe my-channel --format json
```

_See code: [src/commands/channels/presence/subscribe.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/presence/subscribe.ts)_

## `ably channels publish CHANNEL MESSAGE`

Publish a message to an Ably channel

```
USAGE
  $ ably channels publish CHANNEL MESSAGE [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--client-id <value>] [-n <value>] [-e <value>] [-c <value>] [-d <value>]

ARGUMENTS
  CHANNEL  The channel name to publish to
  MESSAGE  The message to publish (JSON format or plain text)

FLAGS
  -c, --count=<value>         [default: 1] Number of messages to publish
  -d, --delay=<value>         Delay between messages in milliseconds (min 10ms when count > 1)
  -e, --encoding=<value>      The encoding for the message
  -n, --name=<value>          The event name (if not specified in the message JSON)
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Publish a message to an Ably channel

EXAMPLES
  $ ably channels publish my-channel '{"name":"event","data":"Hello World"}'

  $ ably channels publish --api-key "YOUR_API_KEY" my-channel '{"data":"Simple message"}'

  $ ably channels publish --name event my-channel '{"text":"Hello World"}'

  $ ably channels publish my-channel "Hello World"

  $ ably channels publish --name event my-channel "Plain text message"

  $ ably channels publish --count 5 my-channel "Message number {{.Count}}"

  $ ably channels publish --count 10 --delay 1000 my-channel "Message at {{.Timestamp}}"
```

_See code: [src/commands/channels/publish.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/publish.ts)_

## `ably channels subscribe CHANNELS`

Subscribe to messages published on one or more Ably channels

```
USAGE
  $ ably channels subscribe CHANNELS... [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--client-id <value>] [--rewind <value>] [--delta] [--cipher-key <value>]
    [--cipher-algorithm <value>] [--cipher-key-length <value>] [--cipher-mode <value>]

ARGUMENTS
  CHANNELS...  Channel name(s) to subscribe to

FLAGS
  --access-token=<value>       Overrides any configured access token used for the Control API
  --api-key=<value>            Overrides any configured API key used for the product APIs
  --cipher-algorithm=<value>   [default: aes] Encryption algorithm to use
  --cipher-key=<value>         Encryption key for decrypting messages (hex-encoded)
  --cipher-key-length=<value>  [default: 256] Length of encryption key in bits
  --cipher-mode=<value>        [default: cbc] Cipher mode to use
  --client-id=<value>          Overrides any default client ID when using API authentication
  --control-host=<value>       Override the host endpoint for the control API, which defaults to control.ably.net
  --delta                      Enable delta compression for messages
  --env=<value>                Override the environment for all product API calls
  --host=<value>               Override the host endpoint for all product API calls
  --rewind=<value>             Number of messages to rewind when subscribing

DESCRIPTION
  Subscribe to messages published on one or more Ably channels

EXAMPLES
  $ ably channels subscribe my-channel

  $ ably channels subscribe my-channel another-channel

  $ ably channels subscribe --api-key "YOUR_API_KEY" my-channel

  $ ably channels subscribe --rewind 10 my-channel

  $ ably channels subscribe --delta my-channel

  $ ably channels subscribe --cipher-key YOUR_CIPHER_KEY my-channel
```

_See code: [src/commands/channels/subscribe.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/channels/subscribe.ts)_

## `ably config`

Open the Ably config file in the default text editor

```
USAGE
  $ ably config [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [-e <value>]

FLAGS
  -e, --editor=<value>        Text editor to use (defaults to $EDITOR environment variable)
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Open the Ably config file in the default text editor

EXAMPLES
  $ ably config edit
```

_See code: [src/commands/config.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/config.ts)_

## `ably login [TOKEN]`

Log in to your Ably account (alias for "ably accounts login")

```
USAGE
  $ ably login [TOKEN] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [-a <value>] [--no-browser]

ARGUMENTS
  TOKEN  Access token (if not provided, will prompt for it)

FLAGS
  -a, --alias=<value>         Alias for this account (default account if not specified)
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --no-browser            Do not open a browser

DESCRIPTION
  Log in to your Ably account (alias for "ably accounts login")

EXAMPLES
  $ ably login

  $ ably login --alias mycompany
```

_See code: [src/commands/login.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/login.ts)_

## `ably rooms`

Commands for working with Ably Chat rooms

```
USAGE
  $ ably rooms

DESCRIPTION
  Commands for working with Ably Chat rooms

EXAMPLES
  $ ably rooms list

  $ ably rooms messages send my-room "Hello world!"

  $ ably rooms messages subscribe my-room

  $ ably rooms messages get my-room

  $ ably rooms typing subscribe my-room

  $ ably rooms typing start my-room
```

_See code: [src/commands/rooms/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/rooms/index.ts)_

## `ably rooms list`

List active chat rooms

```
USAGE
  $ ably rooms list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [-p <value>] [--limit <value>] [--format json|pretty]

FLAGS
  -p, --prefix=<value>        Filter rooms by prefix
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --format=<option>       [default: pretty] Output format (json or pretty)
                              <options: json|pretty>
      --host=<value>          Override the host endpoint for all product API calls
      --limit=<value>         [default: 100] Maximum number of rooms to return

DESCRIPTION
  List active chat rooms

EXAMPLES
  $ ably rooms list

  $ ably rooms list --prefix my-room

  $ ably rooms list --limit 50

  $ ably rooms list --format json
```

_See code: [src/commands/rooms/list.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/rooms/list.ts)_

## `ably rooms messages`

Commands for working with chat messages in rooms

```
USAGE
  $ ably rooms messages

DESCRIPTION
  Commands for working with chat messages in rooms

EXAMPLES
  $ ably rooms messages send my-room "Hello world!"

  $ ably rooms messages subscribe my-room

  $ ably rooms messages get my-room
```

_See code: [src/commands/rooms/messages/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/rooms/messages/index.ts)_

## `ably rooms messages get ROOMID`

Get historical messages from an Ably Chat room

```
USAGE
  $ ably rooms messages get ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [-l <value>] [--show-metadata]

ARGUMENTS
  ROOMID  The room ID to get messages from

FLAGS
  -l, --limit=<value>         [default: 20] Maximum number of messages to retrieve
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --show-metadata         Display message metadata if available

DESCRIPTION
  Get historical messages from an Ably Chat room

EXAMPLES
  $ ably rooms messages get my-room

  $ ably rooms messages get --api-key "YOUR_API_KEY" my-room

  $ ably rooms messages get --limit 50 my-room

  $ ably rooms messages get --show-metadata my-room
```

_See code: [src/commands/rooms/messages/get.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/rooms/messages/get.ts)_

## `ably rooms messages send ROOMID TEXT`

Send a message to an Ably Chat room

```
USAGE
  $ ably rooms messages send ROOMID TEXT [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--client-id <value>] [--metadata <value>] [-c <value>] [-d <value>]

ARGUMENTS
  ROOMID  The room ID to send the message to
  TEXT    The message text to send

FLAGS
  -c, --count=<value>         [default: 1] Number of messages to send
  -d, --delay=<value>         Delay between messages in milliseconds (min 10ms when count > 1)
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --metadata=<value>      Additional metadata for the message (JSON format)

DESCRIPTION
  Send a message to an Ably Chat room

EXAMPLES
  $ ably rooms messages send my-room "Hello World!"

  $ ably rooms messages send --api-key "YOUR_API_KEY" my-room "Welcome to the chat!"

  $ ably rooms messages send --metadata '{"isImportant":true}' my-room "Attention please!"

  $ ably rooms messages send --count 5 my-room "Message number {{.Count}}"

  $ ably rooms messages send --count 10 --delay 1000 my-room "Message at {{.Timestamp}}"
```

_See code: [src/commands/rooms/messages/send.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/rooms/messages/send.ts)_

## `ably rooms messages subscribe ROOMID`

Subscribe to messages in an Ably Chat room

```
USAGE
  $ ably rooms messages subscribe ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>] [--show-metadata]

ARGUMENTS
  ROOMID  The room ID to subscribe to messages from

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --show-metadata         Display message metadata if available

DESCRIPTION
  Subscribe to messages in an Ably Chat room

EXAMPLES
  $ ably rooms messages subscribe my-room

  $ ably rooms messages subscribe --api-key "YOUR_API_KEY" my-room

  $ ably rooms messages subscribe --show-metadata my-room
```

_See code: [src/commands/rooms/messages/subscribe.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/rooms/messages/subscribe.ts)_

## `ably rooms typing`

Commands for working with typing indicators in chat rooms

```
USAGE
  $ ably rooms typing

DESCRIPTION
  Commands for working with typing indicators in chat rooms

EXAMPLES
  $ ably rooms typing subscribe my-room

  $ ably rooms typing start my-room
```

_See code: [src/commands/rooms/typing/index.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/rooms/typing/index.ts)_

## `ably rooms typing start ROOMID`

Start typing in an Ably Chat room (will remain typing until terminated)

```
USAGE
  $ ably rooms typing start ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>]

ARGUMENTS
  ROOMID  The room ID to start typing in

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Start typing in an Ably Chat room (will remain typing until terminated)

EXAMPLES
  $ ably rooms typing start my-room

  $ ably rooms typing start --api-key "YOUR_API_KEY" my-room
```

_See code: [src/commands/rooms/typing/start.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/rooms/typing/start.ts)_

## `ably rooms typing subscribe ROOMID`

Subscribe to typing indicators in an Ably Chat room

```
USAGE
  $ ably rooms typing subscribe ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--client-id <value>]

ARGUMENTS
  ROOMID  The room ID to subscribe to typing indicators from

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls

DESCRIPTION
  Subscribe to typing indicators in an Ably Chat room

EXAMPLES
  $ ably rooms typing subscribe my-room

  $ ably rooms typing subscribe --api-key "YOUR_API_KEY" my-room
```

_See code: [src/commands/rooms/typing/subscribe.ts](https://github.com/ably/cli/blob/v0.1.2/src/commands/rooms/typing/subscribe.ts)_
<!-- commandsstop -->
