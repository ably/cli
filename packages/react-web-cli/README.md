# @ably/react-web-cli

![npm (scoped)](https://img.shields.io/npm/v/@ably/react-web-cli)
![License](https://img.shields.io/github/license/ably/cli)

A React component for embedding an interactive Ably CLI terminal in web applications.

![Ably Web CLI demo screenshot](assets/ably-web-cli-demo-screenshot.png)

## Features

- Embeds a fully functional Ably CLI terminal in your React application
- Connects to a WebSocket terminal server
- Authenticates using Ably API Key and Access Token
- Handles connection state management and automatic reconnection
- Provides terminal resizing and proper terminal display
- Offers customizable UI for connection status and restart functionality

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
- A running instance of the Ably CLI terminal server (provided in the main CLI package)
- Valid Ably API Key and Access Token

## Usage

```jsx
import React, { useState } from "react";
import { AblyCliTerminal } from "@ably/react-web-cli";

const MyTerminalComponent = () => {
  const [connectionStatus, setConnectionStatus] = useState("disconnected");

  return (
    <div style={{ height: "500px", width: "100%" }}>
      <AblyCliTerminal
        websocketUrl="ws://localhost:8080"
        ablyApiKey="YOUR_ABLY_API_KEY"
        ablyAccessToken="YOUR_ABLY_ACCESS_TOKEN"
        onConnectionStatusChange={setConnectionStatus}
        onSessionEnd={(reason) => console.log("Session ended:", reason)}
        renderRestartButton={(onRestart) => (
          <button onClick={onRestart}>Restart Terminal</button>
        )}
      />
      <div>Terminal status: {connectionStatus}</div>
    </div>
  );
};

export default MyTerminalComponent;
```

## Props

| Prop                       | Type     | Required | Description                                                                                                                  |
| -------------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `websocketUrl`             | string   | Yes      | The WebSocket URL of the terminal server                                                                                     |
| `ablyApiKey`               | string   | Yes      | Your Ably API Key                                                                                                            |
| `ablyAccessToken`          | string   | Yes      | Your Ably Access Token                                                                                                       |
| `onConnectionStatusChange` | function | No       | Callback triggered when connection status changes. Receives status: 'connecting' \| 'connected' \| 'disconnected' \| 'error' |
| `onSessionEnd`             | function | No       | Callback triggered when the terminal session ends. Receives the reason as a string                                           |
| `renderRestartButton`      | function | No       | Custom render function for the restart button when session ends. Receives `onRestart` function as parameter                  |

## Setting Up a Terminal Server

The terminal server required for this component is provided in the main Ably CLI package. To run it:

1. Ensure you have the Ably CLI Docker image built:

   ```bash
   # In the Ably CLI repository root
   docker build --no-cache -t ably-cli-sandbox .
   ```

2. Start the terminal server:

   ```bash
   # In the Ably CLI repository root
   pnpm terminal-server
   ```

3. The server will start on `ws://localhost:8080` by default.

## Notes

- The terminal requires a container for sizing, so make sure the parent element has a defined height and width.
- The component handles reconnection automatically with exponential backoff.
- Only `ably` and `exit` commands are available in the terminal by default.
- The terminal supports full xterm.js functionality including colors and Unicode.

## Example Project

For a complete example of using this component, see the [web-cli example](https://github.com/ably/cli/tree/main/examples/web-cli) in the Ably CLI repository.

## License

[Apache-2.0](https://github.com/ably/cli/blob/main/LICENSE)
