# Ably Web CLI Example

This example demonstrates how to integrate the Ably Web CLI React component into a web application.
It connects to the Ably terminal server via WebSocket, handles authentication using environment variables or user input, and provides a functional terminal interface powered by Xterm.js.

## Features

- Connects to a WebSocket endpoint for the terminal server (defaults to public endpoint in production, localhost in development).
- Authentication using environment variables or interactive input.
- Full terminal interface with command execution.
- Auto-completion and command history.
- Fullscreen and drawer modes.
- Session persistence across page reloads.
- Connection status indicators and reconnection handling.

## Quick Start

### Development Mode

For local development, the example will connect to `ws://localhost:8080` by default. You'll need to run the terminal server locally:

```bash
# In the main CLI repository
pnpm dev:server

# In another terminal, run the example
cd examples/web-cli
pnpm dev
```

### Production Mode

In production builds, the example automatically connects to the public Ably terminal server at `wss://web-cli.ably.com`:

```bash
cd examples/web-cli
pnpm build
pnpm preview
```

## Configuration

You can override the default server URL in several ways:

### Environment Variables

Set a custom terminal server URL with `VITE_TERMINAL_SERVER_URL`:

```bash
VITE_TERMINAL_SERVER_URL=wss://your-custom-server:8080
```

### URL Parameters

- Append the `serverUrl` parameter to the URL:

```
http://localhost:5173?serverUrl=wss://your-custom-server:8080
```

### Default Behavior

- **Development** (`pnpm dev`): Defaults to `ws://localhost:8080`
- **Production** (`pnpm build`): Defaults to `wss://web-cli.ably.com`
- **URL parameter takes precedence** over environment variables
- **Environment variables take precedence** over defaults

If neither option is provided, the application will use the appropriate default based on the build mode.

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