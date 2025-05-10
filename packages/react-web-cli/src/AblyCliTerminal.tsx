import React, { useEffect, useRef, useState, useCallback } from 'react';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  getAttempts as grGetAttempts,
  getMaxAttempts as grGetMaxAttempts,
  isCancelledState as grIsCancelledState,
  isMaxAttemptsReached as grIsMaxAttemptsReached,
  resetState as grResetState,
  increment as grIncrement,
  cancelReconnect as grCancelReconnect,
  scheduleReconnect as grScheduleReconnect,
  setCountdownCallback as grSetCountdownCallback
} from './global-reconnect';

export type ConnectionStatus = 'initial' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

const MAX_PTY_BUFFER_LENGTH = 10000; // Max 10k chars in the buffer

// Prompts that indicate the terminal is ready for input
const TERMINAL_PROMPT_IDENTIFIER = '$ '; // Corrected prompt

export interface AblyCliTerminalProps {
  websocketUrl: string;
  ablyAccessToken?: string;
  ablyApiKey?: string;
  initialCommand?: string;
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  onSessionEnd?: (reason: string) => void;
  /**
   * Called once when the server sends the initial "hello" message containing the sessionId.
   * This is useful for embedding apps that want to display or persist the current session.
   */
  onSessionId?: (sessionId: string) => void;
  /**
   * When true, the component stores the current sessionId in localStorage on
   * page unload and attempts to resume that session on the next mount.
   */
  resumeOnReload?: boolean;
}

interface ConnectionStatusHeaderProps {
  connectionStatus: ConnectionStatus;
  connectionHelpMessage: string;
  isSessionActive: boolean;
}
const ConnectionStatusHeader: React.FC<ConnectionStatusHeaderProps> = ({ connectionStatus, connectionHelpMessage, isSessionActive }) => {
  console.log(`[ConnectionStatusHeader RENDER] isSessionActive: ${isSessionActive}, connectionStatus: "${connectionStatus}", connectionHelpMessage: "${connectionHelpMessage}"`);

  // Show help message only before full session becomes active (e.g., while connecting)
  if (!isSessionActive && connectionHelpMessage) {
    console.log('[ConnectionStatusHeader RENDER] Condition MET: !isSessionActive && connectionHelpMessage. Rendering help message.');
    return <div data-testid="connection-help-message" style={{ fontSize: '0.8em', marginBottom: '4px', color: '#888' }}>{connectionHelpMessage}</div>;
  }
  
  if (!isSessionActive && connectionStatus === 'reconnecting') {
    console.log('[ConnectionStatusHeader RENDER] Condition MET: !isSessionActive && connectionStatus === "reconnecting". ReconnectOverlay should be active.');
  }

  console.log('[ConnectionStatusHeader RENDER] No primary condition met. Rendering null.');
  return null;
};

interface ReconnectOverlayProps {
  attemptMessage: string;
  countdownMessage: string;
}
const ReconnectOverlay: React.FC<ReconnectOverlayProps> = ({ attemptMessage, countdownMessage }) => (
  <div 
    data-testid="reconnect-overlay"
    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, pointerEvents: 'none' }}
  >
    {attemptMessage && <div data-testid="reconnect-attempt-message" style={{ fontSize: '1.2em', marginBottom: '10px' }}>{attemptMessage}</div>}
    {countdownMessage && <div data-testid="reconnect-countdown-timer" style={{ fontSize: '1em' }}>{countdownMessage}</div>}
    <div style={{ marginTop: '20px', fontSize: '0.9em' }}>(Press Enter to cancel reconnect attempts)</div>
  </div>
);

export const AblyCliTerminal: React.FC<AblyCliTerminalProps> = ({
  websocketUrl,
  ablyAccessToken,
  ablyApiKey,
  initialCommand,
  onConnectionStatusChange,
  onSessionEnd,
  onSessionId,
  resumeOnReload,
}) => {
  const [componentConnectionStatus, setComponentConnectionStatusState] = useState<ConnectionStatus>('initial');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [connectionHelpMessage, setConnectionHelpMessage] = useState('');
  const [reconnectAttemptMessage, setReconnectAttemptMessage] = useState('');
  const [countdownMessage, setCountdownMessage] = useState('');

  // Track the current sessionId received from the server (if any)
  const [sessionId, setSessionId] = useState<string | null>(
    () => {
      if (resumeOnReload && typeof window !== 'undefined') {
        return window.sessionStorage.getItem('ably.cli.sessionId');
      }
      return null;
    }
  );

  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [showManualReconnectPrompt, setShowManualReconnectPrompt] = useState(false);
  
  const rootRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon>();
  const lastWriteLine = useRef<string>('');
  const ptyBuffer = useRef('');
  // Keep a ref in sync with the latest connection status so event handlers have up-to-date value
  const connectionStatusRef = useRef<ConnectionStatus>('initial');

  // Ref to track manual reconnect prompt visibility inside stable event handlers
  const showManualReconnectPromptRef = useRef<boolean>(false);

  // Keep the ref in sync with React state so key handlers can rely on it
  useEffect(() => {
    showManualReconnectPromptRef.current = showManualReconnectPrompt;
  }, [showManualReconnectPrompt]);

  const updateConnectionStatusAndExpose = useCallback((status: ConnectionStatus) => {
    console.log(`[AblyCLITerminal] updateConnectionStatusAndExpose called with: ${status}`);
    setComponentConnectionStatusState(status);
    // (window as any).componentConnectionStatusForTest = status; // Keep for direct inspection if needed, but primary is below
    // console.log(`[AblyCLITerminal] (window as any).componentConnectionStatusForTest SET TO: ${status}`);
    
    // Call playwright hook if it exists
    if (typeof (window as any).setWindowTestFlagOnStatusChange === 'function') {
      (window as any).setWindowTestFlagOnStatusChange(status);
      console.log(`[AblyCLITerminal] Called (window as any).setWindowTestFlagOnStatusChange with ${status}`);
    }

    if (onConnectionStatusChange) {
      onConnectionStatusChange(status);
    }
  }, [onConnectionStatusChange]);

  useEffect(() => {
    connectionStatusRef.current = componentConnectionStatus;
  }, [componentConnectionStatus]);

  useEffect(() => {
    if (isSessionActive) {
      setConnectionHelpMessage('Connected to Ably CLI terminal server');
    } else {
      setConnectionHelpMessage(''); // Clear help message when not active
    }
  }, [isSessionActive]);

  const clearPtyBuffer = useCallback(() => {
    ptyBuffer.current = '';
  }, []);
  
  const handlePtyData = useCallback((data: string) => {
    if (!isSessionActive) {
      ptyBuffer.current += data;
      if (ptyBuffer.current.length > MAX_PTY_BUFFER_LENGTH) {
        ptyBuffer.current = ptyBuffer.current.slice(ptyBuffer.current.length - MAX_PTY_BUFFER_LENGTH);
      }
      if (ptyBuffer.current.includes(TERMINAL_PROMPT_IDENTIFIER)) {
        console.log('[AblyCLITerminal] Terminal prompt detected. Session active.');
        setIsSessionActive(true);
        // Full session confirmed – now reset global reconnect state
        grResetState();
        updateConnectionStatusAndExpose('connected'); // Explicitly set to connected
        if (term.current) term.current.focus();
        clearPtyBuffer();
      }
    }
  }, [isSessionActive, updateConnectionStatusAndExpose, clearPtyBuffer]);

  const clearAnimationMessages = useCallback(() => {
    setReconnectAttemptMessage('');
    setCountdownMessage('');
    if (term.current && lastWriteLine.current) {
      term.current.write('\r\x1b[K'); // Clear line
    }
    lastWriteLine.current = '';
  }, []);
  
  const startConnectingAnimation = useCallback((isRetry: boolean) => {
    clearAnimationMessages();
    if (term.current) {
      const currentAttempts = grGetAttempts(); // Now 0-indexed for number of *past* failures
      setReconnectAttemptMessage(isRetry ? `Attempt ${currentAttempts + 1}/${grGetMaxAttempts()}` : 'Connecting...');
      // For retries we still log to console; do NOT print text inside the terminal anymore
      if (isRetry) {
        console.log(`[AblyCLITerminal] Displaying reconnect attempt: ${currentAttempts + 1}`);
      }
    }
  }, [clearAnimationMessages]);

  const connectWebSocket = useCallback(() => {
    console.log('[AblyCLITerminal] connectWebSocket called.');
    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
      console.log('[AblyCLITerminal] Closing existing socket before creating new one.');
      socketRef.current.close();
    }

    updateConnectionStatusAndExpose(grIsCancelledState() || grIsMaxAttemptsReached() ? 'disconnected' : (grGetAttempts() > 0 ? 'reconnecting' : 'connecting'));
    startConnectingAnimation(grGetAttempts() > 0);

    const newSocket = new WebSocket(websocketUrl);
    (window as any).ablyCliSocket = newSocket; // For E2E tests
    socketRef.current = newSocket; // Use ref for listeners
    setSocket(newSocket); // Trigger effect to add listeners

    console.log(`[AblyCLITerminal] New WebSocket created for ${websocketUrl}`);
  }, [websocketUrl, updateConnectionStatusAndExpose, startConnectingAnimation]);

  const socketRef = useRef<WebSocket | null>(null); // Ref to hold the current socket for cleanup

  const handleWebSocketOpen = useCallback(() => {
    console.log('[AblyCLITerminal] WebSocket opened');
    // Do not reset reconnection attempts here; wait until terminal prompt confirms full session
    setShowManualReconnectPrompt(false);
    clearPtyBuffer(); // Clear buffer for new session prompt detection

    if (term.current) {
      term.current.focus();
      if (initialCommand) {
        setTimeout(() => { term.current?.write(`${initialCommand}\r`); }, 500);
      }
    }
    const payload: any = {
      environmentVariables: { ABLY_WEB_CLI_MODE: 'true' } };
    if (ablyAccessToken) payload.accessToken = ablyAccessToken;
    else if (ablyApiKey) payload.apiKey = ablyApiKey;
    if (sessionId) payload.sessionId = sessionId;
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }

    // persistence handled by dedicated useEffect
  }, [clearAnimationMessages, ablyAccessToken, ablyApiKey, initialCommand, updateConnectionStatusAndExpose, clearPtyBuffer, sessionId, resumeOnReload]);

  const handleWebSocketMessage = useCallback(async (event: MessageEvent) => {
    try {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'hello' && typeof msg.sessionId === 'string') {
            console.log(`[AblyCLITerminal] Received hello. sessionId=${msg.sessionId}`);
            setSessionId(msg.sessionId);
            if (onSessionId) onSessionId(msg.sessionId);
            return;
          }
          if (msg.type === 'status') {
            console.log(`[AblyCLITerminal] Received server status message: ${msg.payload}`);
            // Server-driven status might override client, or inform it.
            // For now, client primarily drives its status based on WebSocket events and PTY.
            if (msg.payload === 'error' || msg.payload === 'disconnected') {
              const reason = msg.reason || (msg.payload === 'error' ? 'Server error' : 'Server disconnected');
              if (term.current) term.current.writeln(`\r\n--- ${msg.payload === 'error' ? 'Error' : 'Session Ended (from server)'}: ${reason} ---`);
              if (onSessionEnd) onSessionEnd(reason);
              updateConnectionStatusAndExpose(msg.payload); // Reflect server's final say
              if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) socketRef.current.close();
            }
            return;
          }
        } catch (_e) { /* Not JSON, likely PTY data */ }
      }
      
      let dataStr: string;
      if (typeof event.data === 'string') dataStr = event.data;
      else if (event.data instanceof Blob) dataStr = await event.data.text();
      else if (event.data instanceof ArrayBuffer) dataStr = new TextDecoder().decode(event.data);
      else dataStr = new TextDecoder().decode(event.data); // Should handle Uint8Array from server

      if (term.current) term.current.write(dataStr);
      handlePtyData(dataStr); // Pass PTY data for prompt detection

    } catch (_e) { console.error('[AblyCLITerminal] Error processing message:', _e); }
  }, [handlePtyData, onSessionEnd, updateConnectionStatusAndExpose]);

  const handleWebSocketError = useCallback((event: Event) => {
    console.error('[AblyCLITerminal] WebSocket error event received:', event);
    // Add more details if possible, though Event object is generic
    if (event instanceof ErrorEvent) {
      console.error(`[AblyCLITerminal] WebSocket ErrorEvent: message=${event.message}, filename=${event.filename}, lineno=${event.lineno}, colno=${event.colno}`);
    }

    if (!grIsCancelledState() && !grIsMaxAttemptsReached()) { // Avoid error state if we are already done trying
      updateConnectionStatusAndExpose('error'); // Indicate error, close will follow
    }
  }, [updateConnectionStatusAndExpose]);

  const handleWebSocketClose = useCallback((event: CloseEvent) => {
    console.log(`[AblyCLITerminal] WebSocket closed. Code: ${event.code}, Reason: "${event.reason || 'N/A'}", WasClean: ${event.wasClean}`);
    clearAnimationMessages();
    setIsSessionActive(false); // Session is no longer active

    // --- Handle non-recoverable server-initiated disconnects ---
    // These status codes indicate problems that automatic reconnection cannot fix
    // and therefore require user intervention (e.g. invalid credentials or capacity issues)
    const NON_RECOVERABLE_CLOSE_CODES = new Set<number>([
      4001, // Invalid token / credentials
      4008, // Policy violation / auth timeout / invalid message format
      1013, // Try again later (server overloaded / capacity)
    ]);

    if (NON_RECOVERABLE_CLOSE_CODES.has(event.code)) {
      // Ensure any global reconnection timers are cleared
      grCancelReconnect();
      grResetState();

      updateConnectionStatusAndExpose('disconnected');

      if (term.current) {
        term.current.writeln(`\r\n--- Connection closed by server (${event.code})${event.reason ? `: ${event.reason}` : ''} ---`);
        term.current.writeln('Press Enter to try reconnecting manually.');
      }

      setShowManualReconnectPrompt(true);
      return; // Do NOT schedule automatic reconnection
    }

    if (grIsCancelledState() || grIsMaxAttemptsReached()) {
      updateConnectionStatusAndExpose('disconnected');
      if (term.current) {
        term.current.writeln(`\r\n--- Connection Closed (Code: ${event.code}, Reason: ${event.reason || 'N/A'}) ---`);
        if (grIsMaxAttemptsReached()) {
          term.current.writeln(`\r\nFailed to reconnect after ${grGetMaxAttempts()} attempts.`);
        } else { // Cancelled
          term.current.writeln(`\r\nReconnection attempts cancelled.`);
        }
        term.current.writeln("Press Enter to try reconnecting manually.");
      }
      setShowManualReconnectPrompt(true);
    } else {
      grIncrement(); // Increment attempts only if we are going to retry
      console.log('[AblyCLITerminal handleWebSocketClose] PRE - Calling updateConnectionStatusAndExpose("reconnecting")');
      updateConnectionStatusAndExpose('reconnecting');
      console.log('[AblyCLITerminal handleWebSocketClose] POST - Called updateConnectionStatusAndExpose("reconnecting")');
      grScheduleReconnect(connectWebSocket, websocketUrl);
      setReconnectAttemptMessage(`Attempt ${grGetAttempts()}/${grGetMaxAttempts()}.`);
    }
  }, [clearAnimationMessages, connectWebSocket, updateConnectionStatusAndExpose]);

  useEffect(() => {
    // Setup terminal
    if (!term.current && rootRef.current) {
      console.log('[AblyCLITerminal] Initializing Terminal instance.');
      term.current = new Terminal({
        cursorBlink: true, cursorStyle: 'block', fontFamily: 'monospace', fontSize: 14,
        theme: { background: '#000000', foreground: '#abb2bf', cursor: '#528bff', selectionBackground: '#3e4451', selectionForeground: '#ffffff' },
        convertEol: true,
      });
      fitAddon.current = new FitAddon();
      term.current.loadAddon(fitAddon.current);
      
      term.current.onData((data: string) => {
        // Special handling for Enter key
        if (data === '\r') {
          const latestStatus = connectionStatusRef.current;

          // Manual prompt visible: attempt manual reconnect even if an old socket is open
          if (showManualReconnectPromptRef.current) {
            console.log('[AblyCLITerminal] Enter pressed for manual reconnect.');
            showManualReconnectPromptRef.current = false;
            setShowManualReconnectPrompt(false);
            grResetState();
            clearPtyBuffer();
            connectWebSocket();
            return;
          }

          // Cancel ongoing auto-reconnect
          if (latestStatus === 'reconnecting' && !grIsCancelledState()) {
            console.log('[AblyCLITerminal] Enter pressed during auto-reconnect: Cancelling.');
            grCancelReconnect();
            clearAnimationMessages();
            if (term.current) {
              term.current.writeln("\r\n\nReconnection attempts cancelled by user.");
              term.current.writeln("Press Enter to try reconnecting manually.");
            }
            showManualReconnectPromptRef.current = true;
            setShowManualReconnectPrompt(true);
            updateConnectionStatusAndExpose('disconnected');
            return;
          }
        }

        // Default: forward data to server if socket open
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(data);
        } else if (data === '\r') {
          // If the connection is not open and none of the above special cases matched,
          // do nothing (prevent accidental writes to closed socket).
        }
      });

      term.current.open(rootRef.current);
      try {
        fitAddon.current.fit();
        const resizeObserver = new ResizeObserver(() => {
          try { fitAddon.current?.fit(); } catch (e) { console.warn("Error fitting addon on resize:", e); }
        });
        if (rootRef.current) resizeObserver.observe(rootRef.current);
        setTimeout(() => { try { fitAddon.current?.fit(); } catch(e) { console.warn("Error fitting addon initial timeout:", e);}}, 100);
      } catch (e) {
        console.error("Error during initial terminal fit:", e);
      }
      
      grSetCountdownCallback((remainingMs) => {
        setCountdownMessage(`Next attempt in ${Math.ceil(remainingMs / 1000)}s...`);
      });
    }

    // Initial connection
    if (componentConnectionStatus === 'initial') {
      console.log('[AblyCLITerminal] Initial effect: Starting connection.');
      grResetState();
      clearPtyBuffer();
      connectWebSocket();
    }

    // Cleanup terminal on unmount
    return () => {
      if (term.current) {
        console.log('[AblyCLITerminal] Disposing Terminal on unmount');
        term.current.dispose();
        term.current = null;
      }
      if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
        console.log('[AblyCLITerminal] Closing WebSocket on unmount.');
        socketRef.current.close();
      }
      grResetState(); // Ensure global state is clean
    };
  }, []);

  useEffect(() => {
    // Expose a debug function to get current component state for Playwright
    (window as any).getAblyCliTerminalReactState = () => ({
      componentConnectionStatus,
      isSessionActive,
      connectionHelpMessage,
      reconnectAttemptMessage,
      countdownMessage,
      showManualReconnectPrompt,
      grCurrentAttempts: grGetAttempts(),
      grIsCancelled: grIsCancelledState(),
      grIsMaxReached: grIsMaxAttemptsReached(),
    });
    return () => {
      delete (window as any).getAblyCliTerminalReactState;
    };
  }, [
    componentConnectionStatus, isSessionActive, connectionHelpMessage, 
    reconnectAttemptMessage, countdownMessage, showManualReconnectPrompt
  ]); // Update whenever these state variables change

  useEffect(() => {
    // Effect for managing WebSocket event listeners
    if (socket) {
      console.log('[AblyCLITerminal] New socket detected, attaching event listeners.');
      socket.addEventListener('open', handleWebSocketOpen);
      socket.addEventListener('message', handleWebSocketMessage);
      socket.addEventListener('close', handleWebSocketClose);
      socket.addEventListener('error', handleWebSocketError);

      return () => {
        console.log('[AblyCLITerminal] Cleaning up WebSocket event listeners for old socket.');
        socket.removeEventListener('open', handleWebSocketOpen);
        socket.removeEventListener('message', handleWebSocketMessage);
        socket.removeEventListener('close', handleWebSocketClose);
        socket.removeEventListener('error', handleWebSocketError);
      };
    }
  }, [socket, handleWebSocketOpen, handleWebSocketMessage, handleWebSocketClose, handleWebSocketError]);

  // Persist sessionId to localStorage whenever it changes (if enabled)
  useEffect(() => {
    if (!resumeOnReload || typeof window === 'undefined') return;
    if (sessionId) {
      window.sessionStorage.setItem('ably.cli.sessionId', sessionId);
    } else {
      window.sessionStorage.removeItem('ably.cli.sessionId');
    }
  }, [sessionId, resumeOnReload]);

  return (
    <div 
      ref={rootRef} 
      data-testid="terminal-container" 
      className="Terminal-container" 
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', padding: 0, boxSizing: 'border-box', backgroundColor: '#000000' }}
    >
      <ConnectionStatusHeader 
        connectionStatus={componentConnectionStatus}
        connectionHelpMessage={connectionHelpMessage}
        isSessionActive={isSessionActive}
      />
      {componentConnectionStatus === 'reconnecting' && !grIsCancelledState() && (
        <ReconnectOverlay
          attemptMessage={reconnectAttemptMessage}
          countdownMessage={countdownMessage}
        />
      )}
      {/* Terminal is mounted by term.current.open() */}
    </div>
  );
};

export default AblyCliTerminal;
