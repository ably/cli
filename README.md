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
* [`ably apps`](#ably-apps)
* [`ably apps create`](#ably-apps-create)
* [`ably apps delete ID`](#ably-apps-delete-id)
* [`ably apps list`](#ably-apps-list)
* [`ably apps set-apns-p12 ID`](#ably-apps-set-apns-p12-id)
* [`ably apps stats ID`](#ably-apps-stats-id)
* [`ably apps update ID`](#ably-apps-update-id)
* [`ably channels`](#ably-channels)
* [`ably channels occupancy`](#ably-channels-occupancy)
* [`ably channels occupancy get CHANNEL`](#ably-channels-occupancy-get-channel)
* [`ably channels occupancy subscribe CHANNEL`](#ably-channels-occupancy-subscribe-channel)
* [`ably channels publish CHANNEL MESSAGE`](#ably-channels-publish-channel-message)
* [`ably channels subscribe CHANNELS`](#ably-channels-subscribe-channels)
* [`ably config [FILE]`](#ably-config-file)

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

## `ably channels`

Commands for working with Ably channels

```
USAGE
  $ ably channels

DESCRIPTION
  Commands for working with Ably channels

EXAMPLES
  $ ably channels publish my-channel '{"name":"message","data":"Hello, World"}'

  $ ably channels subscribe my-channel

  $ ably channels occupancy get my-channel

  $ ably channels occupancy live my-channel

  $ ably channels list
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

## `ably channels publish CHANNEL MESSAGE`

Publish a message to an Ably channel

```
USAGE
  $ ably channels publish CHANNEL MESSAGE [--host <value>] [--env <value>] [--control-host <value>] [--access-token
    <value>] [--api-key <value>] [--client-id <value>] [-n <value>] [-e <value>]

ARGUMENTS
  CHANNEL  The channel name to publish to
  MESSAGE  The message to publish in JSON format

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

## `ably config [FILE]`

Manage your Ably CLI configuration

```
USAGE
  $ ably config [FILE] [-f] [-n <value>]

ARGUMENTS
  FILE  file to read

FLAGS
  -f, --force
  -n, --name=<value>  name to print

DESCRIPTION
  Manage your Ably CLI configuration

EXAMPLES
  $ ably config
```
<!-- commandsstop -->
