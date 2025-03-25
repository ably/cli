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
<!-- usage -->
```sh-session
$ npm install -g @ably/cli
$ ably COMMAND
running command...
$ ably (--version)
@ably/cli/0.2.1 darwin-arm64 node-v22.14.0
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
* [`ably apps channel-rules`](#ably-apps-channel-rules)
* [`ably apps channel-rules create`](#ably-apps-channel-rules-create)
* [`ably apps channel-rules delete NAMEORID`](#ably-apps-channel-rules-delete-nameorid)
* [`ably apps channel-rules list`](#ably-apps-channel-rules-list)
* [`ably apps channel-rules update NAMEORID`](#ably-apps-channel-rules-update-nameorid)
* [`ably apps create`](#ably-apps-create)
* [`ably apps current`](#ably-apps-current)
* [`ably apps delete [ID]`](#ably-apps-delete-id)
* [`ably apps list`](#ably-apps-list)
* [`ably apps logs`](#ably-apps-logs)
* [`ably apps logs history`](#ably-apps-logs-history)
* [`ably apps logs subscribe`](#ably-apps-logs-subscribe)
* [`ably apps set-apns-p12 ID`](#ably-apps-set-apns-p12-id)
* [`ably apps stats [ID]`](#ably-apps-stats-id)
* [`ably apps switch [APPID]`](#ably-apps-switch-appid)
* [`ably apps update ID`](#ably-apps-update-id)
* [`ably auth`](#ably-auth)
* [`ably auth issue-ably-token`](#ably-auth-issue-ably-token)
* [`ably auth issue-jwt-token`](#ably-auth-issue-jwt-token)
* [`ably auth keys`](#ably-auth-keys)
* [`ably auth keys create`](#ably-auth-keys-create)
* [`ably auth keys current`](#ably-auth-keys-current)
* [`ably auth keys get KEYNAMEORVALUE`](#ably-auth-keys-get-keynameorvalue)
* [`ably auth keys list`](#ably-auth-keys-list)
* [`ably auth keys revoke KEYNAME`](#ably-auth-keys-revoke-keyname)
* [`ably auth keys switch [KEYNAMEORVALUE]`](#ably-auth-keys-switch-keynameorvalue)
* [`ably auth keys update KEYNAME`](#ably-auth-keys-update-keyname)
* [`ably auth revoke-token TOKEN`](#ably-auth-revoke-token-token)
* [`ably bench`](#ably-bench)
* [`ably bench publisher CHANNEL`](#ably-bench-publisher-channel)
* [`ably bench subscriber CHANNEL`](#ably-bench-subscriber-channel)
* [`ably channels`](#ably-channels)
* [`ably channels batch-publish [MESSAGE]`](#ably-channels-batch-publish-message)
* [`ably channels history CHANNEL`](#ably-channels-history-channel)
* [`ably channels list`](#ably-channels-list)
* [`ably channels logs [TOPIC]`](#ably-channels-logs-topic)
* [`ably channels occupancy`](#ably-channels-occupancy)
* [`ably channels occupancy get CHANNEL`](#ably-channels-occupancy-get-channel)
* [`ably channels occupancy subscribe CHANNEL`](#ably-channels-occupancy-subscribe-channel)
* [`ably channels presence`](#ably-channels-presence)
* [`ably channels presence enter CHANNEL`](#ably-channels-presence-enter-channel)
* [`ably channels presence subscribe CHANNEL`](#ably-channels-presence-subscribe-channel)
* [`ably channels publish CHANNEL MESSAGE`](#ably-channels-publish-channel-message)
* [`ably channels subscribe CHANNELS`](#ably-channels-subscribe-channels)
* [`ably config`](#ably-config)
* [`ably connections`](#ably-connections)
* [`ably connections logs [TOPIC]`](#ably-connections-logs-topic)
* [`ably connections stats`](#ably-connections-stats)
* [`ably connections test`](#ably-connections-test)
* [`ably integrations`](#ably-integrations)
* [`ably integrations create`](#ably-integrations-create)
* [`ably integrations delete RULEID`](#ably-integrations-delete-ruleid)
* [`ably integrations get RULEID`](#ably-integrations-get-ruleid)
* [`ably integrations list`](#ably-integrations-list)
* [`ably integrations update RULEID`](#ably-integrations-update-ruleid)
* [`ably login [TOKEN]`](#ably-login-token)
* [`ably logs`](#ably-logs)
* [`ably logs app`](#ably-logs-app)
* [`ably logs app history`](#ably-logs-app-history)
* [`ably logs app subscribe`](#ably-logs-app-subscribe)
* [`ably logs channel-lifecycle`](#ably-logs-channel-lifecycle)
* [`ably logs channel-lifecycle subscribe`](#ably-logs-channel-lifecycle-subscribe)
* [`ably logs connection-lifecycle`](#ably-logs-connection-lifecycle)
* [`ably logs connection-lifecycle history`](#ably-logs-connection-lifecycle-history)
* [`ably logs connection-lifecycle subscribe`](#ably-logs-connection-lifecycle-subscribe)
* [`ably logs push`](#ably-logs-push)
* [`ably logs push history`](#ably-logs-push-history)
* [`ably logs push subscribe`](#ably-logs-push-subscribe)
* [`ably queues`](#ably-queues)
* [`ably queues create`](#ably-queues-create)
* [`ably queues delete QUEUENAME`](#ably-queues-delete-queuename)
* [`ably queues list`](#ably-queues-list)
* [`ably rooms`](#ably-rooms)
* [`ably rooms list`](#ably-rooms-list)
* [`ably rooms messages`](#ably-rooms-messages)
* [`ably rooms messages get ROOMID`](#ably-rooms-messages-get-roomid)
* [`ably rooms messages send ROOMID TEXT`](#ably-rooms-messages-send-roomid-text)
* [`ably rooms messages subscribe ROOMID`](#ably-rooms-messages-subscribe-roomid)
* [`ably rooms occupancy`](#ably-rooms-occupancy)
* [`ably rooms occupancy get ROOMID`](#ably-rooms-occupancy-get-roomid)
* [`ably rooms occupancy subscribe ROOMID`](#ably-rooms-occupancy-subscribe-roomid)
* [`ably rooms presence`](#ably-rooms-presence)
* [`ably rooms presence enter ROOMID`](#ably-rooms-presence-enter-roomid)
* [`ably rooms presence subscribe ROOMID`](#ably-rooms-presence-subscribe-roomid)
* [`ably rooms reactions`](#ably-rooms-reactions)
* [`ably rooms reactions send ROOMID TYPE`](#ably-rooms-reactions-send-roomid-type)
* [`ably rooms reactions subscribe ROOMID`](#ably-rooms-reactions-subscribe-roomid)
* [`ably rooms typing`](#ably-rooms-typing)
* [`ably rooms typing start ROOMID`](#ably-rooms-typing-start-roomid)
* [`ably rooms typing subscribe ROOMID`](#ably-rooms-typing-subscribe-roomid)
* [`ably spaces`](#ably-spaces)
* [`ably spaces cursors`](#ably-spaces-cursors)
* [`ably spaces cursors set SPACEID`](#ably-spaces-cursors-set-spaceid)
* [`ably spaces cursors subscribe SPACEID`](#ably-spaces-cursors-subscribe-spaceid)
* [`ably spaces locations`](#ably-spaces-locations)
* [`ably spaces locations get-all SPACEID`](#ably-spaces-locations-get-all-spaceid)
* [`ably spaces locations set SPACEID`](#ably-spaces-locations-set-spaceid)
* [`ably spaces locations subscribe SPACEID`](#ably-spaces-locations-subscribe-spaceid)
* [`ably spaces locks`](#ably-spaces-locks)
* [`ably spaces locks acquire SPACEID LOCKID`](#ably-spaces-locks-acquire-spaceid-lockid)
* [`ably spaces locks get SPACEID LOCKID`](#ably-spaces-locks-get-spaceid-lockid)
* [`ably spaces locks get-all SPACEID`](#ably-spaces-locks-get-all-spaceid)
* [`ably spaces locks subscribe SPACEID`](#ably-spaces-locks-subscribe-spaceid)
* [`ably spaces members`](#ably-spaces-members)
* [`ably spaces members enter SPACEID`](#ably-spaces-members-enter-spaceid)
* [`ably spaces members subscribe SPACEID`](#ably-spaces-members-subscribe-spaceid)

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

_See code: [src/commands/accounts/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/accounts/index.ts)_

## `ably accounts current`

Show the current Ably account

```
USAGE
  $ ably accounts current [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Show the current Ably account

EXAMPLES
  $ ably accounts current
```

_See code: [src/commands/accounts/current.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/accounts/current.ts)_

## `ably accounts list`

List locally configured Ably accounts

```
USAGE
  $ ably accounts list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  List locally configured Ably accounts

EXAMPLES
  $ ably accounts list
```

_See code: [src/commands/accounts/list.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/accounts/list.ts)_

## `ably accounts login [TOKEN]`

Log in to your Ably account

```
USAGE
  $ ably accounts login [TOKEN] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-a <value>] [--no-browser]

ARGUMENTS
  TOKEN  Access token (if not provided, will prompt for it)

FLAGS
  -a, --alias=<value>         Alias for this account (default account if not specified)
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --no-browser            Do not open a browser
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Log in to your Ably account

EXAMPLES
  $ ably accounts login

  $ ably accounts login --alias mycompany
```

_See code: [src/commands/accounts/login.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/accounts/login.ts)_

## `ably accounts logout [ALIAS]`

Log out from an Ably account

```
USAGE
  $ ably accounts logout [ALIAS] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-f]

ARGUMENTS
  ALIAS  Alias of the account to log out from (defaults to current account)

FLAGS
  -f, --force                 Force logout without confirmation
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Log out from an Ably account

EXAMPLES
  $ ably accounts logout

  $ ably accounts logout mycompany
```

_See code: [src/commands/accounts/logout.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/accounts/logout.ts)_

## `ably accounts stats`

Get account stats with optional live updates

```
USAGE
  $ ably accounts stats [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--start <value>] [--end <value>] [--unit
    minute|hour|day|month] [--limit <value>] [--format json|pretty] [--live] [--interval <value>]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --end=<value>           End time in milliseconds since epoch
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --interval=<value>      [default: 6] Polling interval in seconds (only used with --live)
  --limit=<value>         [default: 10] Maximum number of stats records to return
  --live                  Subscribe to live stats updates (uses minute interval)
  --start=<value>         Start time in milliseconds since epoch
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key
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

_See code: [src/commands/accounts/stats/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/accounts/stats/index.ts)_

## `ably accounts switch [ALIAS]`

Switch to a different Ably account

```
USAGE
  $ ably accounts switch [ALIAS] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>]

ARGUMENTS
  ALIAS  Alias of the account to switch to

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Switch to a different Ably account

EXAMPLES
  $ ably accounts switch

  $ ably accounts switch mycompany
```

_See code: [src/commands/accounts/switch.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/accounts/switch.ts)_

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

_See code: [src/commands/apps/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/index.ts)_

## `ably apps channel-rules`

Manage Ably channel rules (namespaces)

```
USAGE
  $ ably apps channel-rules

DESCRIPTION
  Manage Ably channel rules (namespaces)

EXAMPLES
  $ ably apps channel-rules list

  $ ably apps channel-rules create --name "chat" --persisted

  $ ably apps channel-rules update chat --push-enabled

  $ ably apps channel-rules delete chat
```

_See code: [src/commands/apps/channel-rules/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/channel-rules/index.ts)_

## `ably apps channel-rules create`

Create a channel rule

```
USAGE
  $ ably apps channel-rules create --name <value> [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--persisted] [--push-enabled]
    [--authenticated] [--persist-last] [--expose-time-serial] [--populate-channel-registry] [--batching-enabled]
    [--batching-interval <value>] [--conflation-enabled] [--conflation-interval <value>] [--conflation-key <value>]
    [--tls-only] [--app <value>] [--format json|pretty]

FLAGS
  --access-token=<value>         Overrides any configured access token used for the Control API
  --api-key=<value>              Overrides any configured API key used for the product APIs
  --app=<value>                  App ID or name to create the channel rule in
  --authenticated                Whether channels matching this rule require clients to be authenticated
  --batching-enabled             Whether to enable batching for messages on channels matching this rule
  --batching-interval=<value>    The batching interval for messages on channels matching this rule
  --client-id=<value>            Overrides any default client ID when using API authentication. Use "none" to explicitly
                                 set no client ID. Not applicable when using token authentication.
  --conflation-enabled           Whether to enable conflation for messages on channels matching this rule
  --conflation-interval=<value>  The conflation interval for messages on channels matching this rule
  --conflation-key=<value>       The conflation key for messages on channels matching this rule
  --control-host=<value>         Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>                  Override the environment for all product API calls
  --expose-time-serial           Whether to expose the time serial for messages on channels matching this rule
  --format=<option>              [default: pretty] Output format (json or pretty)
                                 <options: json|pretty>
  --host=<value>                 Override the host endpoint for all product API calls
  --name=<value>                 (required) Name of the channel rule
  --persist-last                 Whether to persist only the last message on channels matching this rule
  --persisted                    Whether messages on channels matching this rule should be persisted
  --populate-channel-registry    Whether to populate the channel registry for channels matching this rule
  --push-enabled                 Whether push notifications should be enabled for channels matching this rule
  --tls-only                     Whether to enforce TLS for channels matching this rule
  --token=<value>                Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Create a channel rule

EXAMPLES
  $ ably apps channel-rules create --name "chat" --persisted

  $ ably apps channel-rules create --name "events" --push-enabled

  $ ably apps channel-rules create --name "notifications" --persisted --push-enabled --app "My App"
```

_See code: [src/commands/apps/channel-rules/create.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/channel-rules/create.ts)_

## `ably apps channel-rules delete NAMEORID`

Delete a channel rule

```
USAGE
  $ ably apps channel-rules delete NAMEORID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [-f]

ARGUMENTS
  NAMEORID  Name or ID of the channel rule to delete

FLAGS
  -f, --force                 Force deletion without confirmation
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --app=<value>           App ID or name to delete the channel rule from
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Delete a channel rule

EXAMPLES
  $ ably apps channel-rules delete chat

  $ ably apps channel-rules delete events --app "My App"

  $ ably apps channel-rules delete notifications --force
```

_See code: [src/commands/apps/channel-rules/delete.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/channel-rules/delete.ts)_

## `ably apps channel-rules list`

List all channel rules

```
USAGE
  $ ably apps channel-rules list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty] [--app <value>]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID or name to list channel rules for
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  List all channel rules

EXAMPLES
  $ ably apps channel-rules list

  $ ably apps channel-rules list --app "My App" --format json
```

_See code: [src/commands/apps/channel-rules/list.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/channel-rules/list.ts)_

## `ably apps channel-rules update NAMEORID`

Update a channel rule

```
USAGE
  $ ably apps channel-rules update NAMEORID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--persisted] [--push-enabled] [--authenticated]
    [--persist-last] [--expose-time-serial] [--populate-channel-registry] [--batching-enabled] [--batching-interval
    <value>] [--conflation-enabled] [--conflation-interval <value>] [--conflation-key <value>] [--tls-only] [--app
    <value>] [--format json|pretty]

ARGUMENTS
  NAMEORID  Name or ID of the channel rule to update

FLAGS
  --access-token=<value>            Overrides any configured access token used for the Control API
  --api-key=<value>                 Overrides any configured API key used for the product APIs
  --app=<value>                     App ID or name to update the channel rule in
  --[no-]authenticated              Whether channels matching this rule require clients to be authenticated
  --[no-]batching-enabled           Whether to enable batching for messages on channels matching this rule
  --batching-interval=<value>       The batching interval for messages on channels matching this rule
  --client-id=<value>               Overrides any default client ID when using API authentication. Use "none" to
                                    explicitly set no client ID. Not applicable when using token authentication.
  --[no-]conflation-enabled         Whether to enable conflation for messages on channels matching this rule
  --conflation-interval=<value>     The conflation interval for messages on channels matching this rule
  --conflation-key=<value>          The conflation key for messages on channels matching this rule
  --control-host=<value>            Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>                     Override the environment for all product API calls
  --[no-]expose-time-serial         Whether to expose the time serial for messages on channels matching this rule
  --format=<option>                 [default: pretty] Output format (json or pretty)
                                    <options: json|pretty>
  --host=<value>                    Override the host endpoint for all product API calls
  --[no-]persist-last               Whether to persist only the last message on channels matching this rule
  --[no-]persisted                  Whether messages on channels matching this rule should be persisted
  --[no-]populate-channel-registry  Whether to populate the channel registry for channels matching this rule
  --[no-]push-enabled               Whether push notifications should be enabled for channels matching this rule
  --[no-]tls-only                   Whether to enforce TLS for channels matching this rule
  --token=<value>                   Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Update a channel rule

EXAMPLES
  $ ably apps channel-rules update chat --persisted

  $ ably apps channel-rules update events --push-enabled=false

  $ ably apps channel-rules update notifications --persisted --push-enabled --app "My App"
```

_See code: [src/commands/apps/channel-rules/update.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/channel-rules/update.ts)_

## `ably apps create`

Create a new app

```
USAGE
  $ ably apps create --name <value> [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--tls-only] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --name=<value>          (required) Name of the app
  --tls-only              Whether the app should accept TLS connections only
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Create a new app

EXAMPLES
  $ ably apps create --name "My New App"

  $ ably apps create --name "My New App" --tls-only

  $ ably apps create --name "My New App" --access-token "YOUR_ACCESS_TOKEN"
```

_See code: [src/commands/apps/create.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/create.ts)_

## `ably apps current`

Show the currently selected app

```
USAGE
  $ ably apps current [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Show the currently selected app

EXAMPLES
  $ ably apps current

  $ ably apps current --format json
```

_See code: [src/commands/apps/current.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/current.ts)_

## `ably apps delete [ID]`

Delete an app

```
USAGE
  $ ably apps delete [ID] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-f]

ARGUMENTS
  ID  App ID to delete (uses current app if not specified)

FLAGS
  -f, --force                 Skip confirmation prompt
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Delete an app

EXAMPLES
  $ ably apps delete

  $ ably apps delete app-id

  $ ably apps delete app-id --access-token "YOUR_ACCESS_TOKEN"

  $ ably apps delete app-id --force
```

_See code: [src/commands/apps/delete.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/delete.ts)_

## `ably apps list`

List all apps

```
USAGE
  $ ably apps list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  List all apps

EXAMPLES
  $ ably apps list

  $ ably apps list --access-token "YOUR_ACCESS_TOKEN"

  $ ably apps list --format json
```

_See code: [src/commands/apps/list.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/list.ts)_

## `ably apps logs`

Stream or retrieve app logs

```
USAGE
  $ ably apps logs

DESCRIPTION
  Stream or retrieve app logs

EXAMPLES
  $ ably apps logs subscribe

  $ ably apps logs subscribe --rewind 10

  $ ably apps logs history
```

_See code: [src/commands/apps/logs/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/logs/index.ts)_

## `ably apps logs history`

Alias for `ably logs app history`

```
USAGE
  $ ably apps logs history [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--limit <value>] [--direction backwards|forwards]
    [--json]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --direction=<option>    [default: backwards] Direction of message retrieval
                          <options: backwards|forwards>
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results in JSON format
  --limit=<value>         [default: 100] Maximum number of messages to retrieve
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Alias for `ably logs app history`

EXAMPLES
  $ ably apps logs history

  $ ably apps logs history --limit 20

  $ ably apps logs history --direction forwards

  $ ably apps logs history --json
```

_See code: [src/commands/apps/logs/history.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/logs/history.ts)_

## `ably apps logs subscribe`

Alias for ably logs app subscribe

```
USAGE
  $ ably apps logs subscribe [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--rewind <value>] [--json]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results as JSON
  --rewind=<value>        Number of messages to rewind when subscribing
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Alias for ably logs app subscribe

EXAMPLES
  $ ably apps logs subscribe

  $ ably apps logs subscribe --rewind 10
```

_See code: [src/commands/apps/logs/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/logs/subscribe.ts)_

## `ably apps set-apns-p12 ID`

Upload Apple Push Notification Service P12 certificate for an app

```
USAGE
  $ ably apps set-apns-p12 ID --certificate <value> [--host <value>] [--env <value>] [--control-host <value>]
    [--access-token <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--password <value>]
    [--use-for-sandbox] [--format json|pretty]

ARGUMENTS
  ID  App ID to set the APNS certificate for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --certificate=<value>   (required) Path to the P12 certificate file
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --password=<value>      Password for the P12 certificate
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key
  --use-for-sandbox       Whether to use this certificate for the APNS sandbox environment

DESCRIPTION
  Upload Apple Push Notification Service P12 certificate for an app

EXAMPLES
  $ ably apps set-apns-p12 app-id --certificate /path/to/certificate.p12

  $ ably apps set-apns-p12 app-id --certificate /path/to/certificate.p12 --password "YOUR_CERTIFICATE_PASSWORD"

  $ ably apps set-apns-p12 app-id --certificate /path/to/certificate.p12 --use-for-sandbox
```

_See code: [src/commands/apps/set-apns-p12.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/set-apns-p12.ts)_

## `ably apps stats [ID]`

Get app stats with optional live updates

```
USAGE
  $ ably apps stats [ID] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--start <value>] [--end <value>] [--unit
    minute|hour|day|month] [--limit <value>] [--format json|pretty] [--live] [--interval <value>]

ARGUMENTS
  ID  App ID to get stats for (uses default app if not provided)

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --end=<value>           End time in milliseconds since epoch
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --interval=<value>      [default: 6] Polling interval in seconds (only used with --live)
  --limit=<value>         [default: 10] Maximum number of stats records to return
  --live                  Subscribe to live stats updates (uses minute interval)
  --start=<value>         Start time in milliseconds since epoch
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key
  --unit=<option>         [default: minute] Time unit for stats
                          <options: minute|hour|day|month>

DESCRIPTION
  Get app stats with optional live updates

EXAMPLES
  $ ably apps stats

  $ ably apps stats app-id

  $ ably apps stats --unit hour

  $ ably apps stats app-id --unit hour

  $ ably apps stats app-id --start 1618005600000 --end 1618091999999

  $ ably apps stats app-id --limit 10

  $ ably apps stats app-id --format json

  $ ably apps stats --live

  $ ably apps stats app-id --live

  $ ably apps stats --live --interval 15
```

_See code: [src/commands/apps/stats/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/stats/index.ts)_

## `ably apps switch [APPID]`

Switch to a different Ably app

```
USAGE
  $ ably apps switch [APPID] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>]

ARGUMENTS
  APPID  ID of the app to switch to

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Switch to a different Ably app

EXAMPLES
  $ ably apps switch APP_ID

  $ ably apps switch
```

_See code: [src/commands/apps/switch.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/switch.ts)_

## `ably apps update ID`

Update an app

```
USAGE
  $ ably apps update ID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--name <value>] [--tls-only] [--format json|pretty]

ARGUMENTS
  ID  App ID to update

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --name=<value>          New name for the app
  --tls-only              Whether the app should accept TLS connections only
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Update an app

EXAMPLES
  $ ably apps update app-id --name "Updated App Name"

  $ ably apps update app-id --tls-only

  $ ably apps update app-id --name "Updated App Name" --tls-only

  $ ably apps update app-id --name "Updated App Name" --access-token "YOUR_ACCESS_TOKEN"
```

_See code: [src/commands/apps/update.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/apps/update.ts)_

## `ably auth`

Authentication for Ably including key management and token generation

```
USAGE
  $ ably auth

DESCRIPTION
  Authentication for Ably including key management and token generation

EXAMPLES
  $ ably auth keys list

  $ ably auth keys get KEY_ID

  $ ably auth keys revoke KEY_ID

  $ ably auth keys update KEY_ID

  $ ably auth keys switch KEY_ID

  $ ably auth issue-jwt-token

  $ ably auth issue-ably-token

  $ ably auth revoke-token TOKEN
```

_See code: [src/commands/auth/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/index.ts)_

## `ably auth issue-ably-token`

Creates an Ably Token with capabilities

```
USAGE
  $ ably auth issue-ably-token [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [--capability <value>] [--ttl <value>]
    [--format json|pretty] [--token-only]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID to use (uses current app if not specified)
  --capability=<value>    [default: {"*":["*"]}] Capabilities JSON string (e.g. {"channel":["publish","subscribe"]})
  --client-id=<value>     Client ID to associate with the token. Use "none" to explicitly issue a token with no client
                          ID, otherwise a default will be generated.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key
  --token-only            Output only the token string without any formatting or additional information
  --ttl=<value>           [default: 3600] Time to live in seconds

DESCRIPTION
  Creates an Ably Token with capabilities

EXAMPLES
  $ ably auth issue-ably-token

  $ ably auth issue-ably-token --capability '{"*":["*"]}'

  $ ably auth issue-ably-token --client-id "client123" --ttl 3600

  $ ably auth issue-ably-token --client-id "none" --ttl 3600

  $ ably auth issue-ably-token --format json

  $ ably auth issue-ably-token --token-only

  $ ably channels publish --token "$(ably auth issue-ably-token --token-only)" my-channel "Hello"
```

_See code: [src/commands/auth/issue-ably-token.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/issue-ably-token.ts)_

## `ably auth issue-jwt-token`

Creates an Ably JWT token with capabilities

```
USAGE
  $ ably auth issue-jwt-token [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [--capability <value>] [--ttl <value>]
    [--format json|pretty] [--token-only]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID to use (uses current app if not specified)
  --capability=<value>    [default: {"*":["*"]}] Capabilities JSON string (e.g. {"channel":["publish","subscribe"]})
  --client-id=<value>     Client ID to associate with the token. Use "none" to explicitly issue a token with no client
                          ID, otherwise a default will be generated.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key
  --token-only            Output only the token string without any formatting or additional information
  --ttl=<value>           [default: 3600] Time to live in seconds

DESCRIPTION
  Creates an Ably JWT token with capabilities

EXAMPLES
  $ ably auth issue-jwt-token

  $ ably auth issue-jwt-token --capability '{"*":["*"]}'

  $ ably auth issue-jwt-token --client-id "client123" --ttl 3600

  $ ably auth issue-jwt-token --client-id "none" --ttl 3600

  $ ably auth issue-jwt-token --format json

  $ ably auth issue-jwt-token --token-only

  $ ably channels publish --token "$(ably auth issue-jwt-token --token-only)" my-channel "Hello"
```

_See code: [src/commands/auth/issue-jwt-token.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/issue-jwt-token.ts)_

## `ably auth keys`

Key management commands

```
USAGE
  $ ably auth keys

DESCRIPTION
  Key management commands

EXAMPLES
  $ ably auth keys list

  $ ably auth keys create --name "My New Key"

  $ ably auth keys get KEY_ID

  $ ably auth keys revoke KEY_ID

  $ ably auth keys update KEY_ID

  $ ably auth keys switch KEY_ID
```

_See code: [src/commands/auth/keys/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/keys/index.ts)_

## `ably auth keys create`

Create a new API key for an app

```
USAGE
  $ ably auth keys create --name <value> [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [--capabilities <value>]
    [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID the key belongs to (uses current app if not specified)
  --capabilities=<value>  [default: {"*":["*"]}] JSON string of capabilities for the key, e.g. "{\"*\":[\"*\"]}"
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --name=<value>          (required) Name of the key
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Create a new API key for an app

EXAMPLES
  $ ably auth keys create --name "My New Key"

  $ ably auth keys create --name "My New Key" --app APP_ID

  $ ably auth keys create --name "My New Key" --capabilities "{\"*\":[\"*\"]}"

  $ ably auth keys create --name "My New Key" --capabilities "{\"channel1\":[\"publish\",\"subscribe\"],\"channel2\":[\"history\"]}"
```

_See code: [src/commands/auth/keys/create.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/keys/create.ts)_

## `ably auth keys current`

Show the current API key for the selected app

```
USAGE
  $ ably auth keys current [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID to check key for (uses current app if not specified)
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Show the current API key for the selected app

EXAMPLES
  $ ably auth keys current

  $ ably auth keys current --app APP_ID

  $ ably auth keys current --format json
```

_See code: [src/commands/auth/keys/current.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/keys/current.ts)_

## `ably auth keys get KEYNAMEORVALUE`

Get details for a specific key

```
USAGE
  $ ably auth keys get KEYNAMEORVALUE [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [--format json|pretty]

ARGUMENTS
  KEYNAMEORVALUE  Key name (APP_ID.KEY_ID) or full value of the key to get details for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID the key belongs to (uses current app if not specified)
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Get details for a specific key

EXAMPLES
  $ ably auth keys get APP_ID.KEY_ID

  $ ably auth keys get KEY_ID --app APP_ID

  $ ably auth keys get APP_ID.KEY_ID --format json
```

_See code: [src/commands/auth/keys/get.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/keys/get.ts)_

## `ably auth keys list`

List all keys in the app

```
USAGE
  $ ably auth keys list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID to list keys for (uses current app if not specified)
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  List all keys in the app

EXAMPLES
  $ ably auth keys list

  $ ably auth keys list --app APP_ID

  $ ably auth keys list --format json
```

_See code: [src/commands/auth/keys/list.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/keys/list.ts)_

## `ably auth keys revoke KEYNAME`

Revoke an API key (permanently disables the key)

```
USAGE
  $ ably auth keys revoke KEYNAME [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [--force]

ARGUMENTS
  KEYNAME  Key name (APP_ID.KEY_ID) of the key to revoke

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID the key belongs to (uses current app if not specified)
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --force                 Skip confirmation prompt
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Revoke an API key (permanently disables the key)

EXAMPLES
  $ ably auth keys revoke APP_ID.KEY_ID

  $ ably auth keys revoke KEY_ID --app APP_ID

  $ ably auth keys revoke APP_ID.KEY_ID --force
```

_See code: [src/commands/auth/keys/revoke.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/keys/revoke.ts)_

## `ably auth keys switch [KEYNAMEORVALUE]`

Switch to a different API key for the current app

```
USAGE
  $ ably auth keys switch [KEYNAMEORVALUE] [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>]

ARGUMENTS
  KEYNAMEORVALUE  Key name (APP_ID.KEY_ID) or full value of the key to switch to

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID to switch keys for (uses current app if not specified)
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Switch to a different API key for the current app

EXAMPLES
  $ ably auth keys switch

  $ ably auth keys switch APP_ID.KEY_ID

  $ ably auth keys switch KEY_ID --app APP_ID
```

_See code: [src/commands/auth/keys/switch.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/keys/switch.ts)_

## `ably auth keys update KEYNAME`

Update a key's properties

```
USAGE
  $ ably auth keys update KEYNAME [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [--name <value>] [--capabilities
    <value>]

ARGUMENTS
  KEYNAME  Key name (APP_ID.KEY_ID) of the key to update

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID the key belongs to (uses current app if not specified)
  --capabilities=<value>  New capabilities for the key (comma-separated list)
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --name=<value>          New name for the key
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Update a key's properties

EXAMPLES
  $ ably auth keys update APP_ID.KEY_ID --name "New Name"

  $ ably auth keys update KEY_ID --app APP_ID --capabilities "publish,subscribe"

  $ ably auth keys update APP_ID.KEY_ID --name "New Name" --capabilities "publish,subscribe"
```

_See code: [src/commands/auth/keys/update.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/keys/update.ts)_

## `ably auth revoke-token TOKEN`

Revokes the token provided

```
USAGE
  $ ably auth revoke-token TOKEN [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [-c <value>] [--app <value>] [--format json|pretty] [--debug]

ARGUMENTS
  TOKEN  Token to revoke

FLAGS
  -c, --client-id=<value>     Client ID to revoke tokens for
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --app=<value>           App ID to use (uses current app if not specified)
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --debug                 Show debug information
      --env=<value>           Override the environment for all product API calls
      --format=<option>       [default: pretty] Output format (json or pretty)
                              <options: json|pretty>
      --host=<value>          Override the host endpoint for all product API calls
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Revokes the token provided

EXAMPLES
  $ ably auth revoke-token TOKEN

  $ ably auth revoke-token TOKEN --client-id clientid

  $ ably auth revoke-token TOKEN --format json
```

_See code: [src/commands/auth/revoke-token.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/auth/revoke-token.ts)_

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

_See code: [src/commands/bench/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/bench/index.ts)_

## `ably bench publisher CHANNEL`

Run a publisher benchmark test

```
USAGE
  $ ably bench publisher CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-m <value>] [-r <value>] [-t rest|realtime]
    [--wait-for-subscribers] [--message-size <value>]

ARGUMENTS
  CHANNEL  The channel name to publish to

FLAGS
  -m, --messages=<value>      [default: 1000] Number of messages to publish (max 10,000)
  -r, --rate=<value>          [default: 15] Messages per second to publish (max 20)
  -t, --transport=<option>    [default: realtime] Transport to use for publishing
                              <options: rest|realtime>
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --message-size=<value>  [default: 100] Size of the message payload in bytes
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key
      --wait-for-subscribers  Wait for subscribers to be present before starting

DESCRIPTION
  Run a publisher benchmark test

EXAMPLES
  $ ably bench publisher my-channel

  $ ably bench publisher --messages 5000 --rate 10 my-channel

  $ ably bench publisher --transport realtime my-channel
```

_See code: [src/commands/bench/publisher.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/bench/publisher.ts)_

## `ably bench subscriber CHANNEL`

Run a subscriber benchmark test

```
USAGE
  $ ably bench subscriber CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-t rest|realtime]

ARGUMENTS
  CHANNEL  The channel name to subscribe to

FLAGS
  -t, --transport=<option>    [default: realtime] Transport to use for subscribing
                              <options: rest|realtime>
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Run a subscriber benchmark test

EXAMPLES
  $ ably bench subscriber my-channel

  $ ably bench subscriber --transport realtime my-channel
```

_See code: [src/commands/bench/subscriber.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/bench/subscriber.ts)_

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

_See code: [src/commands/channels/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/index.ts)_

## `ably channels batch-publish [MESSAGE]`

Publish messages to multiple Ably channels with a single request

```
USAGE
  $ ably channels batch-publish [MESSAGE] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--channels <value> | --channels-json <value> | --spec
    <value>] [-n <value> | ] [-e <value> | ]

ARGUMENTS
  MESSAGE  The message to publish (JSON format or plain text, not needed if using --spec)

FLAGS
  -e, --encoding=<value>       The encoding for the message
  -n, --name=<value>           The event name (if not specified in the message JSON)
      --access-token=<value>   Overrides any configured access token used for the Control API
      --api-key=<value>        Overrides any configured API key used for the product APIs
      --channels=<value>       Comma-separated list of channel names to publish to
      --channels-json=<value>  JSON array of channel names to publish to
      --client-id=<value>      Overrides any default client ID when using API authentication. Use "none" to explicitly
                               set no client ID. Not applicable when using token authentication.
      --control-host=<value>   Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>            Override the environment for all product API calls
      --host=<value>           Override the host endpoint for all product API calls
      --spec=<value>           Complete batch spec JSON (either a single BatchSpec object or an array of BatchSpec
                               objects)
      --token=<value>          Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Publish messages to multiple Ably channels with a single request

EXAMPLES
  $ ably channels batch-publish --channels channel1,channel2 '{"data":"Message to multiple channels"}'

  $ ably channels batch-publish --channels channel1,channel2 --name event '{"text":"Hello World"}'

  $ ably channels batch-publish --channels-json '["channel1", "channel2"]' '{"data":"Using JSON array for channels"}'

  $ ably channels batch-publish --spec '{"channels": ["channel1", "channel2"], "messages": {"data": "Using complete batch spec"}}'

  $ ably channels batch-publish --spec '[{"channels": "channel1", "messages": {"data": "First spec"}}, {"channels": "channel2", "messages": {"data": "Second spec"}}]'
```

_See code: [src/commands/channels/batch-publish.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/batch-publish.ts)_

## `ably channels history CHANNEL`

Retrieve message history for a channel

```
USAGE
  $ ably channels history CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--limit <value>] [--direction backwards|forwards]
    [--format json|pretty] [--start <value>] [--end <value>] [--cipher <value>]

ARGUMENTS
  CHANNEL  Channel name to retrieve history for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --cipher=<value>        Decryption key for encrypted messages (AES-128)
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --direction=<option>    [default: backwards] Direction of message retrieval
                          <options: backwards|forwards>
  --end=<value>           End time for the history query (ISO 8601 format)
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --limit=<value>         [default: 50] Maximum number of messages to retrieve
  --start=<value>         Start time for the history query (ISO 8601 format)
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Retrieve message history for a channel

EXAMPLES
  $ ably channels history my-channel

  $ ably channels history my-channel --limit 50

  $ ably channels history my-channel --direction forwards

  $ ably channels history my-channel --format json

  $ ably channels history my-channel --start "2023-01-01T00:00:00Z" --end "2023-01-02T00:00:00Z"
```

_See code: [src/commands/channels/history.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/history.ts)_

## `ably channels list`

List active channels using the channel enumeration API

```
USAGE
  $ ably channels list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-p <value>] [--limit <value>] [--format json|pretty]

FLAGS
  -p, --prefix=<value>        Filter channels by prefix
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --format=<option>       [default: pretty] Output format (json or pretty)
                              <options: json|pretty>
      --host=<value>          Override the host endpoint for all product API calls
      --limit=<value>         [default: 100] Maximum number of channels to return
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  List active channels using the channel enumeration API

EXAMPLES
  $ ably channels list

  $ ably channels list --prefix my-channel

  $ ably channels list --limit 50

  $ ably channels list --format json
```

_See code: [src/commands/channels/list.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/list.ts)_

## `ably channels logs [TOPIC]`

Alias for ably logs channel-lifecycle subscribe

```
USAGE
  $ ably channels logs [TOPIC] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--rewind <value>] [--json]

ARGUMENTS
  TOPIC  [default: channel-lifecycle] Log topic to subscribe to (currently only channel-lifecycle is supported)

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results as JSON
  --rewind=<value>        Number of messages to rewind when subscribing
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Alias for ably logs channel-lifecycle subscribe

EXAMPLES
  $ ably channels logs channel-lifecycle

  $ ably channels logs channel-lifecycle --rewind 10
```

_See code: [src/commands/channels/logs.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/logs.ts)_

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

_See code: [src/commands/channels/occupancy.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/occupancy.ts)_

## `ably channels occupancy get CHANNEL`

Get current occupancy metrics for a channel

```
USAGE
  $ ably channels occupancy get CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  CHANNEL  Channel name to get occupancy for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Get current occupancy metrics for a channel

EXAMPLES
  $ ably channels occupancy:get my-channel

  $ ably channels occupancy:get --api-key "YOUR_API_KEY" my-channel
```

_See code: [src/commands/channels/occupancy/get.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/occupancy/get.ts)_

## `ably channels occupancy subscribe CHANNEL`

Subscribe to real-time occupancy metrics for a channel

```
USAGE
  $ ably channels occupancy subscribe CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  CHANNEL  Channel name to subscribe to occupancy for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to real-time occupancy metrics for a channel

EXAMPLES
  $ ably channels occupancy subscribe my-channel

  $ ably channels occupancy subscribe --api-key "YOUR_API_KEY" my-channel

  $ ably channels occupancy subscribe --format json my-channel
```

_See code: [src/commands/channels/occupancy/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/occupancy/subscribe.ts)_

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

_See code: [src/commands/channels/presence.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/presence.ts)_

## `ably channels presence enter CHANNEL`

Enter presence on a channel and remain present until terminated

```
USAGE
  $ ably channels presence enter CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--data <value>] [--show-others]

ARGUMENTS
  CHANNEL  Channel name to enter presence on

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --data=<value>          [default: {}] Presence data to publish (JSON string)
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --show-others           Show other presence events while present
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Enter presence on a channel and remain present until terminated

EXAMPLES
  $ ably channels presence:enter my-channel

  $ ably channels presence:enter my-channel --data '{"status":"online"}'

  $ ably channels presence:enter my-channel --client-id "user123"
```

_See code: [src/commands/channels/presence/enter.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/presence/enter.ts)_

## `ably channels presence subscribe CHANNEL`

Subscribe to presence events on a channel

```
USAGE
  $ ably channels presence subscribe CHANNEL [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  CHANNEL  Channel name to subscribe to presence on

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to presence events on a channel

EXAMPLES
  $ ably channels presence:subscribe my-channel

  $ ably channels presence:subscribe my-channel --format json
```

_See code: [src/commands/channels/presence/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/presence/subscribe.ts)_

## `ably channels publish CHANNEL MESSAGE`

Publish a message to an Ably channel

```
USAGE
  $ ably channels publish CHANNEL MESSAGE [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [-n <value>] [-e <value>] [-c <value>] [-d
    <value>] [--transport rest|realtime]

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
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key
      --transport=<option>    [default: rest] Transport method to use for publishing (rest or realtime)
                              <options: rest|realtime>

DESCRIPTION
  Publish a message to an Ably channel

EXAMPLES
  $ ably channels publish my-channel '{"name":"event","data":"Hello World"}'

  $ ably channels publish --api-key "YOUR_API_KEY" my-channel '{"data":"Simple message"}'

  $ ably channels publish --token "YOUR_ABLY_TOKEN" my-channel '{"data":"Using token auth"}'

  $ ably channels publish --name event my-channel '{"text":"Hello World"}'

  $ ably channels publish my-channel "Hello World"

  $ ably channels publish --name event my-channel "Plain text message"

  $ ably channels publish --count 5 my-channel "Message number {{.Count}}"

  $ ably channels publish --count 10 --delay 1000 my-channel "Message at {{.Timestamp}}"

  $ ably channels publish --transport realtime my-channel "Using realtime transport"
```

_See code: [src/commands/channels/publish.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/publish.ts)_

## `ably channels subscribe CHANNELS`

Subscribe to messages published on one or more Ably channels

```
USAGE
  $ ably channels subscribe CHANNELS... [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--rewind <value>] [--delta] [--cipher-key
    <value>] [--cipher-algorithm <value>] [--cipher-key-length <value>] [--cipher-mode <value>]

ARGUMENTS
  CHANNELS...  Channel name(s) to subscribe to

FLAGS
  --access-token=<value>       Overrides any configured access token used for the Control API
  --api-key=<value>            Overrides any configured API key used for the product APIs
  --cipher-algorithm=<value>   [default: aes] Encryption algorithm to use
  --cipher-key=<value>         Encryption key for decrypting messages (hex-encoded)
  --cipher-key-length=<value>  [default: 256] Length of encryption key in bits
  --cipher-mode=<value>        [default: cbc] Cipher mode to use
  --client-id=<value>          Overrides any default client ID when using API authentication. Use "none" to explicitly
                               set no client ID. Not applicable when using token authentication.
  --control-host=<value>       Override the host endpoint for the control API, which defaults to control.ably.net
  --delta                      Enable delta compression for messages
  --env=<value>                Override the environment for all product API calls
  --host=<value>               Override the host endpoint for all product API calls
  --rewind=<value>             Number of messages to rewind when subscribing
  --token=<value>              Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to messages published on one or more Ably channels

EXAMPLES
  $ ably channels subscribe my-channel

  $ ably channels subscribe my-channel another-channel

  $ ably channels subscribe --api-key "YOUR_API_KEY" my-channel

  $ ably channels subscribe --token "YOUR_ABLY_TOKEN" my-channel

  $ ably channels subscribe --rewind 10 my-channel

  $ ably channels subscribe --delta my-channel

  $ ably channels subscribe --cipher-key YOUR_CIPHER_KEY my-channel
```

_See code: [src/commands/channels/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/channels/subscribe.ts)_

## `ably config`

Open the Ably config file in the default text editor

```
USAGE
  $ ably config [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-e <value>]

FLAGS
  -e, --editor=<value>        Text editor to use (defaults to $EDITOR environment variable)
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Open the Ably config file in the default text editor

EXAMPLES
  $ ably config edit
```

_See code: [src/commands/config.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/config.ts)_

## `ably connections`

Interact with Ably Pub/Sub connections

```
USAGE
  $ ably connections

DESCRIPTION
  Interact with Ably Pub/Sub connections

EXAMPLES
  $ ably connections stats

  $ ably connections logs connections-lifecycle

  $ ably connections test
```

_See code: [src/commands/connections/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/connections/index.ts)_

## `ably connections logs [TOPIC]`

Alias for ably logs connection-lifecycle subscribe

```
USAGE
  $ ably connections logs [TOPIC] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--rewind <value>] [--json]

ARGUMENTS
  TOPIC  [default: connections-lifecycle] Log topic to subscribe to (currently only connections-lifecycle is supported)

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results as JSON
  --rewind=<value>        Number of messages to rewind when subscribing
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Alias for ably logs connection-lifecycle subscribe

EXAMPLES
  $ ably connections logs connections-lifecycle

  $ ably connections logs connections-lifecycle --rewind 10
```

_See code: [src/commands/connections/logs.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/connections/logs.ts)_

## `ably connections stats`

View connection statistics for an Ably app

```
USAGE
  $ ably connections stats [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--start <value>] [--end <value>] [--unit
    minute|hour|day|month] [--limit <value>] [--format json|pretty] [--live] [--interval <value>]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --end=<value>           End time in milliseconds since epoch
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --interval=<value>      [default: 6] Polling interval in seconds (only used with --live)
  --limit=<value>         [default: 10] Maximum number of stats records to return
  --live                  Subscribe to live stats updates (uses minute interval)
  --start=<value>         Start time in milliseconds since epoch
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key
  --unit=<option>         [default: minute] Time unit for stats
                          <options: minute|hour|day|month>

DESCRIPTION
  View connection statistics for an Ably app

EXAMPLES
  $ ably connections stats

  $ ably connections stats --unit hour

  $ ably connections stats --start 1618005600000 --end 1618091999999

  $ ably connections stats --limit 10

  $ ably connections stats --format json

  $ ably connections stats --live
```

_See code: [src/commands/connections/stats.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/connections/stats.ts)_

## `ably connections test`

Test connection to Ably

```
USAGE
  $ ably connections test [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--transport ws|xhr|all]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key
  --transport=<option>    [default: all] Transport protocol to use (ws for WebSockets, xhr for HTTP)
                          <options: ws|xhr|all>

DESCRIPTION
  Test connection to Ably

EXAMPLES
  $ ably connections test

  $ ably connections test --transport ws

  $ ably connections test --transport xhr
```

_See code: [src/commands/connections/test.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/connections/test.ts)_

## `ably integrations`

Manage Ably integrations

```
USAGE
  $ ably integrations

DESCRIPTION
  Manage Ably integrations

EXAMPLES
  $ ably integrations list

  $ ably integrations get rule123

  $ ably integrations create

  $ ably integrations update rule123

  $ ably integrations delete rule123
```

_See code: [src/commands/integrations/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/integrations/index.ts)_

## `ably integrations create`

Create an integration rule

```
USAGE
  $ ably integrations create --rule-type http|amqp|kinesis|firehose|pulsar|kafka|azure|azure-functions|mqtt|cloudmqtt
    --source-type channel.message|channel.presence|channel.lifecycle|presence.message [--host <value>] [--env <value>]
    [--control-host <value>] [--access-token <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--app
    <value>] [--channel-filter <value>] [--request-mode single|batch] [--status enabled|disabled] [--target-url <value>]
    [--format json|pretty]

FLAGS
  --access-token=<value>    Overrides any configured access token used for the Control API
  --api-key=<value>         Overrides any configured API key used for the product APIs
  --app=<value>             App ID or name to create the integration rule in
  --channel-filter=<value>  Channel filter pattern
  --client-id=<value>       Overrides any default client ID when using API authentication. Use "none" to explicitly set
                            no client ID. Not applicable when using token authentication.
  --control-host=<value>    Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>             Override the environment for all product API calls
  --format=<option>         [default: pretty] Output format (json or pretty)
                            <options: json|pretty>
  --host=<value>            Override the host endpoint for all product API calls
  --request-mode=<option>   [default: single] Request mode for the rule
                            <options: single|batch>
  --rule-type=<option>      (required) Type of integration rule (http, amqp, etc.)
                            <options: http|amqp|kinesis|firehose|pulsar|kafka|azure|azure-functions|mqtt|cloudmqtt>
  --source-type=<option>    (required) The event source type
                            <options: channel.message|channel.presence|channel.lifecycle|presence.message>
  --status=<option>         [default: enabled] Initial status of the rule
                            <options: enabled|disabled>
  --target-url=<value>      Target URL for HTTP rules
  --token=<value>           Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Create an integration rule

EXAMPLES
  $ ably integrations create --rule-type "http" --source-type "channel.message" --target-url "https://example.com/webhook"

  $ ably integrations create --rule-type "amqp" --source-type "channel.message" --channel-filter "chat:*"
```

_See code: [src/commands/integrations/create.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/integrations/create.ts)_

## `ably integrations delete RULEID`

Delete an integration rule

```
USAGE
  $ ably integrations delete RULEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [-f]

ARGUMENTS
  RULEID  The rule ID to delete

FLAGS
  -f, --force                 Force deletion without confirmation
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --app=<value>           App ID or name to delete the integration rule from
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Delete an integration rule

EXAMPLES
  $ ably integrations delete rule123

  $ ably integrations delete rule123 --app "My App"

  $ ably integrations delete rule123 --force
```

_See code: [src/commands/integrations/delete.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/integrations/delete.ts)_

## `ably integrations get RULEID`

Get an integration rule by ID

```
USAGE
  $ ably integrations get RULEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty] [--app <value>]

ARGUMENTS
  RULEID  The rule ID to get

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID or name to get the integration rule from
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Get an integration rule by ID

EXAMPLES
  $ ably integrations get rule123

  $ ably integrations get rule123 --app "My App" --format json
```

_See code: [src/commands/integrations/get.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/integrations/get.ts)_

## `ably integrations list`

List all integration rules

```
USAGE
  $ ably integrations list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty] [--app <value>]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID or name to list integration rules for
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  List all integration rules

EXAMPLES
  $ ably integrations list

  $ ably integrations list --app "My App" --format json
```

_See code: [src/commands/integrations/list.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/integrations/list.ts)_

## `ably integrations update RULEID`

Update an integration rule

```
USAGE
  $ ably integrations update RULEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [--channel-filter <value>] [--status
    enabled|disabled] [--target-url <value>] [--format json|pretty]

ARGUMENTS
  RULEID  The rule ID to update

FLAGS
  --access-token=<value>    Overrides any configured access token used for the Control API
  --api-key=<value>         Overrides any configured API key used for the product APIs
  --app=<value>             App ID or name of the app containing the integration rule
  --channel-filter=<value>  Channel filter pattern
  --client-id=<value>       Overrides any default client ID when using API authentication. Use "none" to explicitly set
                            no client ID. Not applicable when using token authentication.
  --control-host=<value>    Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>             Override the environment for all product API calls
  --format=<option>         [default: pretty] Output format (json or pretty)
                            <options: json|pretty>
  --host=<value>            Override the host endpoint for all product API calls
  --status=<option>         Status of the rule
                            <options: enabled|disabled>
  --target-url=<value>      Target URL for HTTP rules
  --token=<value>           Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Update an integration rule

EXAMPLES
  $ ably integrations update rule123 --status disabled

  $ ably integrations update rule123 --channel-filter "chat:*"

  $ ably integrations update rule123 --target-url "https://new-example.com/webhook"
```

_See code: [src/commands/integrations/update.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/integrations/update.ts)_

## `ably login [TOKEN]`

Log in to your Ably account (alias for "ably accounts login")

```
USAGE
  $ ably login [TOKEN] [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-a <value>] [--no-browser]

ARGUMENTS
  TOKEN  Access token (if not provided, will prompt for it)

FLAGS
  -a, --alias=<value>         Alias for this account (default account if not specified)
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --no-browser            Do not open a browser
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Log in to your Ably account (alias for "ably accounts login")

EXAMPLES
  $ ably login

  $ ably login --alias mycompany
```

_See code: [src/commands/login.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/login.ts)_

## `ably logs`

Streaming and retrieving logs from Ably

```
USAGE
  $ ably logs

DESCRIPTION
  Streaming and retrieving logs from Ably

EXAMPLES
  $ ably logs channel-lifecycle subscribe

  $ ably logs connection-lifecycle subscribe

  $ ably logs app subscribe

  $ ably logs app history

  $ ably logs push subscribe

  $ ably logs push history
```

_See code: [src/commands/logs/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/index.ts)_

## `ably logs app`

Stream or retrieve logs from the app-wide meta channel [meta]log

```
USAGE
  $ ably logs app

DESCRIPTION
  Stream or retrieve logs from the app-wide meta channel [meta]log

EXAMPLES
  $ ably logs app subscribe

  $ ably logs app subscribe --rewind 10

  $ ably logs app history
```

_See code: [src/commands/logs/app/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/app/index.ts)_

## `ably logs app history`

Retrieve application log history

```
USAGE
  $ ably logs app history [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--limit <value>] [--direction backwards|forwards]
    [--json]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --direction=<option>    [default: backwards] Direction of log retrieval
                          <options: backwards|forwards>
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results in JSON format
  --limit=<value>         [default: 100] Maximum number of logs to retrieve
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Retrieve application log history

EXAMPLES
  $ ably logs app history

  $ ably logs app history --limit 20

  $ ably logs app history --direction forwards

  $ ably logs app history --json
```

_See code: [src/commands/logs/app/history.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/app/history.ts)_

## `ably logs app subscribe`

Stream logs from the app-wide meta channel [meta]log

```
USAGE
  $ ably logs app subscribe [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--rewind <value>] [--json]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results as JSON
  --rewind=<value>        Number of messages to rewind when subscribing
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Stream logs from the app-wide meta channel [meta]log

EXAMPLES
  $ ably logs app subscribe

  $ ably logs app subscribe --rewind 10
```

_See code: [src/commands/logs/app/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/app/subscribe.ts)_

## `ably logs channel-lifecycle`

Stream logs from [meta]channel.lifecycle meta channel

```
USAGE
  $ ably logs channel-lifecycle [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--rewind <value>] [--json]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results as JSON
  --rewind=<value>        Number of messages to rewind when subscribing
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Stream logs from [meta]channel.lifecycle meta channel

EXAMPLES
  $ ably logs channel-lifecycle subscribe

  $ ably logs channel-lifecycle subscribe --rewind 10
```

_See code: [src/commands/logs/channel-lifecycle/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/channel-lifecycle/index.ts)_

## `ably logs channel-lifecycle subscribe`

Stream logs from [meta]channel.lifecycle meta channel

```
USAGE
  $ ably logs channel-lifecycle subscribe [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--rewind <value>] [--json]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results as JSON
  --rewind=<value>        Number of messages to rewind when subscribing
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Stream logs from [meta]channel.lifecycle meta channel

EXAMPLES
  $ ably logs channel-lifecycle subscribe

  $ ably logs channel-lifecycle subscribe --rewind 10
```

_See code: [src/commands/logs/channel-lifecycle/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/channel-lifecycle/subscribe.ts)_

## `ably logs connection-lifecycle`

Stream logs from [meta]connection.lifecycle meta channel

```
USAGE
  $ ably logs connection-lifecycle

DESCRIPTION
  Stream logs from [meta]connection.lifecycle meta channel

EXAMPLES
  $ ably logs connection-lifecycle subscribe

  $ ably logs connection-lifecycle subscribe --rewind 10
```

_See code: [src/commands/logs/connection-lifecycle/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/connection-lifecycle/index.ts)_

## `ably logs connection-lifecycle history`

Retrieve connection lifecycle log history

```
USAGE
  $ ably logs connection-lifecycle history [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--limit <value>] [--direction backwards|forwards]
    [--json]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --direction=<option>    [default: backwards] Direction of log retrieval
                          <options: backwards|forwards>
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results in JSON format
  --limit=<value>         [default: 100] Maximum number of logs to retrieve
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Retrieve connection lifecycle log history

EXAMPLES
  $ ably logs connection-lifecycle history

  $ ably logs connection-lifecycle history --limit 20

  $ ably logs connection-lifecycle history --direction forwards

  $ ably logs connection-lifecycle history --json
```

_See code: [src/commands/logs/connection-lifecycle/history.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/connection-lifecycle/history.ts)_

## `ably logs connection-lifecycle subscribe`

Stream logs from [meta]connection.lifecycle meta channel

```
USAGE
  $ ably logs connection-lifecycle subscribe [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--rewind <value>] [--json]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results as JSON
  --rewind=<value>        Number of messages to rewind when subscribing
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Stream logs from [meta]connection.lifecycle meta channel

EXAMPLES
  $ ably logs connection-lifecycle subscribe

  $ ably logs connection-lifecycle subscribe --rewind 10
```

_See code: [src/commands/logs/connection-lifecycle/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/connection-lifecycle/subscribe.ts)_

## `ably logs push`

Stream or retrieve push notification logs from [meta]log:push

```
USAGE
  $ ably logs push

DESCRIPTION
  Stream or retrieve push notification logs from [meta]log:push

EXAMPLES
  $ ably logs push subscribe

  $ ably logs push subscribe --rewind 10

  $ ably logs push history
```

_See code: [src/commands/logs/push/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/push/index.ts)_

## `ably logs push history`

Retrieve push notification log history

```
USAGE
  $ ably logs push history [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--limit <value>] [--direction backwards|forwards]
    [--json]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --direction=<option>    [default: backwards] Direction of log retrieval
                          <options: backwards|forwards>
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results in JSON format
  --limit=<value>         [default: 100] Maximum number of logs to retrieve
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Retrieve push notification log history

EXAMPLES
  $ ably logs push history

  $ ably logs push history --limit 20

  $ ably logs push history --direction forwards

  $ ably logs push history --json
```

_See code: [src/commands/logs/push/history.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/push/history.ts)_

## `ably logs push subscribe`

Stream logs from the push notifications meta channel [meta]log:push

```
USAGE
  $ ably logs push subscribe [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--rewind <value>] [--json]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --json                  Output results as JSON
  --rewind=<value>        Number of messages to rewind when subscribing
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Stream logs from the push notifications meta channel [meta]log:push

EXAMPLES
  $ ably logs push subscribe

  $ ably logs push subscribe --rewind 10
```

_See code: [src/commands/logs/push/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/logs/push/subscribe.ts)_

## `ably queues`

Manage Ably Queues

```
USAGE
  $ ably queues

DESCRIPTION
  Manage Ably Queues

EXAMPLES
  $ ably queues list

  $ ably queues create --name "my-queue"

  $ ably queues delete my-queue
```

_See code: [src/commands/queues/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/queues/index.ts)_

## `ably queues create`

Create a queue

```
USAGE
  $ ably queues create --name <value> [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--ttl <value>] [--max-length <value>]
    [--region <value>] [--app <value>] [--format json|pretty]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID or name to create the queue in
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --max-length=<value>    [default: 10000] Maximum number of messages in the queue
  --name=<value>          (required) Name of the queue
  --region=<value>        [default: us-east-1-a] Region for the queue
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key
  --ttl=<value>           [default: 60] Time to live for messages in seconds

DESCRIPTION
  Create a queue

EXAMPLES
  $ ably queues create --name "my-queue"

  $ ably queues create --name "my-queue" --ttl 3600 --max-length 100000

  $ ably queues create --name "my-queue" --region "eu-west-1-a" --app "My App"
```

_See code: [src/commands/queues/create.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/queues/create.ts)_

## `ably queues delete QUEUENAME`

Delete a queue

```
USAGE
  $ ably queues delete QUEUENAME [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--app <value>] [-f]

ARGUMENTS
  QUEUENAME  Name of the queue to delete

FLAGS
  -f, --force                 Force deletion without confirmation
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --app=<value>           App ID or name to delete the queue from
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Delete a queue

EXAMPLES
  $ ably queues delete my-queue

  $ ably queues delete my-queue --app "My App"

  $ ably queues delete my-queue --force
```

_See code: [src/commands/queues/delete.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/queues/delete.ts)_

## `ably queues list`

List all queues

```
USAGE
  $ ably queues list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty] [--app <value>]

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --app=<value>           App ID or name to list queues for
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  List all queues

EXAMPLES
  $ ably queues list

  $ ably queues list --app "My App" --format json
```

_See code: [src/commands/queues/list.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/queues/list.ts)_

## `ably rooms`

Interact with Ably Chat rooms

```
USAGE
  $ ably rooms

DESCRIPTION
  Interact with Ably Chat rooms

EXAMPLES
  $ ably rooms list

  $ ably rooms messages send my-room "Hello world!"

  $ ably rooms messages subscribe my-room

  $ ably rooms messages get my-room

  $ ably rooms typing subscribe my-room

  $ ably rooms typing start my-room
```

_See code: [src/commands/rooms/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/index.ts)_

## `ably rooms list`

List active chat rooms

```
USAGE
  $ ably rooms list [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-p <value>] [--limit <value>] [--format json|pretty]

FLAGS
  -p, --prefix=<value>        Filter rooms by prefix
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --format=<option>       [default: pretty] Output format (json or pretty)
                              <options: json|pretty>
      --host=<value>          Override the host endpoint for all product API calls
      --limit=<value>         [default: 100] Maximum number of rooms to return
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  List active chat rooms

EXAMPLES
  $ ably rooms list

  $ ably rooms list --prefix my-room

  $ ably rooms list --limit 50

  $ ably rooms list --format json
```

_See code: [src/commands/rooms/list.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/list.ts)_

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

_See code: [src/commands/rooms/messages/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/messages/index.ts)_

## `ably rooms messages get ROOMID`

Get historical messages from an Ably Chat room

```
USAGE
  $ ably rooms messages get ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-l <value>] [--show-metadata]

ARGUMENTS
  ROOMID  The room ID to get messages from

FLAGS
  -l, --limit=<value>         [default: 20] Maximum number of messages to retrieve
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --show-metadata         Display message metadata if available
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Get historical messages from an Ably Chat room

EXAMPLES
  $ ably rooms messages get my-room

  $ ably rooms messages get --api-key "YOUR_API_KEY" my-room

  $ ably rooms messages get --limit 50 my-room

  $ ably rooms messages get --show-metadata my-room
```

_See code: [src/commands/rooms/messages/get.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/messages/get.ts)_

## `ably rooms messages send ROOMID TEXT`

Send a message to an Ably Chat room

```
USAGE
  $ ably rooms messages send ROOMID TEXT [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--metadata <value>] [-c <value>] [-d <value>]

ARGUMENTS
  ROOMID  The room ID to send the message to
  TEXT    The message text to send

FLAGS
  -c, --count=<value>         [default: 1] Number of messages to send
  -d, --delay=<value>         Delay between messages in milliseconds (min 10ms when count > 1)
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --metadata=<value>      Additional metadata for the message (JSON format)
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Send a message to an Ably Chat room

EXAMPLES
  $ ably rooms messages send my-room "Hello World!"

  $ ably rooms messages send --api-key "YOUR_API_KEY" my-room "Welcome to the chat!"

  $ ably rooms messages send --metadata '{"isImportant":true}' my-room "Attention please!"

  $ ably rooms messages send --count 5 my-room "Message number {{.Count}}"

  $ ably rooms messages send --count 10 --delay 1000 my-room "Message at {{.Timestamp}}"
```

_See code: [src/commands/rooms/messages/send.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/messages/send.ts)_

## `ably rooms messages subscribe ROOMID`

Subscribe to messages in an Ably Chat room

```
USAGE
  $ ably rooms messages subscribe ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--show-metadata]

ARGUMENTS
  ROOMID  The room ID to subscribe to messages from

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --show-metadata         Display message metadata if available
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to messages in an Ably Chat room

EXAMPLES
  $ ably rooms messages subscribe my-room

  $ ably rooms messages subscribe --api-key "YOUR_API_KEY" my-room

  $ ably rooms messages subscribe --show-metadata my-room
```

_See code: [src/commands/rooms/messages/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/messages/subscribe.ts)_

## `ably rooms occupancy`

Commands for monitoring room occupancy

```
USAGE
  $ ably rooms occupancy

DESCRIPTION
  Commands for monitoring room occupancy

EXAMPLES
  $ ably rooms occupancy get my-room

  $ ably rooms occupancy subscribe my-room
```

_See code: [src/commands/rooms/occupancy/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/occupancy/index.ts)_

## `ably rooms occupancy get ROOMID`

Get current occupancy metrics for a room

```
USAGE
  $ ably rooms occupancy get ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  ROOMID  Room ID to get occupancy for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Get current occupancy metrics for a room

EXAMPLES
  $ ably rooms occupancy get my-room

  $ ably rooms occupancy get --api-key "YOUR_API_KEY" my-room
```

_See code: [src/commands/rooms/occupancy/get.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/occupancy/get.ts)_

## `ably rooms occupancy subscribe ROOMID`

Subscribe to real-time occupancy metrics for a room

```
USAGE
  $ ably rooms occupancy subscribe ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  ROOMID  Room ID to subscribe to occupancy for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format (json or pretty)
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to real-time occupancy metrics for a room

EXAMPLES
  $ ably rooms occupancy subscribe my-room

  $ ably rooms occupancy subscribe --api-key "YOUR_API_KEY" my-room

  $ ably rooms occupancy subscribe --format json my-room
```

_See code: [src/commands/rooms/occupancy/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/occupancy/subscribe.ts)_

## `ably rooms presence`

Manage presence on Ably chat rooms

```
USAGE
  $ ably rooms presence

DESCRIPTION
  Manage presence on Ably chat rooms

EXAMPLES
  $ ably rooms presence enter my-room

  $ ably rooms presence subscribe my-room
```

_See code: [src/commands/rooms/presence/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/presence/index.ts)_

## `ably rooms presence enter ROOMID`

Enter presence in a chat room and remain present until terminated

```
USAGE
  $ ably rooms presence enter ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--data <value>] [--show-others]

ARGUMENTS
  ROOMID  Room ID to enter presence on

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --data=<value>          [default: {}] Presence data to publish (JSON string)
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --show-others           Show other presence events while present
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Enter presence in a chat room and remain present until terminated

EXAMPLES
  $ ably rooms presence enter my-room

  $ ably rooms presence enter my-room --data '{"status":"online","username":"john"}'

  $ ably rooms presence enter my-room --client-id "user123"
```

_See code: [src/commands/rooms/presence/enter.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/presence/enter.ts)_

## `ably rooms presence subscribe ROOMID`

Subscribe to presence events in a chat room

```
USAGE
  $ ably rooms presence subscribe ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  ROOMID  Room ID to subscribe to presence for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to presence events in a chat room

EXAMPLES
  $ ably rooms presence subscribe my-room

  $ ably rooms presence subscribe my-room --format json
```

_See code: [src/commands/rooms/presence/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/presence/subscribe.ts)_

## `ably rooms reactions`

Manage reactions in Ably chat rooms

```
USAGE
  $ ably rooms reactions

DESCRIPTION
  Manage reactions in Ably chat rooms

EXAMPLES
  $ ably rooms reactions send my-room thumbs_up

  $ ably rooms reactions subscribe my-room
```

_See code: [src/commands/rooms/reactions/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/reactions/index.ts)_

## `ably rooms reactions send ROOMID TYPE`

Send a reaction to a chat room

```
USAGE
  $ ably rooms reactions send ROOMID TYPE [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--metadata <value>]

ARGUMENTS
  ROOMID  Room ID to send the reaction to
  TYPE    Reaction type/emoji to send

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --metadata=<value>      [default: {}] Optional metadata for the reaction (JSON string)
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Send a reaction to a chat room

EXAMPLES
  $ ably rooms reactions send my-room thumbs_up

  $ ably rooms reactions send my-room heart --metadata '{"effect":"fireworks"}'
```

_See code: [src/commands/rooms/reactions/send.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/reactions/send.ts)_

## `ably rooms reactions subscribe ROOMID`

Subscribe to reactions in a chat room

```
USAGE
  $ ably rooms reactions subscribe ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  ROOMID  Room ID to subscribe to reactions in

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to reactions in a chat room

EXAMPLES
  $ ably rooms reactions subscribe my-room

  $ ably rooms reactions subscribe my-room --format json
```

_See code: [src/commands/rooms/reactions/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/reactions/subscribe.ts)_

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

_See code: [src/commands/rooms/typing/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/typing/index.ts)_

## `ably rooms typing start ROOMID`

Start typing in an Ably Chat room (will remain typing until terminated)

```
USAGE
  $ ably rooms typing start ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>]

ARGUMENTS
  ROOMID  The room ID to start typing in

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Start typing in an Ably Chat room (will remain typing until terminated)

EXAMPLES
  $ ably rooms typing start my-room

  $ ably rooms typing start --api-key "YOUR_API_KEY" my-room
```

_See code: [src/commands/rooms/typing/start.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/typing/start.ts)_

## `ably rooms typing subscribe ROOMID`

Subscribe to typing indicators in an Ably Chat room

```
USAGE
  $ ably rooms typing subscribe ROOMID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>]

ARGUMENTS
  ROOMID  The room ID to subscribe to typing indicators from

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to typing indicators in an Ably Chat room

EXAMPLES
  $ ably rooms typing subscribe my-room

  $ ably rooms typing subscribe --api-key "YOUR_API_KEY" my-room
```

_See code: [src/commands/rooms/typing/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/rooms/typing/subscribe.ts)_

## `ably spaces`

Interact with Ably Spaces

```
USAGE
  $ ably spaces

DESCRIPTION
  Interact with Ably Spaces

EXAMPLES
  $ ably spaces members subscribe my-space

  $ ably spaces members enter my-space

  $ ably spaces locations set my-space --location "{"x":10,"y":20}"

  $ ably spaces locations subscribe my-space

  $ ably spaces locations get-all my-space

  $ ably spaces cursors set my-space --position "{"x":100,"y":150}"

  $ ably spaces cursors subscribe my-space

  $ ably spaces cursors get-all my-space

  $ ably spaces locks acquire my-space my-lock-id

  $ ably spaces locks subscribe my-space

  $ ably spaces locks get my-space my-lock-id

  $ ably spaces locks get-all my-space
```

_See code: [src/commands/spaces/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/index.ts)_

## `ably spaces cursors`

Commands for realtime cursor tracking in Ably Spaces

```
USAGE
  $ ably spaces cursors

DESCRIPTION
  Commands for realtime cursor tracking in Ably Spaces

EXAMPLES
  $ ably spaces cursors set my-space --position "{"x":100,"y":150}"

  $ ably spaces cursors subscribe my-space

  $ ably spaces cursors get-all my-space
```

_See code: [src/commands/spaces/cursors/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/cursors/index.ts)_

## `ably spaces cursors set SPACEID`

Set your cursor position in a space

```
USAGE
  $ ably spaces cursors set SPACEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--position <value> | --simulate] [--format json|pretty]

ARGUMENTS
  SPACEID  Space ID to set cursor in

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --position=<value>      Cursor position data to set (JSON format)
  --simulate              Simulate cursor movements automatically
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Set your cursor position in a space

EXAMPLES
  $ ably spaces cursors set my-space --position '{"x":100,"y":150}'

  $ ably spaces cursors set my-space --simulate
```

_See code: [src/commands/spaces/cursors/set.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/cursors/set.ts)_

## `ably spaces cursors subscribe SPACEID`

Subscribe to cursor movements in a space

```
USAGE
  $ ably spaces cursors subscribe SPACEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  SPACEID  Space ID to subscribe to cursors for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to cursor movements in a space

EXAMPLES
  $ ably spaces cursors subscribe my-space

  $ ably spaces cursors subscribe my-space --format json
```

_See code: [src/commands/spaces/cursors/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/cursors/subscribe.ts)_

## `ably spaces locations`

Spaces Locations API commands (Ably Spaces client-to-client location sharing)

```
USAGE
  $ ably spaces locations

DESCRIPTION
  Spaces Locations API commands (Ably Spaces client-to-client location sharing)
```

_See code: [src/commands/spaces/locations/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/locations/index.ts)_

## `ably spaces locations get-all SPACEID`

Get all current locations in a space

```
USAGE
  $ ably spaces locations get-all SPACEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [-f text|json]

ARGUMENTS
  SPACEID  Space ID to get locations from

FLAGS
  -f, --format=<option>       [default: text] Output format
                              <options: text|json>
      --access-token=<value>  Overrides any configured access token used for the Control API
      --api-key=<value>       Overrides any configured API key used for the product APIs
      --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly
                              set no client ID. Not applicable when using token authentication.
      --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
      --env=<value>           Override the environment for all product API calls
      --host=<value>          Override the host endpoint for all product API calls
      --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Get all current locations in a space

EXAMPLES
  $ ably spaces locations get-all my-space

  $ ably spaces locations get-all my-space --format json
```

_See code: [src/commands/spaces/locations/get-all.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/locations/get-all.ts)_

## `ably spaces locations set SPACEID`

Set your location in a space

```
USAGE
  $ ably spaces locations set SPACEID --location <value> [--host <value>] [--env <value>] [--control-host <value>]
    [--access-token <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  SPACEID  Space ID to set location in

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --location=<value>      (required) Location data to set (JSON format)
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Set your location in a space

EXAMPLES
  $ ably spaces locations set my-space --location '{"x":10,"y":20}'

  $ ably spaces locations set my-space --location '{"sectionId":"section1"}'
```

_See code: [src/commands/spaces/locations/set.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/locations/set.ts)_

## `ably spaces locations subscribe SPACEID`

Subscribe to location changes in a space

```
USAGE
  $ ably spaces locations subscribe SPACEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  SPACEID  Space ID to subscribe to locations for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to location changes in a space

EXAMPLES
  $ ably spaces locations subscribe my-space

  $ ably spaces locations subscribe my-space --format json
```

_See code: [src/commands/spaces/locations/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/locations/subscribe.ts)_

## `ably spaces locks`

Commands for component locking in Ably Spaces

```
USAGE
  $ ably spaces locks

DESCRIPTION
  Commands for component locking in Ably Spaces

EXAMPLES
  $ ably spaces locks acquire my-space my-lock-id

  $ ably spaces locks subscribe my-space

  $ ably spaces locks get my-space my-lock-id

  $ ably spaces locks get-all my-space
```

_See code: [src/commands/spaces/locks/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/locks/index.ts)_

## `ably spaces locks acquire SPACEID LOCKID`

Acquire a lock in a space

```
USAGE
  $ ably spaces locks acquire SPACEID LOCKID [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--data <value>] [--format json|pretty]

ARGUMENTS
  SPACEID  Space ID to acquire lock in
  LOCKID   ID of the lock to acquire

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --data=<value>          Optional data to associate with the lock (JSON format)
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Acquire a lock in a space

EXAMPLES
  $ ably spaces locks acquire my-space my-lock-id

  $ ably spaces locks acquire my-space my-lock-id --data '{"type":"editor"}'
```

_See code: [src/commands/spaces/locks/acquire.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/locks/acquire.ts)_

## `ably spaces locks get SPACEID LOCKID`

Get information about a specific lock

```
USAGE
  $ ably spaces locks get SPACEID LOCKID [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  SPACEID  Space ID to get lock from
  LOCKID   ID of the lock to get

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Get information about a specific lock

EXAMPLES
  $ ably spaces locks get my-space my-lock-id

  $ ably spaces locks get my-space my-lock-id --format json
```

_See code: [src/commands/spaces/locks/get.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/locks/get.ts)_

## `ably spaces locks get-all SPACEID`

Get all current locks in a space

```
USAGE
  $ ably spaces locks get-all SPACEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  SPACEID  Space ID to get locks from

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Get all current locks in a space

EXAMPLES
  $ ably spaces locks get-all my-space

  $ ably spaces locks get-all my-space --format json
```

_See code: [src/commands/spaces/locks/get-all.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/locks/get-all.ts)_

## `ably spaces locks subscribe SPACEID`

Subscribe to lock changes in a space

```
USAGE
  $ ably spaces locks subscribe SPACEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  SPACEID  Space ID to subscribe for locks from

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to lock changes in a space

EXAMPLES
  $ ably spaces locks subscribe my-space

  $ ably spaces locks subscribe my-space --format json
```

_See code: [src/commands/spaces/locks/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/locks/subscribe.ts)_

## `ably spaces members`

Commands for managing members in Ably Spaces

```
USAGE
  $ ably spaces members

DESCRIPTION
  Commands for managing members in Ably Spaces

EXAMPLES
  $ ably spaces members subscribe my-space

  $ ably spaces members enter my-space
```

_See code: [src/commands/spaces/members/index.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/members/index.ts)_

## `ably spaces members enter SPACEID`

Enter a space and remain present until terminated

```
USAGE
  $ ably spaces members enter SPACEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--profile <value>] [--format json|pretty]

ARGUMENTS
  SPACEID  Space ID to enter

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --profile=<value>       Optional profile data to include with the member (JSON format)
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Enter a space and remain present until terminated

EXAMPLES
  $ ably spaces members enter my-space

  $ ably spaces members enter my-space --profile '{"name":"User","status":"active"}'
```

_See code: [src/commands/spaces/members/enter.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/members/enter.ts)_

## `ably spaces members subscribe SPACEID`

Subscribe to member presence events in a space

```
USAGE
  $ ably spaces members subscribe SPACEID [--host <value>] [--env <value>] [--control-host <value>] [--access-token <value>]
    [--api-key <value>] [--token <value>] [--client-id <value>] [--format json|pretty]

ARGUMENTS
  SPACEID  Space ID to subscribe to members for

FLAGS
  --access-token=<value>  Overrides any configured access token used for the Control API
  --api-key=<value>       Overrides any configured API key used for the product APIs
  --client-id=<value>     Overrides any default client ID when using API authentication. Use "none" to explicitly set no
                          client ID. Not applicable when using token authentication.
  --control-host=<value>  Override the host endpoint for the control API, which defaults to control.ably.net
  --env=<value>           Override the environment for all product API calls
  --format=<option>       [default: pretty] Output format
                          <options: json|pretty>
  --host=<value>          Override the host endpoint for all product API calls
  --token=<value>         Authenticate using an Ably Token or JWT Token instead of an API key

DESCRIPTION
  Subscribe to member presence events in a space

EXAMPLES
  $ ably spaces members subscribe my-space

  $ ably spaces members subscribe my-space --format json
```

_See code: [src/commands/spaces/members/subscribe.ts](https://github.com/ably/cli/blob/v0.2.1/src/commands/spaces/members/subscribe.ts)_
<!-- commandsstop -->
