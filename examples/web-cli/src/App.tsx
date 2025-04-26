import { AblyCliTerminal } from "@ably/react-web-cli";
import { useCallback, useEffect, useState } from "react";

import "./App.css";

// Default WebSocket URL assuming the terminal-server is run locally from the repo root
const DEFAULT_WEBSOCKET_URL = "ws://localhost:8080";

// Get WebSocket URL from Vite environment variables or query parameters
const getWebSocketUrl = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const serverParam = urlParams.get("serverUrl");
  if (serverParam) {
    console.log(`[App.tsx] Found serverUrl param: ${serverParam}`);
    return serverParam;
  }
  const envServerUrl = import.meta.env.VITE_TERMINAL_SERVER_URL;
  if (envServerUrl) {
    console.log(`[App.tsx] Using env var VITE_TERMINAL_SERVER_URL: ${envServerUrl}`);
    return envServerUrl;
  }
  console.log(`[App.tsx] Falling back to default URL: ${DEFAULT_WEBSOCKET_URL}`);
  return DEFAULT_WEBSOCKET_URL;
};

// Get credentials from Vite environment variables (prefixed with VITE_)
const envApiKey = import.meta.env.VITE_ABLY_API_KEY;
const envAccessToken = import.meta.env.VITE_ABLY_ACCESS_TOKEN;

// Check if initial credentials were provided via env
const hasInitialCredentials = Boolean(envApiKey && envAccessToken);

function App() {
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "connecting" | "disconnected" | "error"
  >("disconnected");
  const [apiKey, setApiKey] = useState<string | undefined>(envApiKey);
  const [accessToken, setAccessToken] = useState<string | undefined>(
    envAccessToken,
  );

  // Remove state vars that cause remounting issues
  const [shouldConnect, setShouldConnect] = useState<boolean>(
    hasInitialCredentials,
  );

  const handleConnectionChange = useCallback(
    (status: "connected" | "connecting" | "disconnected" | "error") => {
      console.log("Connection Status:", status);
      setConnectionStatus(status);
    },
    [],
  );

  const handleSessionEnd = useCallback((reason: string) => {
    console.log("Session ended:", reason);
  }, []);

  // Set up credentials once on mount and immediately connect
  useEffect(() => {
    if (!hasInitialCredentials) {
      // For demo purposes only - in production get these from a secure API
      console.log("Setting demo credentials");
      setApiKey("dummy.key:secret"); // Use a realistic-looking key format
      // Provide a structurally valid (but fake) JWT
      setAccessToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
      setShouldConnect(true);
    }
  }, []);

  // Get the URL *inside* the component body
  const currentWebsocketUrl = getWebSocketUrl();

  return (
    <div className="App">
      <header className="App-header">
        <h1>Ably CLI Web Terminal</h1>
        <div style={{ marginBottom: "10px" }}>
          Status:{" "}
          <span className={`status status-${connectionStatus}`}>
            {connectionStatus}
          </span>
        </div>
        <div style={{ marginBottom: "10px", fontSize: "0.8em", color: "#888" }}>
          Server: {currentWebsocketUrl}
        </div>
      </header>
      <main className="App-main">
        <div className="Terminal-container">
          {shouldConnect && apiKey && accessToken && (
            <AblyCliTerminal
              ablyAccessToken={accessToken}
              ablyApiKey={apiKey}
              onConnectionStatusChange={handleConnectionChange}
              onSessionEnd={handleSessionEnd}
              renderRestartButton={(onRestart) => (
                <button className="Restart-button" onClick={onRestart}>
                  Restart Terminal
                </button>
              )}
              websocketUrl={currentWebsocketUrl}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
