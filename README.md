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
* [`ably channels`](#ably-channels)
* [`ably channels publish CHANNEL MESSAGE`](#ably-channels-publish-channel-message)
* [`ably config [FILE]`](#ably-config-file)

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

  $ ably channels list
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
