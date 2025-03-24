# Ably CLI

Ably CLI for Ably Pub/Sub, Ably Spaces, Ably Chat and the Ably Control API.

This project is in early alpha stage. It is not recommended you use this, but do [get in touch](https://ably.com/contact) if you have feedback or feature requests.

<!-- toc -->
* [Ably CLI](#ably-cli)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g ably-cli
$ ably COMMAND
running command...
$ ably (--version)
ably-cli/0.0.1 darwin-arm64 node-v22.14.0
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

## `ably channels publish CHANNEL MESSAGE`

Publish a message to an Ably channel

```
USAGE
  $ ably channels publish CHANNEL MESSAGE [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--client-id <value>] [-n <value>] [-e <value>]

ARGUMENTS
  CHANNEL  The channel name to publish to
  MESSAGE  The message to publish (JSON format or plain text)

FLAGS
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
```

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
<!-- commandsstop -->
