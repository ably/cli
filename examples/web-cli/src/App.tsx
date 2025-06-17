import { AblyCliTerminal } from "@ably/react-web-cli";
import { useCallback, useEffect, useState } from "react";
import { Key, Settings, Shield } from "lucide-react";

import "./App.css";
import { CliDrawer } from "./components/CliDrawer";
import { AuthSettings } from "./components/AuthSettings";
import { AuthScreen } from "./components/AuthScreen";

// Default WebSocket URL - use public endpoint for production, localhost for development
const DEFAULT_WEBSOCKET_URL = "wss://web-cli.ably.com";

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

// Get credentials from various sources
const getInitialCredentials = () => {
  // Check sessionStorage first for persisted session credentials
  const storedApiKey = sessionStorage.getItem('ably.web-cli.apiKey');
  const storedAccessToken = sessionStorage.getItem('ably.web-cli.accessToken');
  if (storedApiKey) {
    return { 
      apiKey: storedApiKey, 
      accessToken: storedAccessToken || undefined,
      source: 'session' as const
    };
  }

  // Then check query parameters (only in non-production environments)
  const urlParams = new URLSearchParams(window.location.search);
  const qsApiKey = urlParams.get('apikey') || urlParams.get('apiKey');
  const qsAccessToken = urlParams.get('accessToken') || urlParams.get('accesstoken');
  
  // Security check: only allow query param auth in development/test environments
  const isProduction = import.meta.env.PROD && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');
  
  if (qsApiKey) {
    if (isProduction) {
      console.error('Security Warning: API keys in query parameters are not allowed in production environments. Please use environment variables or the authentication form.');
      // Clear the sensitive query parameters from the URL
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('apikey');
      cleanUrl.searchParams.delete('apiKey');
      cleanUrl.searchParams.delete('accessToken');
      cleanUrl.searchParams.delete('accesstoken');
      window.history.replaceState(null, '', cleanUrl.toString());
    } else {
      return { 
        apiKey: qsApiKey, 
        accessToken: qsAccessToken || undefined,
        source: 'query' as const
      };
    }
  }

  // Finally check environment variables
  const envApiKey = import.meta.env.VITE_ABLY_API_KEY as string | undefined;
  const envAccessToken = import.meta.env.VITE_ABLY_ACCESS_TOKEN as string | undefined;
  if (envApiKey) {
    return { 
      apiKey: envApiKey, 
      accessToken: envAccessToken || undefined,
      source: 'env' as const
    };
  }

  return { apiKey: undefined, accessToken: undefined, source: 'none' as const };
};

// Check if environment variables are available
const hasEnvCredentials = Boolean(import.meta.env.VITE_ABLY_API_KEY);

function App() {
  // Read initial mode from URL, default to fullscreen
  const initialMode = new URLSearchParams(window.location.search).get("mode") as ("fullscreen" | "drawer") || "fullscreen";

  type TermStatus = 'initial' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
  const [connectionStatus, setConnectionStatus] = useState<TermStatus>('disconnected');
  const [displayMode, setDisplayMode] = useState<"fullscreen" | "drawer">(initialMode);
  const [showAuthSettings, setShowAuthSettings] = useState(false);
  
  // Initialize credentials
  const initialCreds = getInitialCredentials();
  const [apiKey, setApiKey] = useState<string | undefined>(initialCreds.apiKey);
  const [accessToken, setAccessToken] = useState<string | undefined>(initialCreds.accessToken);
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(initialCreds.apiKey && initialCreds.apiKey.trim()));
  const [isUsingCustomAuth, setIsUsingCustomAuth] = useState(initialCreds.source === 'session');
  const [authSource, setAuthSource] = useState(initialCreds.source);

  // Store the latest sessionId globally for E2E tests / debugging
  const handleSessionId = useCallback((id: string) => {
    console.log(`[App] Received sessionId: ${id}`);
    (window as any)._sessionId = id; // Expose for Playwright
  }, []);

  const handleConnectionChange = useCallback((status: TermStatus) => {
    console.log("Connection Status:", status);
    setConnectionStatus(status);
  }, []);

  const handleSessionEnd = useCallback((reason: string) => {
    console.log("Session ended:", reason);
  }, []);

  // Handle authentication
  const handleAuthenticate = useCallback((newApiKey: string, newAccessToken: string) => {
    // Clear any existing session data when credentials change
    sessionStorage.removeItem('ably.cli.sessionId');
    sessionStorage.removeItem('ably.cli.secondarySessionId');
    sessionStorage.removeItem('ably.cli.isSplit');
    
    setApiKey(newApiKey);
    setAccessToken(newAccessToken);
    setIsAuthenticated(true);
    setShowAuthSettings(false);
    
    // Store in session storage
    sessionStorage.setItem('ably.web-cli.apiKey', newApiKey);
    if (newAccessToken) {
      sessionStorage.setItem('ably.web-cli.accessToken', newAccessToken);
    } else {
      sessionStorage.removeItem('ably.web-cli.accessToken');
    }
    setIsUsingCustomAuth(true);
    setAuthSource('session');
  }, []);

  // Handle auth settings save
  const handleAuthSettingsSave = useCallback((newApiKey: string, newAccessToken: string, useDefaults: boolean) => {
    if (useDefaults && hasEnvCredentials) {
      // Clear any existing session data when credentials change
      sessionStorage.removeItem('ably.cli.sessionId');
      sessionStorage.removeItem('ably.cli.secondarySessionId');
      sessionStorage.removeItem('ably.cli.isSplit');
      
      // Reset to environment defaults
      const envApiKey = import.meta.env.VITE_ABLY_API_KEY as string;
      const envAccessToken = import.meta.env.VITE_ABLY_ACCESS_TOKEN as string | undefined;
      setApiKey(envApiKey);
      setAccessToken(envAccessToken);
      sessionStorage.removeItem('ably.web-cli.apiKey');
      sessionStorage.removeItem('ably.web-cli.accessToken');
      setIsUsingCustomAuth(false);
      setShowAuthSettings(false);
    } else if (newApiKey) {
      handleAuthenticate(newApiKey, newAccessToken);
    } else if (!newApiKey && !useDefaults) {
      // Clear credentials - go back to auth screen
      sessionStorage.removeItem('ably.cli.sessionId');
      sessionStorage.removeItem('ably.cli.secondarySessionId');
      sessionStorage.removeItem('ably.cli.isSplit');
      sessionStorage.removeItem('ably.web-cli.apiKey');
      sessionStorage.removeItem('ably.web-cli.accessToken');
      setApiKey(undefined);
      setAccessToken(undefined);
      setIsAuthenticated(false);
      setIsUsingCustomAuth(false);
      setShowAuthSettings(false);
    }
  }, [handleAuthenticate]);

  // Effect to update URL when displayMode changes
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("mode") !== displayMode) {
      urlParams.set("mode", displayMode);
      window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);
    }
  }, [displayMode]);

  // Get the URL *inside* the component body
  const currentWebsocketUrl = getWebSocketUrl();

  // Prepare the terminal component instance to pass it down
  const TerminalInstance = useCallback(() => (
    isAuthenticated && apiKey && apiKey.trim() ? (
      <AblyCliTerminal
        ablyAccessToken={accessToken}
        ablyApiKey={apiKey}
        onConnectionStatusChange={handleConnectionChange}
        onSessionEnd={handleSessionEnd}
        onSessionId={handleSessionId}
        websocketUrl={currentWebsocketUrl}
        resumeOnReload={true}
        enableSplitScreen={true}
        maxReconnectAttempts={5} /* In the example, limit reconnection attempts for testing, default is 15 */
        initialCommand="echo 'Connecting to Ably CLI Terminal...'"
      />
    ) : null
  ), [isAuthenticated, apiKey, accessToken, handleConnectionChange, handleSessionEnd, handleSessionId, currentWebsocketUrl]);

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return <AuthScreen onAuthenticate={handleAuthenticate} />;
  }

  return (
    <div className="App fixed">
      {/* Updated header with auth button */}
      <header className="App-header">
        <span className="font-semibold text-base">Ably Web CLI Terminal</span>
        <div className="header-info">
          <span>Status: <span className={`status status-${connectionStatus}`}>{connectionStatus}</span></span>
          <span>Server: {currentWebsocketUrl}</span>
          <button
            onClick={() => setShowAuthSettings(true)}
            className="auth-button flex items-center space-x-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
            title="Authentication Settings"
          >
            {authSource === 'session' ? (
              <>
                <Key size={16} />
                <span className="text-sm">Custom Auth</span>
              </>
            ) : authSource === 'query' ? (
              <>
                <Key size={16} className="text-blue-500" />
                <span className="text-sm">Query Params</span>
              </>
            ) : authSource === 'env' ? (
              <>
                <Shield size={16} className="text-green-500" />
                <span className="text-sm">Default Auth</span>
              </>
            ) : (
              <>
                <Shield size={16} />
                <span className="text-sm">Auth</span>
              </>
            )}
            <Settings size={14} className="ml-1 opacity-50" />
          </button>
        </div>
        <div className="toggle-group">
          <button
            className={`toggle-segment ${displayMode === 'fullscreen' ? 'active' : ''}`}
            onClick={() => setDisplayMode('fullscreen')}
          >
            Fullscreen
          </button>
          <button
            className={`toggle-segment ${displayMode === 'drawer' ? 'active' : ''}`}
            onClick={() => setDisplayMode('drawer')}
          >
            Drawer
          </button>
        </div>
      </header>

      {/* Main content */}
      {displayMode === 'fullscreen' ? (
        <main className="App-main no-padding">
          <div className="Terminal-container">
            <TerminalInstance />
          </div>
        </main>
      ) : (
        <CliDrawer TerminalComponent={TerminalInstance} />
      )}

      {/* Auth settings modal */}
      <AuthSettings
        isOpen={showAuthSettings}
        onClose={() => setShowAuthSettings(false)}
        onSave={handleAuthSettingsSave}
        currentApiKey={apiKey}
        currentAccessToken={accessToken}
        hasEnvDefaults={hasEnvCredentials}
        isUsingCustomAuth={isUsingCustomAuth}
      />
    </div>
  );
}

export default App;
