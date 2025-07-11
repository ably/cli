import { AblyCliTerminal } from "@ably/react-web-cli";
import { useCallback, useEffect, useState } from "react";
import { Key, Settings, Shield } from "lucide-react";

import "./App.css";
import { CliDrawer } from "./components/CliDrawer";
import { AuthSettings } from "./components/AuthSettings";
import { AuthScreen } from "./components/AuthScreen";

// Default WebSocket URL - use public endpoint for production, localhost for development
const DEFAULT_WEBSOCKET_URL = "wss://web-cli.ably.com";

// Get WebSocket URL from query parameters only
const getWebSocketUrl = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const serverParam = urlParams.get("serverUrl");
  if (serverParam) {
    console.log(`[App.tsx] Found serverUrl param: ${serverParam}`);
    return serverParam;
  }
  console.log(`[App.tsx] Using default URL: ${DEFAULT_WEBSOCKET_URL}`);
  return DEFAULT_WEBSOCKET_URL;
};

// Get credentials from various sources
const getInitialCredentials = () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  // Get the domain from the WebSocket URL for scoping
  const wsUrl = getWebSocketUrl();
  const wsDomain = new URL(wsUrl).host;
  
  // Check if we should clear credentials (for testing)
  if (urlParams.get('clearCredentials') === 'true') {
    localStorage.removeItem(`ably.web-cli.apiKey.${wsDomain}`);
    localStorage.removeItem(`ably.web-cli.accessToken.${wsDomain}`);
    localStorage.removeItem(`ably.web-cli.rememberCredentials.${wsDomain}`);
    // Also clear from sessionStorage
    sessionStorage.removeItem(`ably.web-cli.apiKey.${wsDomain}`);
    sessionStorage.removeItem(`ably.web-cli.accessToken.${wsDomain}`);
    // Remove the clearCredentials param from URL
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('clearCredentials');
    window.history.replaceState(null, '', cleanUrl.toString());
  }
  
  // Check localStorage for persisted credentials (if user chose to remember)
  const rememberCredentials = localStorage.getItem(`ably.web-cli.rememberCredentials.${wsDomain}`) === 'true';
  if (rememberCredentials) {
    const storedApiKey = localStorage.getItem(`ably.web-cli.apiKey.${wsDomain}`);
    const storedAccessToken = localStorage.getItem(`ably.web-cli.accessToken.${wsDomain}`);
    if (storedApiKey) {
      return { 
        apiKey: storedApiKey, 
        accessToken: storedAccessToken || undefined,
        source: 'localStorage' as const
      };
    }
  }
  
  // Check sessionStorage for session-only credentials
  const sessionApiKey = sessionStorage.getItem(`ably.web-cli.apiKey.${wsDomain}`);
  const sessionAccessToken = sessionStorage.getItem(`ably.web-cli.accessToken.${wsDomain}`);
  if (sessionApiKey) {
    return { 
      apiKey: sessionApiKey, 
      accessToken: sessionAccessToken || undefined,
      source: 'session' as const
    };
  }

  // Then check query parameters (only in non-production environments)
  const qsApiKey = urlParams.get('apikey') || urlParams.get('apiKey');
  const qsAccessToken = urlParams.get('accessToken') || urlParams.get('accesstoken');
  
  // Security check: only allow query param auth in development/test environments
  const isProduction = import.meta.env.PROD && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');
  
  if (qsApiKey) {
    if (isProduction) {
      console.error('Security Warning: API keys in query parameters are not allowed in production environments.');
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

  return { apiKey: undefined, accessToken: undefined, source: 'none' as const };
};

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
  const [isUsingCustomAuth, setIsUsingCustomAuth] = useState(initialCreds.source === 'session' || initialCreds.source === 'localStorage');
  const [authSource, setAuthSource] = useState(initialCreds.source);
  // Get the URL and domain early for use in state initialization
  const currentWebsocketUrl = getWebSocketUrl();
  const wsDomain = new URL(currentWebsocketUrl).host;
  const [rememberCredentials, setRememberCredentials] = useState(localStorage.getItem(`ably.web-cli.rememberCredentials.${wsDomain}`) === 'true');

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
  const handleAuthenticate = useCallback((newApiKey: string, newAccessToken: string, remember?: boolean) => {
    // Clear any existing session data when credentials change (domain-scoped)
    sessionStorage.removeItem(`ably.cli.sessionId.${wsDomain}`);
    sessionStorage.removeItem(`ably.cli.secondarySessionId.${wsDomain}`);
    sessionStorage.removeItem(`ably.cli.isSplit.${wsDomain}`);
    
    setApiKey(newApiKey);
    setAccessToken(newAccessToken);
    setIsAuthenticated(true);
    setShowAuthSettings(false);
    
    // Determine if we should remember based on parameter or current state
    const shouldRemember = remember !== undefined ? remember : rememberCredentials;
    
    if (shouldRemember) {
      // Store in localStorage for persistence (domain-scoped)
      localStorage.setItem(`ably.web-cli.apiKey.${wsDomain}`, newApiKey);
      localStorage.setItem(`ably.web-cli.rememberCredentials.${wsDomain}`, 'true');
      if (newAccessToken) {
        localStorage.setItem(`ably.web-cli.accessToken.${wsDomain}`, newAccessToken);
      } else {
        localStorage.removeItem(`ably.web-cli.accessToken.${wsDomain}`);
      }
      setAuthSource('localStorage');
    } else {
      // Store only in sessionStorage (domain-scoped)
      sessionStorage.setItem(`ably.web-cli.apiKey.${wsDomain}`, newApiKey);
      if (newAccessToken) {
        sessionStorage.setItem(`ably.web-cli.accessToken.${wsDomain}`, newAccessToken);
      } else {
        sessionStorage.removeItem(`ably.web-cli.accessToken.${wsDomain}`);
      }
      // Clear from localStorage if it was there (domain-scoped)
      localStorage.removeItem(`ably.web-cli.apiKey.${wsDomain}`);
      localStorage.removeItem(`ably.web-cli.accessToken.${wsDomain}`);
      localStorage.removeItem(`ably.web-cli.rememberCredentials.${wsDomain}`);
      setAuthSource('session');
    }
    
    setRememberCredentials(shouldRemember);
    setIsUsingCustomAuth(true);
  }, [rememberCredentials, wsDomain]);

  // Handle auth settings save
  const handleAuthSettingsSave = useCallback((newApiKey: string, newAccessToken: string, remember: boolean) => {
    if (newApiKey) {
      handleAuthenticate(newApiKey, newAccessToken, remember);
    } else {
      // Clear all credentials - go back to auth screen (domain-scoped)
      sessionStorage.removeItem(`ably.cli.sessionId.${wsDomain}`);
      sessionStorage.removeItem(`ably.cli.secondarySessionId.${wsDomain}`);
      sessionStorage.removeItem(`ably.cli.isSplit.${wsDomain}`);
      sessionStorage.removeItem(`ably.web-cli.apiKey.${wsDomain}`);
      sessionStorage.removeItem(`ably.web-cli.accessToken.${wsDomain}`);
      localStorage.removeItem(`ably.web-cli.apiKey.${wsDomain}`);
      localStorage.removeItem(`ably.web-cli.accessToken.${wsDomain}`);
      localStorage.removeItem(`ably.web-cli.rememberCredentials.${wsDomain}`);
      setApiKey(undefined);
      setAccessToken(undefined);
      setIsAuthenticated(false);
      setIsUsingCustomAuth(false);
      setShowAuthSettings(false);
      setRememberCredentials(false);
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
      />
    ) : null
  ), [isAuthenticated, apiKey, accessToken, handleConnectionChange, handleSessionEnd, handleSessionId, currentWebsocketUrl]);

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return <AuthScreen 
      onAuthenticate={handleAuthenticate} 
      rememberCredentials={rememberCredentials}
      onRememberChange={setRememberCredentials}
    />;
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
                <span className="text-sm">Session Auth</span>
              </>
            ) : authSource === 'localStorage' ? (
              <>
                <Shield size={16} className="text-green-500" />
                <span className="text-sm">Saved Auth</span>
              </>
            ) : authSource === 'query' ? (
              <>
                <Key size={16} className="text-blue-500" />
                <span className="text-sm">Query Params</span>
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
        rememberCredentials={rememberCredentials}
      />
    </div>
  );
}

export default App;
