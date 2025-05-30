// Define the message structure for server-to-client status updates
export type ServerStatusMessage = {
  type: "status";
  payload: "connecting" | "connected" | "disconnected" | "error";
  reason?: string;
  details?: unknown;
}; 