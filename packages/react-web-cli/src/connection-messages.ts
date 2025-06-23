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
      "Press ⏎ to reconnect"
    ]
  },
  
  serverDisconnect: {
    title: "SERVER DISCONNECTED", 
    lines: [
      "The web terminal service is currently unavailable.",
      "",
      "Press ⏎ to reconnect"
    ]
  },
  
  maxReconnects: {
    title: "SERVICE UNAVAILABLE",
    lines: [
      "Web terminal service is temporarily unavailable.",
      "",
      "Press ⏎ to reconnect"
    ]
  },
  
  capacityReached: {
    title: "AT CAPACITY",
    lines: [
      "Web terminal service is at capacity.",
      "",
      "Press ⏎ to reconnect"
    ]
  },

  connectionTimeout: {
    title: "CONNECTION TIMEOUT",
    lines: [
      "Connection to web terminal timed out.",
      "",
      "Press ⏎ to reconnect"
    ]
  },

  reconnectCancelled: {
    title: "RECONNECTION CANCELLED",
    lines: [
      "Reconnection attempts cancelled.",
      "",
      "Press ⏎ to reconnect"
    ]
  },

  reconnectingWithInstall: {
    title: "RECONNECTING",
    lines: [
      "Reconnecting to Ably CLI server...",
      "",
      "Press ⏎ to cancel"
    ]
  }
};

export function getConnectionMessage(type: keyof typeof CONNECTION_MESSAGES): ConnectionMessage {
  return CONNECTION_MESSAGES[type];
}

