import { AblyCliTerminal } from '@ably/react-web-cli'
import { useCallback, useEffect, useState } from 'react'

import './App.css'

// Default WebSocket URL assuming the terminal-server is run locally from the repo root
const DEFAULT_WEBSOCKET_URL = 'ws://localhost:8080';

// Get credentials from Vite environment variables (prefixed with VITE_)
const envApiKey = import.meta.env.VITE_ABLY_API_KEY;
const envAccessToken = import.meta.env.VITE_ABLY_ACCESS_TOKEN;

// Check if initial credentials were provided via env
const hasInitialCredentials = Boolean(envApiKey && envAccessToken);

function App() {
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected');
  const [apiKey, setApiKey] = useState<string | undefined>(envApiKey);
  const [accessToken, setAccessToken] = useState<string | undefined>(envAccessToken);
  
  // Remove state vars that cause remounting issues
  const [shouldConnect, setShouldConnect] = useState<boolean>(hasInitialCredentials);

  const handleConnectionChange = useCallback((status: 'connected' | 'connecting' | 'disconnected' | 'error') => {
      console.log('Connection Status:', status);
      setConnectionStatus(status);
  }, []);

  const handleSessionEnd = useCallback((reason: string) => {
    console.log('Session ended:', reason);
  }, []);

  // Set up credentials once on mount and immediately connect
  useEffect(() => {
    if (!hasInitialCredentials) {
      // For demo purposes only - in production get these from a secure API
      console.log('Setting demo credentials');
      setApiKey('fake.apiKey');
      setAccessToken('fakeAccessToken');
      setShouldConnect(true);
    }
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Ably CLI Web Terminal</h1>
        <div style={{ marginBottom: '10px' }}>
          Status: <span className={`status status-${connectionStatus}`}>{connectionStatus}</span>
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
                <button 
                  className="Restart-button"
                  onClick={onRestart}
                >
                  Restart Terminal
                </button>
              )}
              websocketUrl={DEFAULT_WEBSOCKET_URL}
            />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
