/**
 * Connection status messages for the web terminal.
 * Provides user-friendly messages with local CLI installation instructions.
 */

export interface ConnectionMessage {
  title: string;
  lines: string[];
}

export const CONNECTION_MESSAGES = {
  connectionFailed: {
    title: "CONNECTION FAILED",
    lines: [
      "Unable to connect to the web terminal service.",
      "",
      "For uninterrupted access, install the Ably CLI locally:",
      "  npm install -g @ably/web-cli",
      "",
      "Press ⏎ to retry connection"
    ]
  },
  
  serverDisconnect: {
    title: "SERVER DISCONNECTED", 
    lines: [
      "The web terminal service is currently unavailable.",
      "",
      "Install the CLI locally for reliable access:",
      "  npm install -g @ably/web-cli",
      "",
      "Press ⏎ to reconnect"
    ]
  },
  
  maxReconnects: {
    title: "SERVICE UNAVAILABLE",
    lines: [
      "Web terminal service is temporarily unavailable.",
      "",
      "For continuous access, install locally:",
      "  npm install -g @ably/web-cli",
      "",
      "Once installed, run 'ably' to get started.",
      "",
      "Press ⏎ to try again"
    ]
  },
  
  capacityReached: {
    title: "AT CAPACITY",
    lines: [
      "Web terminal service is at capacity.",
      "",
      "Install the CLI locally for immediate access:",
      "  npm install -g @ably/web-cli",
      "",
      "The local CLI doesn't require web sessions.",
      "",
      "Press ⏎ to retry"
    ]
  },

  connectionTimeout: {
    title: "CONNECTION TIMEOUT",
    lines: [
      "Connection to web terminal timed out.",
      "",
      "For faster access, install locally:",
      "  npm install -g @ably/web-cli", 
      "",
      "Press ⏎ to reconnect"
    ]
  },

  reconnectCancelled: {
    title: "RECONNECTION CANCELLED",
    lines: [
      "Reconnection attempts cancelled.",
      "",
      "Install the CLI locally to avoid connection issues:",
      "  npm install -g @ably/web-cli",
      "",
      "Press ⏎ to reconnect"
    ]
  },

  reconnectingWithInstall: {
    title: "RECONNECTING",
    lines: [
      "Reconnecting to Ably CLI server...",
      "",
      "Having trouble? Install the CLI locally:",
      "  npm install -g @ably/web-cli",
      "",
      "Press ⏎ to cancel reconnection"
    ]
  }
};

export function getConnectionMessage(type: keyof typeof CONNECTION_MESSAGES): ConnectionMessage {
  return CONNECTION_MESSAGES[type];
}

