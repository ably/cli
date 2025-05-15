import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import TerminalOverlay, {OverlayVariant} from './TerminalOverlay';
import { drawBox, clearBox, updateLine, colour as boxColour, type TerminalBox } from './terminal-box';
import {
  getAttempts as grGetAttempts,
  getMaxAttempts as grGetMaxAttempts,
  isCancelledState as grIsCancelledState,
  isMaxAttemptsReached as grIsMaxAttemptsReached,
  resetState as grResetState,
  cancelReconnect as grCancelReconnect,
  scheduleReconnect as grScheduleReconnect,
  setCountdownCallback as grSetCountdownCallback,
  setMaxAttempts as grSetMaxAttempts,
  successfulConnectionReset as grSuccessfulConnectionReset,
  increment as grIncrement
} from './global-reconnect';
import { useTerminalVisibility } from './use-terminal-visibility.js';

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
  maxReconnectAttempts?: number;
}

// Debug logging helper – disabled by default. To enable in local dev set
// window.ABLY_CLI_DEBUG = true in the browser console *before* the component
// mounts.
function debugLog(...args: unknown[]) {
  if (typeof window !== 'undefined' && (window as any).ABLY_CLI_DEBUG) {
    console.log('[AblyCLITerminal DEBUG]', ...args);
  }
}

// Automatically enable debug logging if ?cliDebug=true is present in the URL
if (typeof window !== 'undefined') {
  try {
    const urlFlag = new URLSearchParams(window.location.search).get('cliDebug');
    if (urlFlag === 'true') {
      (window as any).ABLY_CLI_DEBUG = true;
    }
  } catch { /* ignore URL parsing errors in non-browser env */ }
}

// Detect whether a chunk of text is part of the server-side PTY meta JSON that
// should never be rendered in the terminal.  We look for key markers that can
// appear in *either* fragment of a split WebSocket frame (e.g. the opening
// half may contain "\"stream\":true" while the closing half has
// "\"hijack\":true").  Using separate regexp checks allows us to filter
// partial fragments reliably without needing to reconstruct the full object.
function isHijackMetaChunk(txt: string): boolean {
  return /"stream"\s*:\s*true/.test(txt) || /"hijack"\s*:\s*true/.test(txt);
}

export const AblyCliTerminal: React.FC<AblyCliTerminalProps> = ({
  websocketUrl,
  ablyAccessToken,
  ablyApiKey,
  initialCommand,
  onConnectionStatusChange,
  onSessionEnd,
  onSessionId,
  resumeOnReload,
  maxReconnectAttempts,
}) => {
  const [componentConnectionStatus, setComponentConnectionStatusState] = useState<ConnectionStatus>('initial');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [connectionHelpMessage, setConnectionHelpMessage] = useState('');
  const [reconnectAttemptMessage, setReconnectAttemptMessage] = useState('');
  const [countdownMessage, setCountdownMessage] = useState('');
  const [overlay, setOverlay] = useState<null|{variant:OverlayVariant,title:string,lines:string[]}>(null);

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
  // Determine if terminal is visible (drawer open & tab visible)
  const isVisible = useTerminalVisibility(rootRef);
  const term = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon>();
  const ptyBuffer = useRef('');
  // Keep a ref in sync with the latest connection status so event handlers have up-to-date value
  const connectionStatusRef = useRef<ConnectionStatus>('initial');

  // Ref to track manual reconnect prompt visibility inside stable event handlers
  const showManualReconnectPromptRef = useRef<boolean>(false);
  // Guard to ensure we do NOT double-count a failed attempt when both the
  // `error` and the subsequent `close` events fire for the *same* socket.
  const reconnectScheduledThisCycleRef = useRef<boolean>(false);

  // Use block-based spinner where empty dots are invisible in most monospace fonts
  const spinnerFrames = ['●  ', ' ● ', '  ●', ' ● '];
  const spinnerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinnerIndexRef = useRef<number>(0);
  const spinnerPrefixRef = useRef<string>('');
  const statusBoxRef = useRef<TerminalBox | null>(null);

  // ANSI colour / style helpers
  const colour = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
  } as const;

  const clearStatusDisplay = useCallback(() => {
    if (spinnerIntervalRef.current) {
      clearInterval(spinnerIntervalRef.current);
      spinnerIntervalRef.current = null;
    }
    spinnerIndexRef.current = 0;
    if (statusBoxRef.current && term.current) {
      clearBox(statusBoxRef.current);
      statusBoxRef.current = null;
      /* status box cleared */
    }
    setOverlay(null);
    /* clearStatusDisplay completed */
  }, []);

  /**
   * Clears spinner interval and the xterm drawn box **without** touching the React overlay.
   * Useful when we want the overlay to persist between automatic reconnect attempts.
   */
  const clearTerminalBoxOnly = useCallback(() => {
    // Intentionally keep the spinner interval running so the overlay continues
    // to animate between failed attempts. Only the ANSI/xterm box is cleared.
    if (statusBoxRef.current && term.current) {
      clearBox(statusBoxRef.current);
      statusBoxRef.current = null;
      /* Terminal box cleared (overlay retained) */
    }
  }, []);

  // Keep the ref in sync with React state so key handlers can rely on it
  useEffect(() => {
    showManualReconnectPromptRef.current = showManualReconnectPrompt;
  }, [showManualReconnectPrompt]);

  const updateConnectionStatusAndExpose = useCallback((status: ConnectionStatus) => {
    // updateConnectionStatusAndExpose debug removed
    setComponentConnectionStatusState(status);
    // (window as any).componentConnectionStatusForTest = status; // Keep for direct inspection if needed, but primary is below
    // console.log(`[AblyCLITerminal] (window as any).componentConnectionStatusForTest SET TO: ${status}`);
    
    // Call playwright hook if it exists
    if (typeof (window as any).setWindowTestFlagOnStatusChange === 'function') {
      (window as any).setWindowTestFlagOnStatusChange(status);
      // test flag hook called
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
      // Strip ANSI colour/formatting codes before looking for the literal "$ " prompt
      const cleanBuf = ptyBuffer.current.replace(/\u001B\[[0-9;]*[mGKHF]/g, '');
      if (cleanBuf.includes(TERMINAL_PROMPT_IDENTIFIER)) {
        debugLog('Shell prompt detected – session active');
        clearStatusDisplay(); // Clear the status box as per plan
        setIsSessionActive(true);
        grSuccessfulConnectionReset();
        updateConnectionStatusAndExpose('connected'); // Explicitly set to connected
        if (term.current) term.current.focus();
        clearPtyBuffer();
      }
    }
  }, [isSessionActive, updateConnectionStatusAndExpose, clearPtyBuffer, clearStatusDisplay]);

  const clearAnimationMessages = useCallback(() => {
    setReconnectAttemptMessage('');
    setCountdownMessage('');
    clearStatusDisplay();
    // lastWriteLine.current = ''; // No longer directly managing this for single status line
  }, [clearStatusDisplay]);
  
  const startConnectingAnimation = useCallback((isRetry: boolean) => {
    if (!term.current) return;
    clearAnimationMessages(); // This already calls clearStatusDisplay

    const currentAttempts = grGetAttempts();
    const maxAttempts = grGetMaxAttempts();
    const title = isRetry ? "RECONNECTING" : "CONNECTING";
    const titleColor = isRetry ? boxColour.yellow : boxColour.cyan;
    
    let statusText = isRetry
      ? `Attempt ${currentAttempts + 1}/${maxAttempts} - Reconnecting to Ably CLI server...`
      : 'Connecting to Ably CLI server...';
    const initialContent = [statusText, '']; // Second line for potential countdown or messages

    // Draw the initial box
    if (term.current) {
      statusBoxRef.current = drawBox(term.current, titleColor, title, initialContent, 60);
      spinnerPrefixRef.current = statusText; // Store base text for spinner line

      spinnerIndexRef.current = 0;
      const initialSpinnerChar = spinnerFrames[spinnerIndexRef.current % spinnerFrames.length];
      if (statusBoxRef.current) {
        // Initial spinner render
        const fullLineText = `${initialSpinnerChar} ${spinnerPrefixRef.current}`;
        updateLine(statusBoxRef.current, 0, fullLineText, titleColor);
      }

      spinnerIntervalRef.current = setInterval(() => {
        // Stop spinner when no longer in connecting states
        const currentState = connectionStatusRef.current;
        if (!['connecting', 'reconnecting'].includes(currentState)) {
          if (spinnerIntervalRef.current) clearInterval(spinnerIntervalRef.current);
          return;
        }

        spinnerIndexRef.current += 1;
        const frame = spinnerFrames[spinnerIndexRef.current % spinnerFrames.length];
        const lineContent = `${frame} ${spinnerPrefixRef.current}`;

        // Update ANSI box if still present
        if (statusBoxRef.current) {
          updateLine(statusBoxRef.current, 0, lineContent, titleColor);
        }

        // Update overlay
        setOverlay(prev => {
          if (!prev) return prev;
          const newLines = [...prev.lines];
          if (newLines.length === 0) newLines.push(lineContent);
          else newLines[0] = lineContent;
          // spinner line updated
          return { ...prev, lines: newLines };
        });
      }, 250);
    }

    // startConnectingAnimation debug removed
    setReconnectAttemptMessage(isRetry ? `Attempt ${currentAttempts + 1}/${maxAttempts}` : 'Connecting');

    // Ensure the overlay shows the spinner immediately (not only after first interval tick)
    const initialSpinnerChar = spinnerFrames[spinnerIndexRef.current % spinnerFrames.length];
    const initialLines = [`${initialSpinnerChar} ${spinnerPrefixRef.current}`];
    setOverlay({variant: isRetry ? 'reconnecting' : 'connecting', title, lines: initialLines});

  }, [clearAnimationMessages]);

  const connectWebSocket = useCallback(() => {
    // console.log('[AblyCLITerminal] connectWebSocket called.');

    // Skip attempt if terminal not visible to avoid unnecessary server load
    if (!isVisible) {
      return;
    }

    // Prevent duplicate connections if one is already open/connecting
    if (!showManualReconnectPromptRef.current && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      if ((window as any).ABLY_CLI_DEBUG) console.warn('[AblyCLITerminal] connectWebSocket already open/connecting – skip');
      return;
    } else if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
      debugLog('Existing socket state', socketRef.current.readyState, '→ will proceed to open new socket');
    }

    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
      socketRef.current.close();
    }

    debugLog('Creating fresh WebSocket instance');

    updateConnectionStatusAndExpose(grIsCancelledState() || grIsMaxAttemptsReached() ? 'disconnected' : (grGetAttempts() > 0 ? 'reconnecting' : 'connecting'));
    startConnectingAnimation(grGetAttempts() > 0);

    const newSocket = new WebSocket(websocketUrl);
    (window as any).ablyCliSocket = newSocket; // For E2E tests
    socketRef.current = newSocket; // Use ref for listeners
    setSocket(newSocket); // Trigger effect to add listeners

    // Reset the per-cycle guard now that we have started a *fresh* connection
    // attempt.  Any failure events for this socket may schedule (at most) one
    // reconnect.
    reconnectScheduledThisCycleRef.current = false;

    // new WebSocket created
    debugLog('connectWebSocket called. sessionId:', sessionId, 'showManualReconnectPrompt:', showManualReconnectPromptRef.current);

    return;
  }, [websocketUrl, updateConnectionStatusAndExpose, startConnectingAnimation, isVisible, sessionId, showManualReconnectPromptRef]);

  const socketRef = useRef<WebSocket | null>(null); // Ref to hold the current socket for cleanup

  const handleWebSocketOpen = useCallback(() => {
    // console.log('[AblyCLITerminal] WebSocket opened');
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
    if (ablyApiKey) payload.apiKey = ablyApiKey; // Always required
    if (ablyAccessToken) payload.accessToken = ablyAccessToken;
    if (sessionId) payload.sessionId = sessionId;
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }

    // persistence handled by dedicated useEffect
    debugLog('WebSocket OPEN. Sending sessionId:', sessionId);
  }, [clearAnimationMessages, ablyAccessToken, ablyApiKey, initialCommand, updateConnectionStatusAndExpose, clearPtyBuffer, sessionId, resumeOnReload]);

  const handleWebSocketMessage = useCallback(async (event: MessageEvent) => {
    try {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'hello' && typeof msg.sessionId === 'string') {
            // received hello
            debugLog(`Received hello. sessionId=${msg.sessionId}`);
            setSessionId(msg.sessionId);
            if (onSessionId) onSessionId(msg.sessionId);
            debugLog('Received hello. sessionId=', msg.sessionId, ' (was:', sessionId, ')');
            return;
          }
          if (msg.type === 'status') {
            // received server status message
            debugLog(`Received server status message: ${msg.payload}`);

            // Treat explicit 'connected' status from server as authoritative –
            // this avoids hanging in the "connecting" state if prompt detection
            // fails (e.g. due to coloured PS1 or locale differences).
            if (msg.payload === 'connected') {
              clearStatusDisplay();
              setIsSessionActive(true);
              updateConnectionStatusAndExpose('connected');

              // Clear any residual spinner character that might be left at the
              // cursor position. We overwrite the current line locally only –
              // nothing is sent to the remote shell so no stray newlines are
              // executed server-side.
              if (term.current) {
                term.current.write('\x1b[K'); // Clear from cursor to EOL, keeps "$ " intact
                term.current.focus();
              }

              // Request a fresh prompt from the container
              if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send('\r');
              }

              clearPtyBuffer();
              return;
            }

            // Handle error & disconnected payloads
            if (msg.payload === 'error' || msg.payload === 'disconnected') {
              const reason = msg.reason || (msg.payload === 'error' ? 'Server error' : 'Server disconnected');
              if (term.current) term.current.writeln(`\r\n--- ${msg.payload === 'error' ? 'Error' : 'Session Ended (from server)'}: ${reason} ---`);
              if (onSessionEnd) onSessionEnd(reason);
              updateConnectionStatusAndExpose(msg.payload); // Reflect server's final say

              // Do NOT cancel the global reconnect loop here. The subsequent WebSocket `close` event
              // will evaluate the close code (e.g. 4000 for user-initiated exit, 1000 or 1006 for other
              // scenarios) and take the appropriate action.  Handling it in one place avoids ambiguity
              // and ensures test expectations around automatic reconnect remain stable.

              // Let the server drive the close handshake so we keep the correct code (1005) and our
              // subsequent `close` handler can show the proper "Server Disconnect" overlay.  We therefore
              // purposefully avoid calling `socket.close()` here.
              debugLog('[AblyCLITerminal] Purging sessionId due to server error/disconnect. sessionId:', sessionId);

              // Persisted session is no longer valid – forget it
              if (resumeOnReload && typeof window !== 'undefined') {
                window.sessionStorage.removeItem('ably.cli.sessionId');
                setSessionId(null);
              }

              if (term.current && msg.payload === 'disconnected') {
                const title = "ERROR: SERVER DISCONNECT";
                const message1 = `Connection closed by server (${msg.code})${msg.reason ? `: ${msg.reason}` : ''}.`;
                const message2 = '';
                const message3 = `Press ⏎ to try reconnecting manually.`;
                statusBoxRef.current = drawBox(term.current, boxColour.red, title, [message1, message2, message3], 60);
                setOverlay({ variant: 'error', title, lines:[message1, message2, message3]});
              }
              return;
            }
            return;
          }
          // Check for PTY stream/hijack meta-message before treating as PTY data
          if (msg.stream === true && typeof msg.hijack === 'boolean') {
            // ignoring PTY meta-message
            debugLog('[AblyCLITerminal] Received PTY stream/hijack meta-message. Ignoring for terminal output.', msg);
            return; // Do not write this to xterm
          }
        } catch (_e) { /* Not JSON, likely PTY data */ }
      }
      
      let dataStr: string;
      if (typeof event.data === 'string') dataStr = event.data;
      else if (event.data instanceof Blob) dataStr = await event.data.text();
      else if (event.data instanceof ArrayBuffer) dataStr = new TextDecoder().decode(event.data);
      else dataStr = new TextDecoder().decode(event.data); // Should handle Uint8Array from server

      // Filter stray (possibly fragmented) PTY meta JSON if the server failed to strip it
      if (isHijackMetaChunk(dataStr.trim())) {
        debugLog('[AblyCLITerminal] Suppressed PTY meta-message chunk');
      } else if (term.current) {
        term.current.write(dataStr);
      }
      handlePtyData(dataStr); // Pass PTY data for prompt detection

    } catch (_e) { console.error('[AblyCLITerminal] Error processing message:', _e); }
  }, [handlePtyData, onSessionEnd, updateConnectionStatusAndExpose]);

  const handleWebSocketError = useCallback((event: Event) => {
    console.error('[AblyCLITerminal] WebSocket error event received:', event);
    // Add more details if possible, though Event object is generic
    if (event instanceof ErrorEvent) {
      console.error(`[AblyCLITerminal] WebSocket ErrorEvent: message=${event.message}, filename=${event.filename}, lineno=${event.lineno}, colno=${event.colno}`);
    }

    if (!grIsCancelledState() && !grIsMaxAttemptsReached() && !reconnectScheduledThisCycleRef.current) {
      // Immediately enter "reconnecting" state so countdown / spinner UI is active
      updateConnectionStatusAndExpose('reconnecting');

      console.log('[AblyCLITerminal handleWebSocketError] Entered reconnection branch. isCancelled=', grIsCancelledState(), 'maxReached=', grIsMaxAttemptsReached());
      // Browsers don't always fire a subsequent `close` event when the WebSocket
      // handshake itself fails (e.g. server down).  In that scenario our usual
      // reconnection logic in `handleWebSocketClose` never runs, so we need to
      // kick-off the retry sequence from here.

      debugLog('[AblyCLITerminal handleWebSocketError] Triggering auto-reconnect sequence. Current grAttempts (before increment):', grGetAttempts());

      startConnectingAnimation(true);
      grIncrement();
      console.log('[AblyCLITerminal handleWebSocketError] grIncrement done. Attempts now:', grGetAttempts());

      if (connectWebSocketRef.current) {
        console.log('[AblyCLITerminal handleWebSocketError] Scheduling reconnect...');
        grScheduleReconnect(connectWebSocketRef.current!, websocketUrl);
      } else {
        console.error('[AblyCLITerminal handleWebSocketError] connectWebSocketRef.current is null, cannot schedule reconnect!');
      }

      // Mark that we have already handled scheduling for this cycle so the
      // forthcoming `close` event (which most browsers still emit after a
      // handshake failure) does NOT double-increment or re-schedule.
      reconnectScheduledThisCycleRef.current = true;
    }
  }, [updateConnectionStatusAndExpose, startConnectingAnimation, websocketUrl]);

  const handleWebSocketClose = useCallback((event: CloseEvent) => {
    debugLog(`[AblyCLITerminal] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
    clearTerminalBoxOnly();
    setIsSessionActive(false); 

    // Close codes that should *not* trigger automatic reconnection because
    // they represent explicit server-side rejections or client-initiated
    // terminations.  Codes such as 1005 (No Status) or 1006 (Abnormal
    // Closure) can legitimately occur when the server is temporarily
    // unreachable – for example when the terminal server is still
    // starting up.  Those cases should be treated as recoverable so they
    // are intentionally **excluded** from this list.
    const NON_RECOVERABLE_CLOSE_CODES = new Set<number>([
      4001, // Policy violation (e.g. invalid credentials)
      4008, // Token expired
      1013, // Try again later – the server is telling us not to retry
      4002, // Session resume rejected
      4000, // Generic server error
      4004, // Unsupported protocol version
      1005, // No status received – used when server terminates gracefully after `exit`
    ]);

    const inactivityRegex = /inactiv|timed out/i;
    if (event.code === 1000 && inactivityRegex.test(event.reason)) {
      NON_RECOVERABLE_CLOSE_CODES.add(1000);
    }

    if (NON_RECOVERABLE_CLOSE_CODES.has(event.code)) {
      grCancelReconnect();
      grResetState();
      updateConnectionStatusAndExpose('disconnected');
      if (term.current) {
        const title = "ERROR: SERVER DISCONNECT";
        const message1 = `Connection closed by server (${event.code})${event.reason ? `: ${event.reason}` : ''}.`;
        const message2 = '';
        const message3 = `Press ⏎ to try reconnecting manually.`;
        statusBoxRef.current = drawBox(term.current, boxColour.red, title, [message1, message2, message3], 60);
        setOverlay({variant: 'error', title, lines:[message1, message2, message3]});
      }
      setShowManualReconnectPrompt(true);
      if (resumeOnReload && typeof window !== 'undefined') {
        window.sessionStorage.removeItem('ably.cli.sessionId');
        setSessionId(null);
      }
      debugLog('[AblyCLITerminal] Purging sessionId due to non-recoverable close. code:', event.code, 'sessionId:', sessionId);
      return; 
    }

    if (grIsCancelledState() || grIsMaxAttemptsReached()) {
      updateConnectionStatusAndExpose('disconnected');
      if (term.current) {
        let title = "ERROR: CONNECTION CLOSED";
        let message1 = `Connection failed (Code: ${event.code}, Reason: ${event.reason || 'N/A'}).`;
        const message2 = '';
        const message3 = `Press ⏎ to try reconnecting manually.`;

        if (grIsMaxAttemptsReached()) {
          title = "MAX RECONNECTS";
          message1 = `Failed to reconnect after ${grGetMaxAttempts()} attempts.`;
        } else { // Cancelled
          title = "RECONNECT CANCELLED";
          message1 = `Reconnection attempts cancelled.`;
        }
        statusBoxRef.current = drawBox(term.current, boxColour.yellow, title, [message1, message2, message3], 60);
        setOverlay({variant:'error',title,lines:[message1, message2, message3]});
      }
      setShowManualReconnectPrompt(true);
      return; 
    } else if (!reconnectScheduledThisCycleRef.current) {
      debugLog('[AblyCLITerminal handleWebSocketClose] Scheduling reconnect. Current grAttempts (before increment):', grGetAttempts());
      updateConnectionStatusAndExpose('reconnecting');
      startConnectingAnimation(true); 
      
      grIncrement(); 
      debugLog('[AblyCLITerminal handleWebSocketClose] grIncrement called. Current grAttempts (after increment):', grGetAttempts());
      
      if (connectWebSocketRef.current) {
        grScheduleReconnect(connectWebSocketRef.current!, websocketUrl); 
      } else {
        console.error('[AblyCLITerminal handleWebSocketClose] connectWebSocketRef.current is null, cannot schedule reconnect!');
      }

      // Prevent any (unlikely) duplicate scheduling from other late events
      reconnectScheduledThisCycleRef.current = true;
    }
  }, [startConnectingAnimation, updateConnectionStatusAndExpose, clearTerminalBoxOnly, websocketUrl, resumeOnReload, sessionId /* removed connectWebSocketRef */]);

  useEffect(() => {
    // Setup terminal
    if (!term.current && rootRef.current) {
      // initializing terminal instance
      debugLog('[AblyCLITerminal] Initializing Terminal instance.');
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
            // manual reconnect
            debugLog('[AblyCLITerminal] Enter pressed for manual reconnect.');
            // Clear overlay and prompt before initiating new connection
            clearAnimationMessages(); // removes spinner/box & overlay
            showManualReconnectPromptRef.current = false;
            setShowManualReconnectPrompt(false);

            // Forget previous session completely so no resume is attempted
            if (resumeOnReload && typeof window !== 'undefined') {
              window.sessionStorage.removeItem('ably.cli.sessionId');
            }
            setSessionId(null);

            // Ensure any lingering socket is fully closed before opening a new one
            if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
              try { socketRef.current.close(1000, 'manual-reconnect'); } catch { /* ignore */ }
            }

            // Give the browser a micro-task to mark socket CLOSED before reconnect
            setTimeout(() => {
              debugLog('[AblyCLITerminal] [setTimeout] Starting fresh reconnect sequence');
              grResetState();
              clearPtyBuffer();
              debugLog('[AblyCLITerminal] [setTimeout] Invoking latest connectWebSocket');
              connectWebSocketRef.current?.();
              debugLog('[AblyCLITerminal] [setTimeout] connectWebSocket invoked');

              // We reset attempts to 0 – explicitly show a fresh CONNECTING overlay
              startConnectingAnimation(false);
            }, 20);
            debugLog('[AblyCLITerminal] Enter pressed for manual reconnect. sessionId:', sessionId);
            return;
          }

          // Cancel ongoing auto-reconnect
          if (latestStatus === 'reconnecting' && !grIsCancelledState()) {
            // user cancelled reconnect
            debugLog('[AblyCLITerminal] Enter pressed during auto-reconnect: Cancelling.');
            grCancelReconnect();
            grResetState();
            clearAnimationMessages();
            if (term.current) {
              term.current.writeln(`\r\n\n${colour.yellow}Reconnection attempts cancelled by user.${colour.reset}`);
              term.current.writeln(`${colour.dim}Press ${colour.bold}⏎${colour.reset}${colour.dim} to try reconnecting manually.${colour.reset}`);
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
        // Only show countdown while we are actually waiting to reconnect
        if (connectionStatusRef.current !== 'reconnecting') return;

        const msgPlain = `Next attempt in ${Math.ceil(remainingMs / 1000)}s...`;
        setCountdownMessage(msgPlain);

        if (term.current && statusBoxRef.current && statusBoxRef.current.content.length > 1) {
          updateLine(statusBoxRef.current, 1, msgPlain, boxColour.magenta);
        }

        // Update overlay second line
        setOverlay(prev => {
          if (!prev) return prev;
          const newLines = [...prev.lines];
          if (newLines.length === 1) newLines.push(msgPlain); else newLines[1] = msgPlain;
          return {...prev, lines: newLines};
        });
      });
    }

    // Initial connection on mount – only if already visible
    if (componentConnectionStatus === 'initial' && isVisible) {
      if (maxReconnectAttempts && maxReconnectAttempts !== grGetMaxAttempts()) {
        // set max attempts
        debugLog('[AblyCLITerminal] Setting max reconnect attempts to', maxReconnectAttempts);
        grSetMaxAttempts(maxReconnectAttempts);
      }
      // starting connection
      debugLog('[AblyCLITerminal] Initial effect: Starting connection.');
      grResetState();
      clearPtyBuffer();
      connectWebSocket();
    }

    // Cleanup terminal on unmount
    return () => {
      if (term.current) {
        // dispose terminal
        debugLog('[AblyCLITerminal] Disposing Terminal on unmount');
        term.current.dispose();
        term.current = null;
      }
      if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
        // close websocket
        debugLog('[AblyCLITerminal] Closing WebSocket on unmount.');
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
      // attach socket listeners
      debugLog('[AblyCLITerminal] New socket detected, attaching event listeners.');
      socket.addEventListener('open', handleWebSocketOpen);
      socket.addEventListener('message', handleWebSocketMessage);
      socket.addEventListener('close', handleWebSocketClose);
      socket.addEventListener('error', handleWebSocketError);

      return () => {
        // cleanup old socket listeners
        debugLog('[AblyCLITerminal] Cleaning up WebSocket event listeners for old socket.');
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

  // Debug: log layout metrics when an overlay is rendered
  useEffect(() => {
    if (overlay && rootRef.current) {
      // Wait till next tick to ensure DOM rendered
      requestAnimationFrame(() => {
        try {
          const _rootRect = rootRef.current?.getBoundingClientRect();
          const _parentRect = rootRef.current?.parentElement?.getBoundingClientRect();
          const overlayEl = rootRef.current?.querySelector('.ably-overlay') as HTMLElement | null;
          const _overlayRect = overlayEl?.getBoundingClientRect();

          // layout diagnostics removed
        } catch (err) {
          // Swallow errors silently in production but log in dev
          console.error('Overlay diagnostics error', err);
        }
      });
    }
  }, [overlay]);

  // -----------------------------------------------------------------------------------
  // Visibility & inactivity timer logic
  // -----------------------------------------------------------------------------------

  // Kick-off the initial WebSocket connection the *first* time the terminal
  // becomes visible. We cannot rely solely on the mount-time effect because
  // `useTerminalVisibility` may report `false` on mount (e.g. drawer closed),
  // so this secondary effect waits for the first visible=true transition.
  useEffect(() => {
    if (componentConnectionStatus !== 'initial') return; // already attempted
    if (!isVisible) return; // still not visible → wait

    if (maxReconnectAttempts && maxReconnectAttempts !== grGetMaxAttempts()) {
      grSetMaxAttempts(maxReconnectAttempts);
    }

    grResetState();
    clearPtyBuffer();
    connectWebSocket();
  }, [isVisible, maxReconnectAttempts, componentConnectionStatus, clearPtyBuffer, connectWebSocket]);

  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const startInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      // Auto-terminate session due to prolonged invisibility
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close(4002, 'inactivity-timeout');
      }
      // Inform the user inside the terminal UI
      if (term.current) {
        term.current.writeln(`\r\nSession terminated after ${INACTIVITY_TIMEOUT_MS / 60000} minutes of inactivity.`);
        term.current.writeln('Press ⏎ to start a new session.');
      }
      grCancelReconnect();
      grResetState();
      setShowManualReconnectPrompt(true);
      showManualReconnectPromptRef.current = true;
      updateConnectionStatusAndExpose('disconnected');
    }, INACTIVITY_TIMEOUT_MS);
  }, [INACTIVITY_TIMEOUT_MS, grCancelReconnect, grResetState, updateConnectionStatusAndExpose]);

  // Manage the timer whenever visibility changes
  useEffect(() => {
    if (isVisible) {
      clearInactivityTimer();
      return;
    }
    // If not visible start countdown only if there is an active/open socket
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      startInactivityTimer();
    }
  }, [isVisible, startInactivityTimer, clearInactivityTimer]);

  useEffect(() => () => clearInactivityTimer(), [clearInactivityTimer]);

  useEffect(() => {
    debugLog('[AblyCLITerminal] MOUNT: sessionId from storage:', sessionId);
  }, []);

  // Keep latest instance of connectWebSocket for async callbacks
  const connectWebSocketRef = useRef(connectWebSocket);
  useEffect(() => { connectWebSocketRef.current = connectWebSocket; }, [connectWebSocket]);

  return (
    <div
      ref={rootRef}
      data-testid="terminal-container"
      className="Terminal-container"
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', padding: 0, boxSizing: 'border-box', backgroundColor: '#000000' }}
    >
      {overlay && <TerminalOverlay {...overlay} />}
    </div>
  );
};

export default AblyCliTerminal;