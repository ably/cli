# Ably Web CLI Example

This example demonstrates how to integrate the Ably Web CLI React component into a web application.
It connects to the Ably terminal server via WebSocket, handles authentication using environment variables or user input, and provides a functional terminal interface powered by Xterm.js.

## Features

- Connects to a WebSocket endpoint for the terminal server (defaults to `wss://web-cli.ably.com`).
- Authentication using environment variables or interactive input.
- Full terminal interface with command execution.
- Auto-completion and command history.
- Fullscreen and drawer modes.
- Session persistence across page reloads.
- Connection status indicators and reconnection handling.

## Quick Start

The example connects to the public Ably terminal server by default:

```bash
cd examples/web-cli
pnpm dev
```

Open http://localhost:5173 and enter your Ably API key when prompted.

## Configuration

### Terminal Server URL

By default, the example connects to the public Ably terminal server at `wss://web-cli.ably.com`.

To connect to a local terminal server (e.g., when developing the terminal server itself):

1. **Clone and run the terminal server** from [@ably/cli-terminal-server](https://github.com/ably/cli-terminal-server)
2. **Override the server URL** using the `serverUrl` query parameter:

```
http://localhost:5173?serverUrl=ws://localhost:8080
```

You can also set it via environment variable:

```bash
VITE_TERMINAL_SERVER_URL=ws://localhost:8080 pnpm dev
```

**Note**: The query parameter takes precedence over the environment variable.

## Authentication

Set your Ably credentials as environment variables:

```bash
VITE_ABLY_API_KEY=your-api-key
VITE_ABLY_ACCESS_TOKEN=your-access-token
```

Or pass them as URL parameters:

```
http://localhost:5173?apiKey=your-api-key&accessToken=your-access-token
```

Note: The example app connects to the `terminal-server` via WebSockets.

# Using the React Web CLI Component (`@ably/react-web-cli`)

This repository also contains a React component (`