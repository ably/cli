# @ably/react-web-cli

![npm (scoped)](https://img.shields.io/npm/v/@ably/react-web-cli)
![License](https://img.shields.io/github/license/ably/cli)

A React component for embedding an interactive Ably CLI terminal in web applications.

![Ably Web CLI demo screenshot](assets/ably-web-cli-demo-screenshot.png)

## Features

* Embed a **fully-featured Ably CLI** session (xterm.js) inside any React app.
* Secure WebSocket connection to the Ably terminal-server using your **API Key** (required) and an optional **Access Token** for Control-API commands.
* First-class terminal UX: 
  * Terminal-native status messages with ANSI colors
  * Animated spinner while (re)connecting
  * Live countdown and clear guidance (press **Enter** to cancel / retry)
  * ASCII modal boxes for important status messages
* Robust connection handling:
  * Automatic exponential-back-off reconnects (0 s, 2 s, 4 s, 8 s …)
  * Configurable maximum reconnection attempts (default: 15) before switching to manual reconnect
  * Proper handling of server-initiated disconnections with specific error codes
* **Session resumption** on page reload or transient network loss (`resumeOnReload`).
* **Split-screen mode** with two independent terminal sessions at once.
* Works in fullscreen or in a resizable drawer (see `examples/web-cli`).
* Written in TypeScript & totally tree-shakable.

## Installation

```bash
# Using npm
npm install @ably/react-web-cli

# Using yarn
yarn add @ably/react-web-cli

# Using pnpm
pnpm add @ably/react-web-cli
```

## Prerequisites

- React 17.0.0 or higher
- A running instance of the Ably CLI terminal server (see [@ably/cli-terminal-server](https://github.com/ably/cli-terminal-server))
- Valid Ably API Key (required) and – optionally – an Access Token for Control-API commands

## Usage

```tsx
import { useState } from "react";
import { AblyCliTerminal } from "@ably/react-web-cli";

export default function MyTerminal() {
  const [status, setStatus] = useState("disconnected");

  return (
    <div style={{ height: 500 }}>
      <AblyCliTerminal
        websocketUrl="wss://web-cli.ably.com"
        /* required API key … */
        ablyApiKey="YOUR_ABLY_API_KEY"
        /* optional Access-Token (Control-plane JWT) */
        // ablyAccessToken="YOUR_ABLY_TOKEN"
        initialCommand="ably --version"
        onConnectionStatusChange={setStatus}
        onSessionEnd={(reason) => console.log("session ended", reason)}
        onSessionId={(id) => console.log("session id", id)}
        resumeOnReload
        maxReconnectAttempts={15}
      />

      <p>Status: {status}</p>
    </div>
  );
}
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `websocketUrl` | string | ✅ | - | URL of the WebSocket terminal server |
| `ablyApiKey` | string | ✅ | - | Ably API key (data-plane) **required** |
| `ablyAccessToken` | string | No | - | Optional Control-API access token |
| `initialCommand` | string | No | - | Command to run on startup |
| `onConnectionStatusChange` | function | No | - | Callback when connection status changes |
| `onSessionId` | function | No | - | Callback when session ID is received |
| `onSessionEnd` | function | No | - | Callback when session ends |
| `maxReconnectAttempts` | number | No | 15 | Maximum reconnection attempts before giving up |
| `resumeOnReload` | boolean | No | false | Whether to attempt to resume an existing session after page reload |
| `enableSplitScreen` | boolean | No | false | Enable split-screen mode with a second independent terminal |

*\* `ablyApiKey` is mandatory.  `ablyAccessToken` is optional and only needed for Control-API commands (e.g. accounts, apps, keys).

## Connection States

The component manages several connection states that your application can respond to:

- `initial`: Terminal is initializing
- `connecting`: Attempting to connect to the server
- `connected`: Successfully connected and ready
- `disconnected`: Connection closed by server or manually by user
- `reconnecting`: Attempting to reconnect after a connection drop
- `error`: Connection error or other terminal error

## Server-Initiated Disconnections

The terminal properly handles server-initiated disconnections with specific WebSocket close codes:

| Code | Description | Behavior |
|------|-------------|----------|
| 1000 | Normal closure | Shows reason in terminal, requires manual reconnect |
| 1001 | Server going away | Shows service restart message, requires manual reconnect |
| 1011 | Server error | Shows unexpected condition message, requires manual reconnect |
| 1013 | Service unavailable | Shows service unavailable message, requires manual reconnect |
| 4000 | Generic server disconnect | Shows server-provided reason, requires manual reconnect |
| 4001 | Authentication failed | Shows authentication error with instructions, requires manual reconnect |
| 4008 | Policy violation | Shows auth timeout/format message, requires manual reconnect |
| 4429 | Capacity limit reached | Shows capacity message with CLI install instructions, requires manual reconnect |

For other WebSocket close codes, the terminal will automatically attempt to reconnect using an exponential backoff strategy.

## Session Resumption

When `resumeOnReload` is enabled, the terminal will store the session ID in `sessionStorage` and attempt to resume the session after a page reload. This allows for a seamless experience when navigating away and back to the page.

## Split-Screen Mode

When `enableSplitScreen` is set to `true`, the component displays a split icon in the top-right corner of the terminal. Clicking this icon splits the view into two independent terminal sessions side by side.

Features of split-screen mode:

- Two completely independent terminal sessions sharing the same credentials
- Each terminal has its own tab with a close button
- Both terminals resize automatically to maintain optimal layout
- Status and connection management happens independently for each terminal
- Close either terminal to return to single-pane mode

The feature is designed for developers who need to run multiple commands simultaneously, such as subscribing to a channel in one pane while publishing to it in another.

## Setting Up a Terminal Server

The terminal server required for this component is provided in a separate repository. Please refer to the [@ably/cli-terminal-server](https://github.com/ably/cli-terminal-server) repository for:

- Installation instructions
- Configuration options
- Running the server locally
- Docker deployment instructions

For production use, the Ably Web CLI connects to `wss://web-cli.ably.com` by default, which is a hosted instance of the terminal server.

## Notes

- The terminal requires a container for sizing, so make sure the parent element has a defined height and width.
- The component handles reconnection automatically with exponential backoff.
- Only `ably`, `clear`, and `exit` commands are available in the terminal by default.
- The terminal supports full xterm.js functionality including colors and Unicode.

## Debugging & Verbose Logging

The component ships with a built-in verbose logger that is **disabled by default**.  
Enable it in any of the following ways *before* the component mounts:

1. **Query-string flag** – simply add `?cliDebug=true` to the page URL.  
  Example: `http://localhost:5173/?cliDebug=true`  
  (The flag may be combined with other query parameters.)

2. **Runtime global flag** – from the browser DevTools console run:

```js
window.ABLY_CLI_DEBUG = true;
```

The terminal will now emit detailed lifecycle logs prefixed with
`[AblyCLITerminal DEBUG]`.  Remove the flag or refresh without the query
parameter to return to silent mode.

## Example Project

For a complete example of using this component, see the [web-cli example](https://github.com/ably/cli/tree/main/examples/web-cli) in the Ably CLI repository.

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Run tests
pnpm test
```

## Publishing

This package includes an automated release script to ensure consistent and safe publishing to npm. **Use this script instead of manual `pnpm publish` commands** to avoid common publishing errors.

### Publishing a Release

```bash
# Interactive release with version prompts
./bin/release

# Preview what would happen (dry run)
./bin/release --dry-run
```

The release script will:
- ✅ Check git status (clean working directory, up-to-date with remote)
- ✅ Run tests and build verification
- ✅ Prompt for version selection (patch/minor/major/custom/prerelease)
- ✅ Update package.json and create git tag
- ✅ Publish to npm with proper configuration
- ✅ Push changes and tags to remote

### Publishing a Dev Package

For testing purposes, you can publish temporary dev packages:

```bash
# Publish dev package with current version + random suffix
./bin/release --dev

# Example output: @ably/react-web-cli@0.8.1-dev.a1b2c3d4
```

Dev packages:
- Use current version + randomized 8-character suffix
- Are published with `dev` tag (install with `npm install @ably/react-web-cli@dev`)
- Skip git checks and version bumping
- Still run tests and build for safety
- Automatically restore original package.json

### Release Script Options

| Option | Description |
|--------|-------------|
| `--dev`, `-D` | Publish dev package with randomized suffix |
| `--dry-run` | Preview actions without executing them |
| `--help`, `-h` | Show usage information |

## License

[Apache-2.0](https://github.com/ably/cli/blob/main/LICENSE)
