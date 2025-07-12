import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import TerminalOverlay, {OverlayVariant} from './TerminalOverlay';
import { drawBox, clearBox, updateLine, colour as boxColour, colour, type TerminalBox } from './terminal-box';
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
import { SplitSquareHorizontal, X } from 'lucide-react';
import { hashCredentials } from './utils/crypto';
import { getConnectionMessage } from './connection-messages';

/**
 * Simple debounce utility function to prevent rapid successive calls
 */
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>): void {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

export type ConnectionStatus = 'initial' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

const MAX_PTY_BUFFER_LENGTH = 10000; // Max 10k chars in the buffer
const CONTROL_MESSAGE_PREFIX = '\x00\x00ABLY_CTRL:';

// Prompts that indicate the terminal is ready for input
const TERMINAL_PROMPT_IDENTIFIER = '$ '; // Basic prompt
const TERMINAL_PROMPT_PATTERN = /\$\s$/; // Pattern matching prompt at end of line

// Shared CLI installation tip
const CLI_INSTALL_TIP = {
  lines: [
    'Pro tip: Want full control and speed? Install the CLI locally',
    '         $ npm install -g @ably/cli'
  ]
};

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
  /**
   * When true, enables split-screen mode with a second independent terminal.
   * A split icon will be displayed in the top-right corner when in single-pane mode.
   */
  enableSplitScreen?: boolean;
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
  enableSplitScreen = false,
}) => {
  const [componentConnectionStatus, setComponentConnectionStatusState] = useState<ConnectionStatus>('initial');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [connectionHelpMessage, setConnectionHelpMessage] = useState('');
  const [reconnectAttemptMessage, setReconnectAttemptMessage] = useState('');
  const [countdownMessage, setCountdownMessage] = useState('');
  const [overlay, setOverlay] = useState<null|{variant:OverlayVariant,title:string,lines:string[],drawer?:{lines:string[]}}>(null);
  const [connectionStartTime, setConnectionStartTime] = useState<number | null>(null);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);

  // -------------------------------------------------------------
  // Split-screen UI state
  // -------------------------------------------------------------

  /**
   * `isSplit` controls whether the UI is currently displaying a secondary pane.
   * We now initialize a second terminal session when this is enabled.
   */
  const [isSplit, setIsSplit] = useState<boolean>(() => {
    if (resumeOnReload && typeof window !== 'undefined' && enableSplitScreen) {
      return window.sessionStorage.getItem('ably.cli.isSplit') === 'true';
    }
    return false;
  });
  
  /**
   * `splitPosition` controls the relative width of the left pane as a percentage (0-100)
   */
  const [splitPosition, setSplitPosition] = useState<number>(() => {
    if (resumeOnReload && typeof window !== 'undefined' && enableSplitScreen) {
      const saved = window.sessionStorage.getItem('ably.cli.splitPosition');
      return saved ? parseFloat(saved) : 50; // Default to 50% if not found
    }
    return 50; // Default to 50% split
  });
  
  // Track whether we're currently dragging the divider
  const [isDragging, setIsDragging] = useState(false);
  // Ref to the outer container for calculating percentages
  const outerContainerRef = useRef<HTMLDivElement>(null);

  // Updated handler to initialize the secondary terminal
  const handleSplitScreenWithSecondTerminal = useCallback(() => {
    // First update the UI state
    setIsSplit(true);
    
    // Save split state to session storage if resume enabled
    if (resumeOnReload && typeof window !== 'undefined') {
      window.sessionStorage.setItem('ably.cli.isSplit', 'true');
    }
    
    // Secondary terminal will be initialized in useEffect that watches isSplit
  }, [resumeOnReload]);

  /** Toggle into split-screen mode with terminal session */
  const handleSplitScreen = useCallback(() => {
    // We now use the handler that will initialize a second terminal session
    handleSplitScreenWithSecondTerminal();
  }, [handleSplitScreenWithSecondTerminal]);

  /** Close both terminals and reset the split */
  const handleCloseSplit = useCallback(() => {
    // When closing the split, clean up the secondary terminal
    if (secondarySocketRef.current && secondarySocketRef.current.readyState < WebSocket.CLOSING) {
      secondarySocketRef.current.close();
      secondarySocketRef.current = null;
    }
    
    if (secondaryTerm.current) {
      secondaryTerm.current.dispose();
      secondaryTerm.current = null;
    }
    
    // Reset secondary terminal state
    updateSecondaryConnectionStatus('initial');
    setIsSecondarySessionActive(false);
    setSecondaryShowManualReconnectPrompt(false);
    setSecondarySessionId(null);
    setSecondaryOverlay(null);
    
    // Return to single-pane mode
    setIsSplit(false);
    
    // Clear split state in session storage
    if (resumeOnReload && typeof window !== 'undefined') {
      window.sessionStorage.removeItem('ably.cli.isSplit');
      window.sessionStorage.removeItem('ably.cli.secondarySessionId');
    }
    
    // Resize the primary terminal after a delay
    setTimeout(() => {
      if (term.current && fitAddon.current) {
        try {
          fitAddon.current.fit();
        } catch (e) {
          console.warn("Error fitting primary terminal after closing split:", e);
        }
      }
    }, 50);
  }, []);

  /** Handle clicking Close on Terminal 1 (primary) */
  const handleClosePrimary = useCallback(() => {
    // When closing the primary terminal but keeping the secondary one,
    // make sure the secondary terminal is properly displayed
    
    if (secondaryTerm.current && secondarySocketRef.current) {
      debugLog('[AblyCLITerminal] Closing primary terminal, keeping secondary');
      
      // Close the primary socket cleanly
      if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
        debugLog('[AblyCLITerminal] Closing primary socket');
        socketRef.current.close(1000, 'user-closed-primary');
        socketRef.current = null;
      }
      
      // Store the secondary values before reset
      const tempSocket = secondarySocketRef.current;
      const tempTerm = secondaryTerm.current;
      const tempFitAddon = secondaryFitAddon.current;
      const tempSessionId = secondarySessionId;
      const tempIsActive = isSecondarySessionActive;
      
      // Dispose the primary terminal if it exists
      if (term.current) {
        term.current.dispose();
        term.current = null;
      }
      
      // Clear the secondary terminal's state AFTER saving references
      secondarySocketRef.current = null;
      secondaryTerm.current = null;
      secondaryFitAddon.current = undefined;
      
      // Ensure we properly transfer the DOM element
      // This is critical - we need to move the secondary terminal's
      // DOM element to the primary terminal's container
      if (rootRef.current && tempTerm && secondaryRootRef.current) {
        // Get the xterm DOM element from the secondary container
        const xtermElement = secondaryRootRef.current.querySelector('.xterm');
        if (xtermElement) {
          // Clear the primary container
          while (rootRef.current.firstChild) {
            rootRef.current.firstChild.remove();
          }
          
          // Move the xterm element to the primary container
          rootRef.current.appendChild(xtermElement);
          debugLog('[AblyCLITerminal] Moved secondary terminal DOM element to primary container');
        }
      }
      
      // Swap references
      term.current = tempTerm;
      fitAddon.current = tempFitAddon;
      socketRef.current = tempSocket;
      
      // Update state
      setIsSplit(false);
      setSessionId(tempSessionId);
      updateSessionActive(tempIsActive);
      
      // Reset secondary terminal state
      updateSecondaryConnectionStatus('initial');
      setIsSecondarySessionActive(false);
      setSecondaryShowManualReconnectPrompt(false);
      setSecondarySessionId(null);
      setSecondaryOverlay(null);
      
      // Clear split state in session storage
      if (resumeOnReload && typeof window !== 'undefined') {
        window.sessionStorage.removeItem('ably.cli.isSplit');
        window.sessionStorage.removeItem('ably.cli.secondarySessionId');
      }
      
      // Resize the terminal after a delay
      setTimeout(() => {
        if (term.current && fitAddon.current) {
          try {
            fitAddon.current.fit();
          } catch (e) {
            console.warn("Error fitting terminal after closing primary:", e);
          }
        }
      }, 50);
    } else {
      // If there's no secondary terminal, just close everything (same as handleCloseSplit)
      handleCloseSplit();
    }
  }, [handleCloseSplit, resumeOnReload]);

  /** Close the secondary pane and return to single-pane mode */
  const handleCloseSecondary = useCallback(() => {
    // When closing the secondary terminal, clean it up but keep the primary one
    if (secondarySocketRef.current && secondarySocketRef.current.readyState < WebSocket.CLOSING) {
      debugLog('[AblyCLITerminal] Closing secondary socket');
      secondarySocketRef.current.close(1000, 'user-closed-secondary');
      secondarySocketRef.current = null;
    }
    
    if (secondaryTerm.current) {
      secondaryTerm.current.dispose();
      secondaryTerm.current = null;
    }
    
    // Reset secondary terminal state
    updateSecondaryConnectionStatus('initial');
    setIsSecondarySessionActive(false);
    setSecondaryShowManualReconnectPrompt(false);
    setSecondarySessionId(null);
    setSecondaryOverlay(null);
    
    // Return to single-pane mode
    setIsSplit(false);
    
    // Clear split state in session storage
    if (resumeOnReload && typeof window !== 'undefined') {
      window.sessionStorage.removeItem('ably.cli.isSplit');
      window.sessionStorage.removeItem('ably.cli.secondarySessionId');
    }
    
    // Resize the primary terminal after a delay
    setTimeout(() => {
      if (term.current && fitAddon.current) {
        try {
          fitAddon.current.fit();
        } catch (e) {
          console.warn("Error fitting primary terminal after closing split:", e);
        }
      }
    }, 50);
  }, [resumeOnReload]);

  // Track the current sessionId received from the server (if any)
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [credentialHash, setCredentialHash] = useState<string | null>(null);
  const [credentialsInitialized, setCredentialsInitialized] = useState(false);
  const [sessionIdInitialized, setSessionIdInitialized] = useState(false);

  // Track the second terminal's sessionId
  const [secondarySessionId, setSecondarySessionId] = useState<string | null>(
    () => {
      if (resumeOnReload && typeof window !== 'undefined' && window.sessionStorage.getItem('ably.cli.isSplit') === 'true') {
        return window.sessionStorage.getItem('ably.cli.secondarySessionId');
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
  // Store cleanup function for terminal resize handler
  const termCleanupRef = useRef<() => void>(() => {});

  // Ref to track manual reconnect prompt visibility inside stable event handlers
  const showManualReconnectPromptRef = useRef<boolean>(false);
  // Guard to ensure we do NOT double-count a failed attempt when both the
  // `error` and the subsequent `close` events fire for the *same* socket.
  const reconnectScheduledThisCycleRef = useRef<boolean>(false);
  
  // Keep a ref in sync with session active state for use in closures
  const isSessionActiveRef = useRef<boolean>(false);

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
    
    connectionStatusRef.current = status;
    
    // Only report status changes from the primary terminal
    if (typeof (window as any).setWindowTestFlagOnStatusChange === 'function') {
      (window as any).setWindowTestFlagOnStatusChange(status);
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
    debugLog(`⚠️ DIAGNOSTIC: Clearing PTY buffer, current size: ${ptyBuffer.current.length}`);
    if (ptyBuffer.current.length > 0) {
      const sanitizedBuffer = ptyBuffer.current
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .slice(-100); // Only show last 100 chars to avoid log bloat
      debugLog(`⚠️ DIAGNOSTIC: Buffer content before clear: "${sanitizedBuffer}"`);
    }
    ptyBuffer.current = '';
  }, []);
  
  // Helper to update both session active state and ref
  const updateSessionActive = useCallback((active: boolean) => {
    debugLog(`⚠️ DIAGNOSTIC: Updating session active to: ${active}`);
    console.log(`[AblyCLITerminal] PRODUCTION DEBUG: updateSessionActive called with: ${active}`);
    setIsSessionActive(active);
    isSessionActiveRef.current = active;
  }, []);
  
  // Connection timeout management
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const CONNECTION_TIMEOUT_MS = 30000; // 30 seconds
  const installInstructionsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const SHOW_INSTALL_AFTER_MS = 6000; // 6 seconds
  
  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const clearInstallInstructionsTimer = useCallback(() => {
    if (installInstructionsTimerRef.current) {
      clearTimeout(installInstructionsTimerRef.current);
      installInstructionsTimerRef.current = null;
    }
  }, []);
  
  const handlePtyData = useCallback((data: string) => {
    // Always log what data we receive
    const sanitizedData = data.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    debugLog(`⚠️ DIAGNOSTIC: handlePtyData called. isSessionActive: ${isSessionActiveRef.current}, data: "${sanitizedData}"`);
    
    if (!isSessionActiveRef.current) {
      ptyBuffer.current += data;
      
      debugLog(`⚠️ DIAGNOSTIC: Received PTY data (session inactive): "${sanitizedData}"`);
      
      if (ptyBuffer.current.length > MAX_PTY_BUFFER_LENGTH) {
        ptyBuffer.current = ptyBuffer.current.slice(ptyBuffer.current.length - MAX_PTY_BUFFER_LENGTH);
      }
      
      // Strip ANSI colour/formatting codes before looking for the prompt
      const cleanBuf = ptyBuffer.current.replace(/\u001B\[[0-9;]*[mGKHF]/g, '');
      debugLog(`⚠️ DIAGNOSTIC: Clean buffer (${cleanBuf.length} chars): "${cleanBuf.slice(-50)}"`);
      
      // Only detect the prompt if it appears at the end of the buffer,
      // not somewhere in the middle of previous output
      // Also check for common Ably CLI prompts
      const hasShellPrompt = TERMINAL_PROMPT_PATTERN.test(cleanBuf);
      const hasAblyPrompt = cleanBuf.endsWith('$ ') || cleanBuf.endsWith('> ') || cleanBuf.endsWith('ably> ');
      
      debugLog(`⚠️ DIAGNOSTIC: Checking for prompt. hasShellPrompt: ${hasShellPrompt}, hasAblyPrompt: ${hasAblyPrompt}, buffer end: "${cleanBuf.slice(-20)}"`);
      
      if (hasShellPrompt || hasAblyPrompt) {
        debugLog(`⚠️ DIAGNOSTIC: Prompt detected at end of buffer (shell: ${hasShellPrompt}, ably: ${hasAblyPrompt})`);
        clearStatusDisplay(); // Clear the status box as per plan
        
        // Only set active if not already active to prevent multiple state updates
        if (!isSessionActiveRef.current) {
          updateSessionActive(true);
          grSuccessfulConnectionReset();
          updateConnectionStatusAndExpose('connected'); // Explicitly set to connected
          if (term.current) term.current.focus();
          
          // Reset connection tracking
          setConnectionStartTime(null);
          setShowInstallInstructions(false);
          clearInstallInstructionsTimer();
        }
        
        clearPtyBuffer();
      }
    } else {
      debugLog(`⚠️ DIAGNOSTIC: Session already active, not buffering data`);
    }
  }, [updateConnectionStatusAndExpose, updateSessionActive, clearPtyBuffer, clearStatusDisplay, clearInstallInstructionsTimer]);

  // Secondary terminal instance references
  const secondaryRootRef = useRef<HTMLDivElement>(null);
  const secondaryTerm = useRef<Terminal | null>(null);
  const secondaryFitAddon = useRef<FitAddon>();
  const secondarySocketRef = useRef<WebSocket | null>(null);
  const secondaryPtyBuffer = useRef('');
  const secondaryTermCleanupRef = useRef<() => void>(() => {});
  
  // Secondary terminal state
  const [secondarySocket, setSecondarySocket] = useState<WebSocket | null>(null);
  const [isSecondarySessionActive, setIsSecondarySessionActive] = useState(false);
  const [secondaryOverlay, setSecondaryOverlay] = useState<null|{variant:OverlayVariant,title:string,lines:string[]}>(null);
  
  // Secondary terminal refs - need their own copies for event handlers
  const secondaryConnectionStatusRef = useRef<ConnectionStatus>('initial');
  const [secondaryConnectionStatus, setSecondaryConnectionStatus] = useState<ConnectionStatus>('initial');
  const secondarySpinnerPrefixRef = useRef<string>('');
  const secondarySpinnerIndexRef = useRef<number>(0);
  const secondaryStatusBoxRef = useRef<TerminalBox | null>(null);
  const secondarySpinnerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondaryShowManualReconnectPromptRef = useRef<boolean>(false);
  const [secondaryShowManualReconnectPrompt, setSecondaryShowManualReconnectPrompt] = useState(false);
  const secondaryReconnectScheduledThisCycleRef = useRef<boolean>(false);

  // Function to clear the secondary terminal overlay and status displays
  const clearSecondaryStatusDisplay = useCallback(() => {
    if (secondarySpinnerIntervalRef.current) {
      clearInterval(secondarySpinnerIntervalRef.current);
      secondarySpinnerIntervalRef.current = null;
    }
    secondarySpinnerIndexRef.current = 0;
    if (secondaryStatusBoxRef.current && secondaryTerm.current) {
      clearBox(secondaryStatusBoxRef.current);
      secondaryStatusBoxRef.current = null;
    }
    setSecondaryOverlay(null);
    debugLog('[AblyCLITerminal] Secondary terminal status display cleared');
  }, []);

  const handleSecondaryPtyData = useCallback((data: string) => {
    if (!isSecondarySessionActive) {
      secondaryPtyBuffer.current += data;
      
      if (secondaryPtyBuffer.current.length > MAX_PTY_BUFFER_LENGTH) {
        secondaryPtyBuffer.current = secondaryPtyBuffer.current.slice(secondaryPtyBuffer.current.length - MAX_PTY_BUFFER_LENGTH);
      }
      
      // Strip ANSI colour/formatting codes before looking for the prompt
      const cleanBuf = secondaryPtyBuffer.current.replace(/\u001B\[[0-9;]*[mGKHF]/g, '');
      
      // Only detect the prompt if it appears at the end of the buffer
      // Also check for common Ably CLI prompts
      const hasShellPrompt = TERMINAL_PROMPT_PATTERN.test(cleanBuf);
      const hasAblyPrompt = cleanBuf.endsWith('$ ') || cleanBuf.endsWith('> ') || cleanBuf.endsWith('ably> ');
      
      if (hasShellPrompt || hasAblyPrompt) {
        debugLog('[AblyCLITerminal] [Secondary] Prompt detected – session active');
        clearSecondaryStatusDisplay(); // Clear the overlay when prompt is detected
        
        // Only set active if not already active
        if (!isSecondarySessionActive) {
          setIsSecondarySessionActive(true);
          updateSecondaryConnectionStatus('connected');
          if (secondaryTerm.current) secondaryTerm.current.focus();
        }
        
        secondaryPtyBuffer.current = '';
      }
    }
  }, [clearSecondaryStatusDisplay, isSecondarySessionActive]);

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

    // Write connecting message to terminal like secondary does
    if (term.current && !isRetry) {
      // Store the current line position so we can clear it later
      try {
        const connectingLine = term.current.buffer?.active?.cursorY ?? 0;
        term.current.writeln(statusText);
        // Store line number for later clearing
        (term.current as any)._connectingLine = connectingLine;
      } catch (e) {
        // If buffer is not ready, just write without tracking line number
        term.current.writeln(statusText);
      }
    }

    // Draw the initial box (even though it's a stub, keep for compatibility)
    if (term.current) {
      // Keep content as is - no install instructions in the reconnecting box
      const boxContent = [...initialContent];
      
      statusBoxRef.current = drawBox(term.current, titleColor, title, boxContent, 60);
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

        // Update overlay - preserve drawer or add it if showInstallInstructions is true
        setOverlay(prev => {
          if (!prev) return prev;
          const newLines = [...prev.lines];
          // Only update the first line (spinner)
          newLines[0] = lineContent;
          return {
            ...prev,
            lines: newLines,
            ...(showInstallInstructions ? {
              drawer: CLI_INSTALL_TIP
            } : { drawer: prev.drawer })
          };
        });
      }, 250);
    }

    // startConnectingAnimation debug removed
    setReconnectAttemptMessage(isRetry ? `Attempt ${currentAttempts + 1}/${maxAttempts}` : 'Connecting');

    // Ensure the overlay shows the spinner immediately (not only after first interval tick)
    const initialSpinnerChar = spinnerFrames[spinnerIndexRef.current % spinnerFrames.length];
    const initialLines = [`${initialSpinnerChar} ${spinnerPrefixRef.current}`, '']; // Include empty line for countdown
    
    // Include drawer if install instructions should be shown
    const overlayConfig = {
      variant: (isRetry ? 'reconnecting' : 'connecting') as OverlayVariant,
      title,
      lines: initialLines,
      ...(showInstallInstructions ? {
        drawer: CLI_INSTALL_TIP
      } : {})
    };
    
    setOverlay(overlayConfig);

  }, [clearAnimationMessages, showInstallInstructions]);

  const connectWebSocket = useCallback(() => {
    // console.log('[AblyCLITerminal] connectWebSocket called.');
    debugLog('⚠️ DIAGNOSTIC: connectWebSocket called - start of connection process');

    // Skip attempt if terminal not visible to avoid unnecessary server load
    if (!isVisible) {
      debugLog('⚠️ DIAGNOSTIC: Terminal not visible, skipping connection attempt');
      return;
    }

    // Prevent duplicate connections if one is already open/connecting
    if (!showManualReconnectPromptRef.current && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      if ((window as any).ABLY_CLI_DEBUG) console.warn('[AblyCLITerminal] connectWebSocket already open/connecting – skip');
      debugLog('⚠️ DIAGNOSTIC: Socket already open/connecting, skipping connection attempt');
      return;
    } else if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
      debugLog('⚠️ DIAGNOSTIC: Existing socket state', socketRef.current.readyState, '→ will proceed to open new socket');
    }

    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
      debugLog('⚠️ DIAGNOSTIC: Closing existing socket before creating new one');
      socketRef.current.close();
    }

    debugLog('⚠️ DIAGNOSTIC: Creating fresh WebSocket instance to ' + websocketUrl);

    // Track when connection attempts started and set timer only once
    if (!connectionStartTime) {
      setConnectionStartTime(Date.now());
      
      // Only start timer once on the first connection attempt
      clearInstallInstructionsTimer();
      installInstructionsTimerRef.current = setTimeout(() => {
        setShowInstallInstructions(true);
      }, SHOW_INSTALL_AFTER_MS);
    }

    updateConnectionStatusAndExpose(grIsCancelledState() || grIsMaxAttemptsReached() ? 'disconnected' : (grGetAttempts() > 0 ? 'reconnecting' : 'connecting'));
    startConnectingAnimation(grGetAttempts() > 0);

    const newSocket = new WebSocket(websocketUrl);
    debugLog(`⚠️ DIAGNOSTIC: New WebSocket created with ID: ${Math.random().toString(36).substring(2, 10)}`);
    
    (window as any).ablyCliSocket = newSocket; // For E2E tests
    socketRef.current = newSocket; // Use ref for listeners
    setSocket(newSocket); // Trigger effect to add listeners

    // Reset the per-cycle guard now that we have started a *fresh* connection
    // attempt.  Any failure events for this socket may schedule (at most) one
    // reconnect.
    reconnectScheduledThisCycleRef.current = false;
    
    // Set up connection timeout
    clearConnectionTimeout(); // Clear any existing timeout
    connectionTimeoutRef.current = setTimeout(() => {
      debugLog('⚠️ CONNECTION TIMEOUT: WebSocket connection attempt timed out after', CONNECTION_TIMEOUT_MS, 'ms');
      
      // Close the socket if it's still connecting
      if (socketRef.current && socketRef.current.readyState === WebSocket.CONNECTING) {
        debugLog('⚠️ CONNECTION TIMEOUT: Closing socket that is still in CONNECTING state');
        socketRef.current.close(4003, 'connection-timeout');
        
        // Manually trigger error handling since the browser might not fire events for a stuck connection
        const timeoutError = new Event('error');
        Object.defineProperty(timeoutError, 'message', { value: 'Connection timeout' });
        Object.defineProperty(timeoutError, 'isTimeout', { value: true });
        socketRef.current.dispatchEvent(timeoutError);
      }
    }, CONNECTION_TIMEOUT_MS);

    // new WebSocket created
    debugLog('⚠️ DIAGNOSTIC: WebSocket connection initiation complete. sessionId:', sessionId, 'showManualReconnectPrompt:', showManualReconnectPromptRef.current);

    return;
  }, [websocketUrl, updateConnectionStatusAndExpose, startConnectingAnimation, isVisible, sessionId, showManualReconnectPromptRef, clearConnectionTimeout, connectionStartTime, clearInstallInstructionsTimer, term]);

  const socketRef = useRef<WebSocket | null>(null); // Ref to hold the current socket for cleanup

  const handleWebSocketOpen = useCallback(() => {
    // console.log('[AblyCLITerminal] WebSocket opened');
    // Clear connection timeout since we successfully connected
    clearConnectionTimeout();
    
    // Do not reset reconnection attempts here; wait until terminal prompt confirms full session
    setShowManualReconnectPrompt(false);
    
    // Only clear buffer for new sessions, not when resuming
    if (!sessionId) {
      clearPtyBuffer(); // Clear buffer for new session prompt detection
    } else {
      debugLog(`⚠️ DIAGNOSTIC: Skipping PTY buffer clear for resumed session ${sessionId}`);
    }

    debugLog('⚠️ DIAGNOSTIC: WebSocket open handler started - tracking initialization sequence');

    if (term.current) {
      debugLog('⚠️ DIAGNOSTIC: Focusing terminal');
      term.current.focus();
      // Don't send the initial command yet - wait for prompt detection
    }
    
    // Send auth payload - but no additional data
    const payload: any = {
      environmentVariables: { 
        ABLY_WEB_CLI_MODE: 'true',
        // Force explicit PS1 to ensure prompt is visible
        PS1: '$ '
      } 
    };
    if (ablyApiKey) payload.apiKey = ablyApiKey; // Always required
    if (ablyAccessToken) payload.accessToken = ablyAccessToken;
    if (sessionId) payload.sessionId = sessionId;
    
    debugLog(`⚠️ DIAGNOSTIC: Preparing to send auth payload with env vars: ${JSON.stringify(payload.environmentVariables)}`);
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      debugLog('⚠️ DIAGNOSTIC: Sending auth payload to server');
      socketRef.current.send(JSON.stringify(payload));
    }

    // Wait until we detect the prompt before sending an initialCommand if there is one
    // This prevents sending commands before the shell is ready
    // Skip initial command if we're resuming an existing session
    if (initialCommand && !sessionId) {
      debugLog(`⚠️ DIAGNOSTIC: Initial command present: "${initialCommand}" - will wait for prompt (new session)`);
      const waitForPrompt = () => {
        if (isSessionActiveRef.current && term.current) {
          debugLog('⚠️ DIAGNOSTIC: Session active, sending initial command');
          setTimeout(() => { 
            if (term.current && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              debugLog('⚠️ DIAGNOSTIC: Sending initial command now');
              term.current.write(`${initialCommand}\r`);
            }
          }, 100);
        } else {
          // Keep checking until the session is active
          debugLog('⚠️ DIAGNOSTIC: Session not active yet, waiting to send initial command');
          setTimeout(waitForPrompt, 100);
        }
      };
      
      // Start waiting for prompt
      waitForPrompt();
    } else if (initialCommand && sessionId) {
      debugLog(`⚠️ DIAGNOSTIC: Skipping initial command for resumed session ${sessionId}`);
    }

    // persistence handled by dedicated useEffect
    debugLog('WebSocket OPEN handler completed. sessionId:', sessionId);
  }, [clearAnimationMessages, ablyAccessToken, ablyApiKey, initialCommand, updateConnectionStatusAndExpose, clearPtyBuffer, sessionId, resumeOnReload, clearConnectionTimeout, credentialHash]);

  const handleWebSocketMessage = useCallback(async (event: MessageEvent) => {
    try {
      let data: Uint8Array;
      
      // Convert all data types to Uint8Array for consistent handling
      if (typeof event.data === 'string') {
        data = new TextEncoder().encode(event.data);
      } else if (event.data instanceof Blob) {
        const arrayBuffer = await event.data.arrayBuffer();
        data = new Uint8Array(arrayBuffer);
      } else if (event.data instanceof ArrayBuffer) {
        data = new Uint8Array(event.data);
      } else {
        // Assume it's already a Uint8Array or similar
        data = new Uint8Array(event.data);
      }

      // Check for control message prefix at byte level
      const prefixBytes = new TextEncoder().encode(CONTROL_MESSAGE_PREFIX);
      let isControlMessage = false;
      
      if (data.length >= prefixBytes.length) {
        isControlMessage = true;
        for (let i = 0; i < prefixBytes.length; i++) {
          if (data[i] !== prefixBytes[i]) {
            isControlMessage = false;
            break;
          }
        }
      }

      if (isControlMessage) {
        // Extract JSON portion after prefix
        const jsonBytes = data.slice(prefixBytes.length);
        const jsonStr = new TextDecoder().decode(jsonBytes);
        try {
          const msg = JSON.parse(jsonStr);
          
          // Handle control messages (existing logic)
          if (msg.type === 'hello' && typeof msg.sessionId === 'string') {
            debugLog(`⚠️ DIAGNOSTIC: Received hello message with sessionId=${msg.sessionId}`);
            console.log(`[AblyCLITerminal] PRODUCTION DEBUG: Received hello message, sessionId=${msg.sessionId}, current isSessionActive=${isSessionActive}`);
            const wasReconnecting = connectionStatusRef.current === 'reconnecting';
            const wasConnecting = connectionStatusRef.current === 'connecting';
            setSessionId(msg.sessionId);
            if (onSessionId) onSessionId(msg.sessionId);
            debugLog('Received hello. sessionId=', msg.sessionId, ' (was:', sessionId, ')');
            
            // Always activate the session when we receive a hello message
            // This handles cases where the server doesn't send a separate "connected" status message
            debugLog(`⚠️ DIAGNOSTIC: Activating session after hello message (wasReconnecting: ${wasReconnecting}, wasConnecting: ${wasConnecting})`);
            console.log(`[AblyCLITerminal] PRODUCTION DEBUG: Activating session now`);
            updateSessionActive(true);
            updateConnectionStatusAndExpose('connected');
            if (term.current) {
              // Clear the "Connecting..." message if it exists
              if ((term.current as any)._connectingLine !== undefined) {
                try {
                  const currentY = term.current.buffer?.active?.cursorY ?? 0;
                  const currentX = term.current.buffer?.active?.cursorX ?? 0;
                  const connectingLine = (term.current as any)._connectingLine;
                  
                  // Move to the connecting line and clear it
                  term.current.write(`\x1b[${connectingLine + 1};1H`); // Move to line
                  term.current.write('\x1b[2K'); // Clear entire line
                  
                  // Move cursor back to previous position
                  term.current.write(`\x1b[${currentY + 1};${currentX + 1}H`);
                  
                  delete (term.current as any)._connectingLine;
                } catch (e) {
                  console.warn('[AblyCLITerminal] Could not clear connecting message:', e);
                }
              }
              term.current.focus();
            }
            
            // Persist to session storage if enabled (domain-scoped)
            if (resumeOnReload && typeof window !== 'undefined') {
              const urlDomain = new URL(websocketUrl).host;
              window.sessionStorage.setItem(`ably.cli.sessionId.${urlDomain}`, msg.sessionId);
              
              // Store credential hash if it's already computed
              if (credentialHash) {
                window.sessionStorage.setItem(`ably.cli.credentialHash.${urlDomain}`, credentialHash);
              }
            }
            return;
          }
          
          if (msg.type === 'status') {
            debugLog(`⚠️ DIAGNOSTIC: Received server status message: ${msg.payload}`);
            
            // Handle different status payloads
            if (msg.payload === 'connected') {
              debugLog(`⚠️ DIAGNOSTIC: Handling 'connected' status message`);
              clearStatusDisplay();
              updateConnectionStatusAndExpose('connected');
              
              if (term.current) {
                debugLog(`⚠️ DIAGNOSTIC: Clearing connecting message and focusing terminal`);
                // Clear the "Connecting..." message if it exists
                if ((term.current as any)._connectingLine !== undefined) {
                  try {
                    const currentY = term.current.buffer?.active?.cursorY ?? 0;
                    const currentX = term.current.buffer?.active?.cursorX ?? 0;
                    const connectingLine = (term.current as any)._connectingLine;
                    
                    // Move to the connecting line and clear it
                    term.current.write(`\x1b[${connectingLine + 1};1H`); // Move to line
                    term.current.write('\x1b[2K'); // Clear entire line
                    
                    // Move cursor back to previous position
                    term.current.write(`\x1b[${currentY + 1};${currentX + 1}H`);
                    
                    delete (term.current as any)._connectingLine;
                  } catch (e) {
                    console.warn('[AblyCLITerminal] Could not clear connecting message:', e);
                  }
                }
                term.current.focus();
              }
              
              // Set session active immediately on connected status
              debugLog(`⚠️ DIAGNOSTIC: Setting session active on 'connected' status`);
              updateSessionActive(true);
              grSuccessfulConnectionReset();
              
              clearPtyBuffer();
              return;
            }
            
            // Handle error & disconnected payloads
            if (msg.payload === 'error' || msg.payload === 'disconnected') {
              const reason = msg.reason || (msg.payload === 'error' ? 'Server error' : 'Server disconnected');
              if (term.current) {
                term.current.writeln(`\r\n--- ${msg.payload === 'error' ? 'Error' : 'Session Ended (from server)'}: ${reason} ---`);
              }
              if (onSessionEnd) onSessionEnd(reason);
              updateConnectionStatusAndExpose(msg.payload);
              
              // Handle session cleanup for disconnected status
              if (resumeOnReload && typeof window !== 'undefined') {
                const urlDomain = new URL(websocketUrl).host;
                window.sessionStorage.removeItem(`ably.cli.sessionId.${urlDomain}`);
                window.sessionStorage.removeItem(`ably.cli.credentialHash.${urlDomain}`);
                setSessionId(null);
              }
              
              // Show appropriate overlay for disconnected status
              if (term.current && msg.payload === 'disconnected') {
                const title = "SERVER DISCONNECTED";
                const message1 = `Connection closed by server (${msg.code})${msg.reason ? `: ${msg.reason}` : ''}.`;
                const message2 = '';
                const message3 = `Press ⏎ to reconnect`;
                
                const lines = [message1, message2, message3];
                
                statusBoxRef.current = drawBox(term.current, boxColour.red, title, lines, 60);
                setOverlay({ 
                  variant: 'error', 
                  title, 
                  lines: lines,
                  drawer: {
                    lines: [
                      'Pro tip: Install the CLI locally for a faster experience with all features',
                      '    npm install -g @ably/cli'
                    ]
                  }
                });
              }
              return;
            }
            
            return;
          }
          
          // Log any unrecognized control messages
          console.warn('[WebSocket] Unrecognized control message:', msg);
          return;
          
        } catch (e) {
          console.error('[WebSocket] Invalid control message JSON:', e);
          return;
        }
      }
      
      // Everything else is terminal output (including --json command results)
      // Convert back to string for terminal display
      const dataStr = new TextDecoder().decode(data);
      
      // Filter PTY meta JSON chunks
      if (isHijackMetaChunk(dataStr.trim())) {
        debugLog('[AblyCLITerminal] Suppressed PTY meta-message chunk');
      } else if (term.current) {
        console.log(`[AblyCLITerminal] PRODUCTION DEBUG: Writing PTY data to terminal, isSessionActive=${isSessionActiveRef.current}, dataStr="${dataStr.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
        term.current.write(dataStr);
      }
      
      handlePtyData(dataStr);
      
    } catch (e) {
      console.error('[AblyCLITerminal] Error processing message:', e);
    }
  }, [handlePtyData, onSessionEnd, updateConnectionStatusAndExpose, updateSessionActive, credentialHash, resumeOnReload, sessionId]);

  const handleWebSocketError = useCallback((event: Event) => {
    console.error('[AblyCLITerminal] WebSocket error event received:', event);
    // Clear connection timeout on error
    clearConnectionTimeout();
    
    // Add more details if possible, though Event object is generic
    if (event instanceof ErrorEvent) {
      console.error(`[AblyCLITerminal] WebSocket ErrorEvent: message=${event.message}, filename=${event.filename}, lineno=${event.lineno}, colno=${event.colno}`);
    }

    // Check if max attempts reached or cancelled
    if (grIsCancelledState() || grIsMaxAttemptsReached()) {
      // Clear any existing animations
      clearTerminalBoxOnly();
      updateConnectionStatusAndExpose('disconnected');
      
      if (term.current) {
        let message: ReturnType<typeof getConnectionMessage>;
        
        if (grIsMaxAttemptsReached()) {
          message = getConnectionMessage('maxReconnects');
        } else if (grIsCancelledState()) {
          message = getConnectionMessage('reconnectCancelled');
        } else if ((event as any).isTimeout) {
          message = getConnectionMessage('connectionTimeout');
        } else {
          message = getConnectionMessage('connectionFailed');
        }
        
        statusBoxRef.current = drawBox(term.current, boxColour.yellow, message.title, message.lines, 60);
        setOverlay({variant:'error', title: message.title, lines: message.lines});
      }
      
      setShowManualReconnectPrompt(true);
      reconnectScheduledThisCycleRef.current = true; // Prevent double handling
      return;
    }

    if (!reconnectScheduledThisCycleRef.current) {
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
  }, [updateConnectionStatusAndExpose, startConnectingAnimation, websocketUrl, clearTerminalBoxOnly, clearConnectionTimeout]);

  const handleWebSocketClose = useCallback((event: CloseEvent) => {
    debugLog(`[AblyCLITerminal] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
    clearConnectionTimeout(); // Clear timeout on close
    clearTerminalBoxOnly();
    updateSessionActive(false); 

    // Check if this was a user-initiated close
    const userClosedTerminal = event.reason === 'user-closed-primary' || 
                               event.reason === 'user-closed-secondary' ||
                               event.reason === 'manual-reconnect';
    
    if (userClosedTerminal) {
      debugLog(`[AblyCLITerminal] User closed terminal: ${event.reason} - not reconnecting`);
      return; // Don't try to reconnect if user closed the terminal intentionally
    }

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
      4003, // Rate limit exceeded
      4004, // Unsupported protocol version
      4009, // Server at capacity
      // Note: 1005 removed - it's used for both graceful exit AND network disconnections
      // We should handle exit commands differently, not by close code
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
        let message;
        if (event.code === 4009 || event.reason?.toLowerCase().includes('capacity')) {
          message = getConnectionMessage('capacityReached');
        } else if (event.code === 4003 || event.reason?.toLowerCase().includes('rate limit')) {
          message = {
            title: 'RATE LIMIT EXCEEDED',
            lines: [
              'Too many connection attempts from your IP address.',
              event.reason || 'Please wait before trying again.',
              '',
              'This limit helps ensure service availability for all users.'
            ]
          };
        } else {
          message = getConnectionMessage('serverDisconnect');
        }
        
        // Prepend the specific error code/reason to the first line if not already included
        const lines = [...message.lines];
        lines[0] = `Connection closed by server (${event.code})${event.reason ? `: ${event.reason}` : ''}.`;
        
        statusBoxRef.current = drawBox(term.current, boxColour.red, message.title, lines, 60);
        setOverlay({
          variant: 'error', 
          title: message.title, 
          lines: lines,
          drawer: CLI_INSTALL_TIP
        });
      }
      setShowManualReconnectPrompt(true);
      if (resumeOnReload && typeof window !== 'undefined') {
        const urlDomain = new URL(websocketUrl).host;
        window.sessionStorage.removeItem(`ably.cli.sessionId.${urlDomain}`);
        window.sessionStorage.removeItem(`ably.cli.credentialHash.${urlDomain}`);
        setSessionId(null);
      }
      debugLog('[AblyCLITerminal] Purging sessionId due to non-recoverable close. code:', event.code, 'sessionId:', sessionId);
      return; 
    }

    if (grIsCancelledState() || grIsMaxAttemptsReached()) {
      updateConnectionStatusAndExpose('disconnected');
      if (term.current) {
        let message: ReturnType<typeof getConnectionMessage>;
        
        if (grIsMaxAttemptsReached()) {
          message = getConnectionMessage('maxReconnects');
        } else if (grIsCancelledState()) {
          message = getConnectionMessage('reconnectCancelled');
        } else {
          message = getConnectionMessage('connectionFailed');
          // Override first line with specific error details
          const lines = [...message.lines];
          lines[0] = `Connection failed (Code: ${event.code}, Reason: ${event.reason || 'N/A'}).`;
          message = { ...message, lines };
        }
        
        // Clear the terminal to remove any old content
        if (term.current) {
          term.current.clear();
        }
        statusBoxRef.current = drawBox(term.current, boxColour.yellow, message.title, message.lines, 60);
        setOverlay({
          variant: 'error', 
          title: message.title, 
          lines: message.lines,
          drawer: CLI_INSTALL_TIP
        });
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
  }, [startConnectingAnimation, updateConnectionStatusAndExpose, updateSessionActive, clearTerminalBoxOnly, websocketUrl, resumeOnReload, sessionId, clearConnectionTimeout]);

  useEffect(() => {
    // Setup terminal
    if (!term.current && rootRef.current) {
      // initializing terminal instance
      debugLog('[AblyCLITerminal] Initializing Terminal instance.');
      debugLog('⚠️ DIAGNOSTIC: Creating new Terminal instance');
      term.current = new Terminal({
        cursorBlink: true, cursorStyle: 'block', fontFamily: 'monospace', fontSize: 14,
        theme: { background: '#000000', foreground: '#abb2bf', cursor: '#528bff', selectionBackground: '#3e4451', selectionForeground: '#ffffff' },
        convertEol: true,
      });
      fitAddon.current = new FitAddon();
      term.current.loadAddon(fitAddon.current);
      
      // Track current input line for autocomplete
      let currentInputLine = '';
      let cursorPosition = 0;
      
      // Attach custom key handler for special keys
      debugLog('⚠️ DIAGNOSTIC: Setting up custom key handler for special keys');
      if (typeof term.current.attachCustomKeyEventHandler === 'function') {
        term.current.attachCustomKeyEventHandler((event: KeyboardEvent): boolean => {
        // Only handle special keys when connected and session is active
        if (!isSessionActive || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
          return true; // Let xterm handle it normally
        }
        
        debugLog(`⚠️ DIAGNOSTIC: KeyboardEvent - key: "${event.key}", code: "${event.code}", ctrl: ${event.ctrlKey}, shift: ${event.shiftKey}`);
        
        // Handle TAB for autocomplete
        if (event.key === 'Tab' && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          debugLog(`⚠️ DIAGNOSTIC: TAB intercepted, sending special message for autocomplete`);
          
          // Send special message for autocomplete
          socketRef.current.send(JSON.stringify({
            type: 'readline-control',
            action: 'complete',
            line: currentInputLine,
            cursor: cursorPosition
          }));
          
          return false; // Prevent default handling
        }
        
        // Handle UP arrow for history
        if (event.key === 'ArrowUp' && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          debugLog(`⚠️ DIAGNOSTIC: UP arrow intercepted, sending special message for history`);
          
          // Send special message for history navigation
          socketRef.current.send(JSON.stringify({
            type: 'readline-control',
            action: 'history-up'
          }));
          
          return false; // Prevent default handling
        }
        
        // Handle DOWN arrow for history
        if (event.key === 'ArrowDown' && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          debugLog(`⚠️ DIAGNOSTIC: DOWN arrow intercepted, sending special message for history`);
          
          // Send special message for history navigation
          socketRef.current.send(JSON.stringify({
            type: 'readline-control',
            action: 'history-down'
          }));
          
          return false; // Prevent default handling
        }
        
        // Handle Ctrl+R for history search
        if (event.key === 'r' && event.ctrlKey && !event.altKey && !event.shiftKey) {
          event.preventDefault();
          debugLog(`⚠️ DIAGNOSTIC: Ctrl+R intercepted, sending special message for history search`);
          
          // Send special message for history search
          socketRef.current.send(JSON.stringify({
            type: 'readline-control',
            action: 'history-search'
          }));
          
          return false; // Prevent default handling
        }
        
        return true; // Let other keys pass through normally
      });
      }
      
      debugLog('⚠️ DIAGNOSTIC: Setting up onData handler');
      term.current.onData((data: string) => {
        // Enhanced logging for special keys
        const bytes = Array.from(data).map(char => {
          const code = char.charCodeAt(0);
          if (code < 32 || code > 126) {
            return `\\x${code.toString(16).padStart(2, '0')}`;
          }
          return char;
        }).join('');
        
        // Identify common special keys
        let keyName = 'unknown';
        if (data === '\t' || data === '\x09') keyName = 'TAB';
        else if (data === '\x1b[A') keyName = 'UP_ARROW';
        else if (data === '\x1b[B') keyName = 'DOWN_ARROW';
        else if (data === '\x1b[C') keyName = 'RIGHT_ARROW';
        else if (data === '\x1b[D') keyName = 'LEFT_ARROW';
        else if (data === '\r') keyName = 'ENTER';
        else if (data === '\x7f') keyName = 'BACKSPACE';
        else if (data === '\x12') keyName = 'CTRL+R';
        else if (data.startsWith('\x1b')) keyName = 'ESC_SEQUENCE';
        
        debugLog(`⚠️ DIAGNOSTIC: Terminal onData - Key: ${keyName}, Bytes: "${bytes}", Length: ${data.length}`);
        
        // Special handling for Enter key
        if (data === '\r') {
          const latestStatus = connectionStatusRef.current;
          debugLog(`⚠️ DIAGNOSTIC: Enter key pressed, status: ${latestStatus}, reconnectPrompt: ${showManualReconnectPromptRef.current}`);

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
              const urlDomain = new URL(websocketUrl).host;
              window.sessionStorage.removeItem(`ably.cli.sessionId.${urlDomain}`);
              window.sessionStorage.removeItem(`ably.cli.credentialHash.${urlDomain}`);
            }
            setSessionId(null);

            // Ensure any lingering socket is fully closed before opening a new one
            if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
              try { socketRef.current.close(1000, 'manual-reconnect'); } catch { /* ignore */ }
              socketRef.current = null; // Make sure the reference is cleared
            }

            // Give the browser a micro-task to mark socket CLOSED before reconnect
            setTimeout(() => {
              debugLog('[AblyCLITerminal] [setTimeout] Starting fresh reconnect sequence');
              grResetState();
              // Reset the attempt counter for manual reconnect
              grSuccessfulConnectionReset();
              clearPtyBuffer();
              
              // Reset connection tracking for fresh attempt
              setConnectionStartTime(null);
              setShowInstallInstructions(false);
              clearInstallInstructionsTimer();
              
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
            
            // Reset connection tracking
            setConnectionStartTime(null);
            setShowInstallInstructions(false);
            clearInstallInstructionsTimer();
            
            if (term.current) {
              const message = getConnectionMessage('reconnectCancelled');
              const terminal = term.current;
              terminal.writeln(`\r\n`);
              // Display the reconnect cancelled message in the terminal
              message.lines.forEach(line => {
                if (line) terminal.writeln(line);
              });
            }
            showManualReconnectPromptRef.current = true;
            setShowManualReconnectPrompt(true);
            updateConnectionStatusAndExpose('disconnected');
            return;
          }
        }

        // Track input line for autocomplete (simple tracking - reset on Enter)
        if (data === '\r') {
          currentInputLine = '';
          cursorPosition = 0;
        } else if (data === '\x7f') { // Backspace
          if (cursorPosition > 0) {
            currentInputLine = currentInputLine.slice(0, cursorPosition - 1) + currentInputLine.slice(cursorPosition);
            cursorPosition--;
          }
        } else if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) <= 126) {
          // Regular printable character
          currentInputLine = currentInputLine.slice(0, cursorPosition) + data + currentInputLine.slice(cursorPosition);
          cursorPosition++;
        }
        
        // Default: forward data to server if socket open
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          debugLog(`⚠️ DIAGNOSTIC: Sending to WebSocket - Key: ${keyName}, Bytes: "${bytes}"`);
          socketRef.current.send(data);
        } else if (data === '\r') {
          debugLog(`⚠️ DIAGNOSTIC: Socket not open, not sending carriage return`);
          // If the connection is not open and none of the above special cases matched,
          // do nothing (prevent accidental writes to closed socket).
        } else {
          debugLog(`⚠️ DIAGNOSTIC: Socket not open, and not a carriage return, ignoring input`);
        }
      });

      debugLog('⚠️ DIAGNOSTIC: Opening terminal in DOM element');
      term.current.open(rootRef.current);
      try {
        // Do the initial fit only
        debugLog('⚠️ DIAGNOSTIC: Performing initial terminal fit');
        fitAddon.current.fit();
        
        // Initial timeout fit for edge cases
        setTimeout(() => { 
          try { 
            debugLog('⚠️ DIAGNOSTIC: Performing delayed terminal fit');
            fitAddon.current?.fit(); 
          } catch(e) { 
            console.warn("Error fitting addon initial timeout:", e);
          }
        }, 100);
      } catch (e) {
        console.error("Error during initial terminal fit:", e);
      }
      
      grSetCountdownCallback((remainingMs) => {
        // Only show countdown while we are actually waiting to reconnect
        if (connectionStatusRef.current !== 'reconnecting') return;

        const seconds = Math.ceil(remainingMs / 1000);
        const msgPlain = `Next attempt in ${seconds}s...`;
        const msgWithCancel = `${msgPlain}  (Press ⏎ to cancel)`;
        setCountdownMessage(msgPlain);

        if (term.current && statusBoxRef.current && statusBoxRef.current.content.length > 1) {
          // For terminal box, show colored version
          updateLine(statusBoxRef.current, 1, msgWithCancel, boxColour.magenta);
        }

        // Update overlay - preserve the drawer if present
        setOverlay(prev => {
          if (!prev) return prev;
          const newLines = [...prev.lines];
          
          // Simply update line 1 with the countdown - the structure is already set up correctly
          if (newLines.length === 1) {
            newLines.push(msgWithCancel);
          } else {
            newLines[1] = msgWithCancel;
          }
          
          // Preserve drawer or add it if showInstallInstructions is true
          return {
            ...prev,
            lines: newLines,
            ...(showInstallInstructions ? {
              drawer: CLI_INSTALL_TIP
            } : { drawer: prev.drawer })
          };
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
      debugLog('⚠️ DIAGNOSTIC: Starting initial connection in mount effect');
      grResetState();
      clearPtyBuffer();
      connectWebSocket();
    }

    // Cleanup terminal on unmount
    return () => {
      // Execute resize listener cleanup if it exists
      if (termCleanupRef.current) {
        termCleanupRef.current();
      }
      
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
      clearConnectionTimeout(); // Clear any pending connection timeout
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
    
    // Expose a function to get terminal buffer content for testing
    (window as any).getTerminalBufferText = () => {
      if (!term.current) return '';
      const buffer = term.current.buffer.active;
      let text = '';
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          text += line.translateToString(true) + '\n';
        }
      }
      return text.trimEnd();
    };
    
    // Expose terminal buffer info for debugging
    (window as any).getTerminalBufferInfo = () => {
      if (!term.current) return { exists: false };
      const buffer = term.current.buffer.active;
      return {
        exists: true,
        length: buffer.length,
        cursorY: buffer.cursorY,
        cursorX: buffer.cursorX,
        baseY: buffer.baseY,
        trimmedLength: buffer.length - buffer.baseY
      };
    };
    
    return () => {
      delete (window as any).getAblyCliTerminalReactState;
      delete (window as any).getTerminalBufferText;
      delete (window as any).getTerminalBufferInfo;
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

  // Persist sessionId to sessionStorage whenever it changes (if enabled)
  useEffect(() => {
    if (!resumeOnReload || typeof window === 'undefined') return;
    // Only persist if we have validated credentials
    if (!credentialsInitialized) return;
    
    const urlDomain = new URL(websocketUrl).host;
    if (sessionId) {
      window.sessionStorage.setItem(`ably.cli.sessionId.${urlDomain}`, sessionId);
      // Also store credential hash if available
      if (credentialHash) {
        window.sessionStorage.setItem(`ably.cli.credentialHash.${urlDomain}`, credentialHash);
      }
    } else {
      window.sessionStorage.removeItem(`ably.cli.sessionId.${urlDomain}`);
      window.sessionStorage.removeItem(`ably.cli.credentialHash.${urlDomain}`);
    }
  }, [sessionId, resumeOnReload, credentialsInitialized, websocketUrl, credentialHash]);

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
    if (!credentialsInitialized) return; // wait for credentials to be validated

    if (maxReconnectAttempts && maxReconnectAttempts !== grGetMaxAttempts()) {
      grSetMaxAttempts(maxReconnectAttempts);
    }

    grResetState();
    clearPtyBuffer();
    connectWebSocket();
  }, [isVisible, maxReconnectAttempts, componentConnectionStatus, clearPtyBuffer, connectWebSocket, credentialsInitialized]);

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
  
  // Cleanup install instructions timer on unmount
  useEffect(() => () => clearInstallInstructionsTimer(), [clearInstallInstructionsTimer]);

  // Initialize session and validate credentials
  useEffect(() => {
    const initializeSession = async () => {
      // Calculate current credential hash
      const currentHash = await hashCredentials(ablyApiKey, ablyAccessToken);
      setCredentialHash(currentHash);
      
      if (!resumeOnReload || typeof window === 'undefined') {
        setCredentialsInitialized(true);
        return;
      }
      
      // Extract domain from websocketUrl for scoping
      const urlDomain = new URL(websocketUrl).host;
      
      // Check if we have a stored session for this specific domain
      const storedSessionId = window.sessionStorage.getItem(`ably.cli.sessionId.${urlDomain}`);
      const storedHash = window.sessionStorage.getItem(`ably.cli.credentialHash.${urlDomain}`);
      
      console.log('[AblyCLITerminal] Credential validation:', { 
        urlDomain,
        storedSessionId, 
        storedHash, 
        currentHash,
        match: storedHash === currentHash
      });
      
      // Only restore session if credentials match AND it's for the same domain
      if (storedSessionId && storedHash === currentHash) {
        setSessionId(storedSessionId);
        console.log('[AblyCLITerminal] Restored session with matching credentials for domain:', urlDomain);
      } else if ((storedSessionId || storedHash) && storedHash !== currentHash) {
        // Clear invalid session - either if we have a sessionId with mismatched hash
        // or if we have a stored hash that doesn't match current credentials
        window.sessionStorage.removeItem(`ably.cli.sessionId.${urlDomain}`);
        window.sessionStorage.removeItem(`ably.cli.credentialHash.${urlDomain}`);
        console.log('[AblyCLITerminal] Cleared session due to credential mismatch for domain:', urlDomain);
      }
      
      setCredentialsInitialized(true);
      setSessionIdInitialized(true);
    };
    
    initializeSession();
  }, [ablyApiKey, ablyAccessToken, resumeOnReload, websocketUrl]);

  // Store credential hash when it becomes available if we already have a sessionId
  useEffect(() => {
    if (resumeOnReload && typeof window !== 'undefined' && sessionId && credentialHash) {
      const urlDomain = new URL(websocketUrl).host;
      const storedHash = window.sessionStorage.getItem(`ably.cli.credentialHash.${urlDomain}`);
      
      // Only store if we don't already have it stored
      if (!storedHash) {
        window.sessionStorage.setItem(`ably.cli.credentialHash.${urlDomain}`, credentialHash);
        debugLog('Stored credential hash for existing session');
      }
    }
  }, [resumeOnReload, sessionId, credentialHash, websocketUrl]);

  // Keep latest instance of connectWebSocket for async callbacks
  const connectWebSocketRef = useRef(connectWebSocket);
  useEffect(() => { connectWebSocketRef.current = connectWebSocket; }, [connectWebSocket]);

  // -------------------------------------------------------------
  // Resizable panes logic
  // -------------------------------------------------------------

  // Start dragging the divider
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // Handle mouse movement while dragging
  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !outerContainerRef.current) return;
    
    const containerRect = outerContainerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const mouseX = e.clientX - containerRect.left;
    
    // Calculate percentage position (0-100)
    let newPosition = (mouseX / containerWidth) * 100;
    
    // Constrain to reasonable limits (10%-90%)
    newPosition = Math.max(10, Math.min(90, newPosition));
    
    setSplitPosition(newPosition);
    
    // Trigger resize event for terminals to adapt
    window.dispatchEvent(new Event('resize'));
  }, [isDragging]);

  // End dragging
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    
    // Save split position to session storage if resume enabled
    if (resumeOnReload && typeof window !== 'undefined') {
      window.sessionStorage.setItem('ably.cli.splitPosition', splitPosition.toString());
    }
    
    // Ensure terminals resize properly after drag ends
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
  }, [isDragging, resumeOnReload, splitPosition]);

  // Add/remove global mouse event listeners for drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, handleDrag, handleDragEnd]);

  // Single resize handler for both terminals
  useEffect(() => {
    const handleGlobalResize = debounce(() => {
      try {
        if (term.current && fitAddon.current) {
          fitAddon.current.fit();
        }
        if (isSplit && secondaryTerm.current && secondaryFitAddon.current) {
          secondaryFitAddon.current.fit();
        }
      } catch (e) {
        console.warn("Error in global resize handler:", e);
      }
    }, 200);
    
    // Add resize listener
    window.addEventListener('resize', handleGlobalResize);
    
    // Initial resize
    setTimeout(() => {
      handleGlobalResize();
    }, 50);
    
    return () => {
      window.removeEventListener('resize', handleGlobalResize);
    };
  }, [isSplit]);
  
  // Handle storage of split state when it changes
  useEffect(() => {
    // Ensure the split state in sessionStorage always matches the component state
    if (resumeOnReload && typeof window !== 'undefined') {
      if (isSplit) {
        window.sessionStorage.setItem('ably.cli.isSplit', 'true');
        debugLog('[AblyCLITerminal] Setting isSplit=true in sessionStorage');
      } else {
        window.sessionStorage.removeItem('ably.cli.isSplit');
        debugLog('[AblyCLITerminal] Removed isSplit from sessionStorage');
        
        // When exiting split mode, also clean up secondary session ID
        if (!secondarySessionId) {
          window.sessionStorage.removeItem('ably.cli.secondarySessionId');
          debugLog('[AblyCLITerminal] Removed secondarySessionId from sessionStorage');
        }
      }
    }
  }, [isSplit, resumeOnReload, secondarySessionId]);

  // -------------------------------------------------------------
  // Split-screen Terminal Logic (Step 6.2 - Secondary session)
  // -------------------------------------------------------------
  
  // Connect secondary terminal WebSocket
  const connectSecondaryWebSocket = useCallback(() => {
    // Skip if secondary terminal is not available
    if (!secondaryTerm.current || !secondaryRootRef.current) {
      return;
    }

    // Close existing socket if open
    if (secondarySocketRef.current && secondarySocketRef.current.readyState < WebSocket.CLOSING) {
      secondarySocketRef.current.close();
    }

    debugLog('[AblyCLITerminal] Creating secondary WebSocket instance');
    console.log('[AblyCLITerminal] Secondary WebSocket connecting to:', websocketUrl);

    // Update connection status
      updateSecondaryConnectionStatus('connecting');

    // Show connecting animation in secondary terminal
    if (secondaryTerm.current) {
      // Store the current line position so we can clear it later
      try {
        const connectingLine = secondaryTerm.current.buffer?.active?.cursorY ?? 0;
        secondaryTerm.current.writeln('Connecting to Ably CLI server...');
        // Store line number for later clearing
        (secondaryTerm.current as any)._connectingLine = connectingLine;
      } catch (e) {
        // If buffer is not ready, just write without tracking line number
        secondaryTerm.current.writeln('Connecting to Ably CLI server...');
      }
    }

    // Create new WebSocket
    const newSocket = new WebSocket(websocketUrl);
    secondarySocketRef.current = newSocket;
    setSecondarySocket(newSocket);
    
    // Set up event handlers - using inline functions since we can't easily reuse
    // the handlers from the primary terminal without significant refactoring
    
    // WebSocket open handler
    newSocket.addEventListener('open', () => {
      debugLog('[AblyCLITerminal] Secondary WebSocket opened');
      
      // Clear any reconnect prompt
      setSecondaryShowManualReconnectPrompt(false);
      secondaryShowManualReconnectPromptRef.current = false;
      
      if (secondaryTerm.current) {
        secondaryTerm.current.focus();
      }
      
      // Send auth payload - only include necessary data
      const payload: any = {
        environmentVariables: { ABLY_WEB_CLI_MODE: 'true' } 
      };
      if (ablyApiKey) payload.apiKey = ablyApiKey;
      if (ablyAccessToken) payload.accessToken = ablyAccessToken;
      if (secondarySessionId) payload.sessionId = secondarySessionId;
      
      if (newSocket.readyState === WebSocket.OPEN) {
        newSocket.send(JSON.stringify(payload));
      }
      
      // Don't send any other data until shell prompt is detected
    });
    
    // WebSocket message handler with binary framing support
    newSocket.addEventListener('message', async (event) => {
      try {
        let data: Uint8Array;
        
        // Convert all data types to Uint8Array for consistent handling
        if (typeof event.data === 'string') {
          data = new TextEncoder().encode(event.data);
        } else if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          data = new Uint8Array(arrayBuffer);
        } else if (event.data instanceof ArrayBuffer) {
          data = new Uint8Array(event.data);
        } else {
          // Assume it's already a Uint8Array or similar
          data = new Uint8Array(event.data);
        }

        // Check for control message prefix at byte level
        const prefixBytes = new TextEncoder().encode(CONTROL_MESSAGE_PREFIX);
        let isControlMessage = false;
        
        if (data.length >= prefixBytes.length) {
          isControlMessage = true;
          for (let i = 0; i < prefixBytes.length; i++) {
            if (data[i] !== prefixBytes[i]) {
              isControlMessage = false;
              break;
            }
          }
        }

        if (isControlMessage) {
          // Extract JSON portion after prefix
          const jsonBytes = data.slice(prefixBytes.length);
          const jsonStr = new TextDecoder().decode(jsonBytes);
          try {
            const msg = JSON.parse(jsonStr);
            
            if (msg.type === 'hello' && typeof msg.sessionId === 'string') {
              debugLog(`[Secondary] Received hello. sessionId=${msg.sessionId}`);
              setSecondarySessionId(msg.sessionId);
              
              // Persist to session storage if enabled
              if (resumeOnReload && typeof window !== 'undefined') {
                window.sessionStorage.setItem('ably.cli.secondarySessionId', msg.sessionId);
              }
              
              // Always activate session after hello message
              debugLog(`[Secondary] Activating session after hello message`);
              setIsSecondarySessionActive(true);
              updateSecondaryConnectionStatus('connected');
              clearSecondaryStatusDisplay();
              if (secondaryTerm.current) {
                // Clear the "Connecting..." message if it exists
                if ((secondaryTerm.current as any)._connectingLine !== undefined) {
                  try {
                    const currentY = secondaryTerm.current.buffer?.active?.cursorY ?? 0;
                    const currentX = secondaryTerm.current.buffer?.active?.cursorX ?? 0;
                    const connectingLine = (secondaryTerm.current as any)._connectingLine;
                    
                    // Move to the connecting line and clear it
                    secondaryTerm.current.write(`\x1b[${connectingLine + 1};1H`); // Move to line
                    secondaryTerm.current.write('\x1b[2K'); // Clear entire line
                    
                    // Move cursor back to previous position
                    secondaryTerm.current.write(`\x1b[${currentY + 1};${currentX + 1}H`);
                    
                    delete (secondaryTerm.current as any)._connectingLine;
                  } catch (e) {
                    console.warn('[AblyCLITerminal] [Secondary] Could not clear connecting message:', e);
                  }
                }
                secondaryTerm.current.focus();
              }
              
              return;
            }
            if (msg.type === 'status') {
              debugLog(`[Secondary] Received server status message: ${msg.payload}`);

              if (msg.payload === 'connected') {
                // Clear any overlay when connected
                clearSecondaryStatusDisplay();
                updateSecondaryConnectionStatus('connected');
                setIsSecondarySessionActive(true);
                
                if (secondaryTerm.current) {
                  // Clear the "Connecting..." message if it exists
                  if ((secondaryTerm.current as any)._connectingLine !== undefined) {
                    try {
                      const currentY = secondaryTerm.current.buffer?.active?.cursorY ?? 0;
                      const currentX = secondaryTerm.current.buffer?.active?.cursorX ?? 0;
                      const connectingLine = (secondaryTerm.current as any)._connectingLine;
                      
                      // Move to the connecting line and clear it
                      secondaryTerm.current.write(`\x1b[${connectingLine + 1};1H`); // Move to line
                      secondaryTerm.current.write('\x1b[2K'); // Clear entire line
                      
                      // Move cursor back to previous position
                      secondaryTerm.current.write(`\x1b[${currentY + 1};${currentX + 1}H`);
                      
                      delete (secondaryTerm.current as any)._connectingLine;
                    } catch (e) {
                      console.warn('[AblyCLITerminal] [Secondary] Could not clear connecting message:', e);
                    }
                  }
                  secondaryTerm.current.focus();
                }
                
                // Don't send a carriage return to the server
                // The server will handle displaying the prompt
                
                return;
              }
              
              // Handle error & disconnected
              if (msg.payload === 'error' || msg.payload === 'disconnected') {
                const reason = msg.reason || (msg.payload === 'error' ? 'Server error' : 'Server disconnected');
                if (secondaryTerm.current) secondaryTerm.current.writeln(`\r\n--- ${msg.payload === 'error' ? 'Error' : 'Session Ended (from server)'}: ${reason} ---`);
                updateSecondaryConnectionStatus(msg.payload as ConnectionStatus);
                
                if (secondaryTerm.current && msg.payload === 'disconnected') {
                  const title = "ERROR: SERVER DISCONNECT";
                  const message1 = `Connection closed by server (${msg.code})${msg.reason ? `: ${msg.reason}` : ''}.`;
                  const message2 = '';
                  const message3 = `Press ⏎ to try reconnecting manually.`;
                  
                  if (secondaryTerm.current) {
                    secondaryStatusBoxRef.current = drawBox(secondaryTerm.current, boxColour.red, title, [message1, message2, message3], 60);
                    setSecondaryOverlay({ variant: 'error', title, lines:[message1, message2, message3]});
                  }
                  
                  secondaryShowManualReconnectPromptRef.current = true;
                  setSecondaryShowManualReconnectPrompt(true);
                }
                return;
              }
              return;
            }
            
            // Check for PTY stream/hijack meta-message
            if (msg.stream === true && typeof msg.hijack === 'boolean') {
              debugLog('[AblyCLITerminal] [Secondary] Received PTY meta-message. Ignoring.');
              return;
            }
          } catch (e) {
            console.error('[Secondary] Failed to parse control message:', e);
          }
          
          // Control message was handled, return
          return;
        }
        
        // Not a control message - process as PTY data
        const dataStr = new TextDecoder().decode(data);
        
        // Filter PTY meta JSON
        if (isHijackMetaChunk(dataStr.trim())) {
          debugLog('[AblyCLITerminal] [Secondary] Suppressed PTY meta-message chunk');
        } else if (secondaryTerm.current) {
          secondaryTerm.current.write(dataStr);
        }
        
        // Use the improved prompt detection logic for the secondary terminal too
        if (!isSecondarySessionActive) {
          secondaryPtyBuffer.current += dataStr;
          
          // Log received data in a way that makes control chars visible
          const sanitizedData = dataStr.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
          debugLog(`[AblyCLITerminal] [Secondary] Received PTY data: "${sanitizedData}"`);
          
          if (secondaryPtyBuffer.current.length > MAX_PTY_BUFFER_LENGTH) {
            secondaryPtyBuffer.current = secondaryPtyBuffer.current.slice(secondaryPtyBuffer.current.length - MAX_PTY_BUFFER_LENGTH);
          }
          
          // Strip ANSI codes
          const cleanBuf = secondaryPtyBuffer.current.replace(/\u001B\[[0-9;]*[mGKHF]/g, '');
          
          // Only detect the prompt if it appears at the end of the buffer
          if (TERMINAL_PROMPT_PATTERN.test(cleanBuf)) {
            debugLog('[AblyCLITerminal] [Secondary] Shell prompt detected at end of buffer');
            clearSecondaryStatusDisplay(); // Clear the overlay when prompt is detected
            
            // Only set active if not already active
            if (!isSecondarySessionActive) {
              setIsSecondarySessionActive(true);
              updateSecondaryConnectionStatus('connected');
              
              if (secondaryTerm.current) secondaryTerm.current.focus();
            }
            
            secondaryPtyBuffer.current = '';
          }
        }
      } catch (e) { 
        console.error('[AblyCLITerminal] [Secondary] Error processing message:', e); 
      }
    });
    
    // WebSocket error handler
    newSocket.addEventListener('error', (event) => {
      console.error('[AblyCLITerminal] [Secondary] WebSocket error:', event);
      console.error('[AblyCLITerminal] [Secondary] WebSocket URL was:', websocketUrl);
      console.error('[AblyCLITerminal] [Secondary] WebSocket state:', newSocket.readyState);
      updateSecondaryConnectionStatus('error');
    });
    
    // WebSocket close handler
    newSocket.addEventListener('close', (event) => {
      debugLog(`[AblyCLITerminal] [Secondary] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
      setIsSecondarySessionActive(false);
      updateSecondaryConnectionStatus('disconnected');
      
      // Check if this is a non-recoverable error
      const NON_RECOVERABLE_CLOSE_CODES = new Set<number>([
        4001, // Policy violation (e.g. invalid credentials)
        4008, // Token expired
        1013, // Try again later
        4002, // Session resume rejected
        4000, // Generic server error
        4003, // Rate limit exceeded
        4004, // Unsupported protocol version
        4009, // Server at capacity
      ]);
      
      if (NON_RECOVERABLE_CLOSE_CODES.has(event.code)) {
        // Clear the secondary session ID as it's no longer valid
        setSecondarySessionId(null);
        if (resumeOnReload && typeof window !== 'undefined') {
          window.sessionStorage.removeItem('ably.cli.secondarySessionId');
          debugLog('[AblyCLITerminal] [Secondary] Cleared invalid session ID due to non-recoverable error');
        }
      }
      
      // Check if this was a user-initiated close
      const userClosedTerminal = event.reason === 'user-closed-secondary' || 
                                 event.reason === 'manual-reconnect';
      
      if (!userClosedTerminal && secondaryTerm.current) {
        let title = "DISCONNECTED";
        let message1 = `Connection closed (Code: ${event.code})${event.reason ? `: ${event.reason}` : ''}.`;
        let message2 = '';
        let message3 = `Press ⏎ to reconnect.`;
        
        // Provide more helpful message for common error codes
        if (event.code === 1006) {
          title = "CONNECTION FAILED";
          message1 = `Unable to connect to server.`;
          message2 = `This may be due to network issues or server availability.`;
          message3 = `Press ⏎ to try again.`;
        } else if (event.code === 4003 || event.reason?.toLowerCase().includes('rate limit')) {
          title = "RATE LIMIT EXCEEDED";
          message1 = `Too many connection attempts.`;
          message2 = event.reason || `Please wait before trying again.`;
          message3 = ``;
        }
        
        secondaryStatusBoxRef.current = drawBox(secondaryTerm.current, boxColour.yellow, title, [message1, message2, message3], 60);
        setSecondaryOverlay({variant:'error', title, lines:[message1, message2, message3]});
        
        secondaryShowManualReconnectPromptRef.current = true;
        setSecondaryShowManualReconnectPrompt(true);
      }
    });
    
    return newSocket;
  }, [websocketUrl, ablyAccessToken, ablyApiKey, resumeOnReload, secondarySessionId]);

  // Initialize the secondary terminal when split mode is enabled
  useEffect(() => {
    // Force a resize event on split mode change to ensure terminals resize correctly
    if (isSplit) {
      window.dispatchEvent(new Event('resize'));
    }
    
    if (!isSplit || !secondaryRootRef.current || secondaryTerm.current) {
      return; // Only initialize once when splitting and element is available
    }

    // Initialize secondary terminal
    debugLog('[AblyCLITerminal] Initializing secondary Terminal instance.');
    secondaryTerm.current = new Terminal({
      cursorBlink: true, cursorStyle: 'block', fontFamily: 'monospace', fontSize: 14,
      theme: { background: '#000000', foreground: '#abb2bf', cursor: '#528bff', selectionBackground: '#3e4451', selectionForeground: '#ffffff' },
      convertEol: true,
    });
    secondaryFitAddon.current = new FitAddon();
    secondaryTerm.current.loadAddon(secondaryFitAddon.current);
    
    // Track current input line for autocomplete (secondary)
    let secondaryCurrentInputLine = '';
    let secondaryCursorPosition = 0;
    
    // Attach custom key handler for special keys (secondary)
    debugLog('[AblyCLITerminal] Setting up custom key handler for secondary terminal');
    secondaryTerm.current.attachCustomKeyEventHandler((event: KeyboardEvent): boolean => {
      // Only handle special keys when connected and session is active
      if (!isSecondarySessionActive || !secondarySocketRef.current || secondarySocketRef.current.readyState !== WebSocket.OPEN) {
        return true; // Let xterm handle it normally
      }
      
      debugLog(`[AblyCLITerminal] [Secondary] KeyboardEvent - key: "${event.key}", code: "${event.code}", ctrl: ${event.ctrlKey}`);
      
      // Handle TAB for autocomplete
      if (event.key === 'Tab' && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        debugLog(`[AblyCLITerminal] [Secondary] TAB intercepted, sending special message for autocomplete`);
        
        secondarySocketRef.current.send(JSON.stringify({
          type: 'readline-control',
          action: 'complete',
          line: secondaryCurrentInputLine,
          cursor: secondaryCursorPosition
        }));
        
        return false; // Prevent default handling
      }
      
      // Handle UP arrow for history
      if (event.key === 'ArrowUp' && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        debugLog(`[AblyCLITerminal] [Secondary] UP arrow intercepted, sending special message for history`);
        
        secondarySocketRef.current.send(JSON.stringify({
          type: 'readline-control',
          action: 'history-up'
        }));
        
        return false; // Prevent default handling
      }
      
      // Handle DOWN arrow for history
      if (event.key === 'ArrowDown' && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        debugLog(`[AblyCLITerminal] [Secondary] DOWN arrow intercepted, sending special message for history`);
        
        secondarySocketRef.current.send(JSON.stringify({
          type: 'readline-control',
          action: 'history-down'
        }));
        
        return false; // Prevent default handling
      }
      
      // Handle Ctrl+R for history search
      if (event.key === 'r' && event.ctrlKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        debugLog(`[AblyCLITerminal] [Secondary] Ctrl+R intercepted, sending special message for history search`);
        
        secondarySocketRef.current.send(JSON.stringify({
          type: 'readline-control',
          action: 'history-search'
        }));
        
        return false; // Prevent default handling
      }
      
      return true; // Let other keys pass through normally
    });
    
    // Handle data input in secondary terminal
    secondaryTerm.current.onData((data: string) => {
      // Special handling for Enter key
      if (data === '\r') {
        const latestStatus = secondaryConnectionStatusRef.current;

        // Manual prompt visible: attempt manual reconnect even if an old socket is open
        if (secondaryShowManualReconnectPromptRef.current) {
          debugLog('[AblyCLITerminal] Secondary terminal: Enter pressed for manual reconnect.');
          
          // Clear overlay and status displays
          clearSecondaryStatusDisplay();
          secondaryShowManualReconnectPromptRef.current = false;
          setSecondaryShowManualReconnectPrompt(false);

          // Forget previous session completely so no resume is attempted
          if (!resumeOnReload) {
            setSecondarySessionId(null);
          }

          // Ensure any lingering socket is fully closed before opening a new one
          if (secondarySocketRef.current && secondarySocketRef.current.readyState !== WebSocket.CLOSED) {
            try { secondarySocketRef.current.close(1000, 'manual-reconnect'); } catch { /* ignore */ }
            secondarySocketRef.current = null; // Make sure the reference is cleared
          }

          // Give the browser a micro-task to mark socket CLOSED before reconnect
          setTimeout(() => {
            debugLog('[AblyCLITerminal] [Secondary] Starting fresh reconnect sequence');
            secondaryPtyBuffer.current = ''; // Clear buffer
            connectSecondaryWebSocket();
          }, 20);
          
          return;
        }

        // Handle other special cases like primary terminal if needed
      }
      
      // Track input line for autocomplete (simple tracking - reset on Enter)
      if (data === '\r') {
        secondaryCurrentInputLine = '';
        secondaryCursorPosition = 0;
      } else if (data === '\x7f') { // Backspace
        if (secondaryCursorPosition > 0) {
          secondaryCurrentInputLine = secondaryCurrentInputLine.slice(0, secondaryCursorPosition - 1) + secondaryCurrentInputLine.slice(secondaryCursorPosition);
          secondaryCursorPosition--;
        }
      } else if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) <= 126) {
        // Regular printable character
        secondaryCurrentInputLine = secondaryCurrentInputLine.slice(0, secondaryCursorPosition) + data + secondaryCurrentInputLine.slice(secondaryCursorPosition);
        secondaryCursorPosition++;
      }

      // Default: forward data to server if socket open
      if (secondarySocketRef.current && secondarySocketRef.current.readyState === WebSocket.OPEN) {
        secondarySocketRef.current.send(data);
      }
    });

    // Open terminal in the DOM
    secondaryTerm.current.open(secondaryRootRef.current);

    try {
      // Do the initial fit only
      secondaryFitAddon.current.fit();
      
      // Initial timeout fit for edge cases
      setTimeout(() => { 
        try { 
          secondaryFitAddon.current?.fit(); 
        } catch(e) { 
          console.warn("Error fitting secondary addon initial timeout:", e);
        }
      }, 100);
    } catch (e) {
      console.error("Error during initial secondary terminal fit:", e);
    }

    // Connect to WebSocket after terminal is initialized with a delay to avoid rate limits
    const connectTimer = setTimeout(() => {
      connectSecondaryWebSocket();
    }, 1000); // 1 second delay to ensure primary connection is established first

    // Cleanup function to properly dispose
    return () => {
      // Clear connect timer if still pending
      clearTimeout(connectTimer);
      
      // Execute cleanup for resize listener
      if (secondaryTermCleanupRef.current) {
        secondaryTermCleanupRef.current();
      }
      
      // Close WebSocket if open
      if (secondarySocketRef.current && secondarySocketRef.current.readyState < WebSocket.CLOSING) {
        debugLog('[AblyCLITerminal] Closing secondary WebSocket on terminal cleanup.');
        secondarySocketRef.current.close();
        secondarySocketRef.current = null;
      }
      
      // Dispose terminal
      if (secondaryTerm.current) {
        debugLog('[AblyCLITerminal] Disposing secondary Terminal.');
        secondaryTerm.current.dispose();
        secondaryTerm.current = null;
      }
      
      // Reset state
      updateSecondaryConnectionStatus('initial');
      setIsSecondarySessionActive(false);
      setSecondaryShowManualReconnectPrompt(false);
      setSecondarySessionId(null);
      setSecondaryOverlay(null);
    };
  }, [isSplit, connectSecondaryWebSocket]);

  // Persist secondary sessionId to localStorage whenever it changes (if enabled)
  useEffect(() => {
    if (!resumeOnReload || typeof window === 'undefined') return;
    if (secondarySessionId) {
      window.sessionStorage.setItem('ably.cli.secondarySessionId', secondarySessionId);
    } else if (isSplit === false) {
      // Only remove if split mode is disabled
      window.sessionStorage.removeItem('ably.cli.secondarySessionId');
    }
  }, [secondarySessionId, resumeOnReload, isSplit]);

  // New function to handle secondary terminal status changes without external reporting
  const updateSecondaryConnectionStatus = useCallback((status: ConnectionStatus) => {
    // Update internal state for the secondary terminal
    setSecondaryConnectionStatus(status);
    secondaryConnectionStatusRef.current = status;
    
    // We intentionally don't call onConnectionStatusChange here
    // as per requirements - only the primary terminal status should be reported
  }, []);

  return (
    <div
      data-testid="terminal-outer-container"
      className="flex flex-col w-full h-full bg-gray-800 text-white overflow-hidden relative"
      style={{ position: 'relative' }}
    >
      {/* Panes with explicit widths to prevent resize issues */}
      <div 
        ref={outerContainerRef}
        className="flex-grow flex w-full h-full relative overflow-hidden"
        style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%' }}
      >
        {/* Primary terminal column with dynamic width */}
        <div 
          style={{ 
            width: isSplit ? `${splitPosition}%` : '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          {/* Terminal 1 tab - only visible in split mode */}
          {isSplit && (
            <div 
              data-testid="tab-1"
              className="flex items-center bg-gray-900 text-sm select-none border-b border-gray-700"
              style={{ width: '100%', flexShrink: 0, height: '28px' }}
            >
              <div className="flex items-center justify-between w-full px-3 py-1">
                <span>Terminal 1</span>
                <button
                  onClick={handleClosePrimary}
                  data-testid="close-terminal-1-button"
                  aria-label="Close Terminal 1"
                  className="bg-transparent border-0 text-gray-400 hover:text-white cursor-pointer"
                  style={{
                    padding: '4px',
                    marginLeft: '4px',
                    marginBottom: '2px',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s ease',
                    background: 'transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.4)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
          
          {/* Primary terminal container */}
          <div
            ref={rootRef}
            data-testid="terminal-container"
            className="Terminal-container bg-black relative overflow-hidden"
            style={{ 
              flex: '1',
              padding: '10px',
              margin: '0',
              boxSizing: 'border-box',
              minHeight: '0', // Important to allow flex container to shrink
              width: '100%',
              position: 'relative'
            }}
          >
            {/* Split button – only when not already split and enableSplitScreen is true */}
            {!isSplit && enableSplitScreen && (
              <button
                onClick={handleSplitScreen}
                aria-label="Split terminal"
                title="Split terminal"
                data-testid="split-terminal-button"
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  zIndex: 9999,
                  backgroundColor: '#374151',
                  borderRadius: '0.25rem',
                  padding: '0.4em',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <SplitSquareHorizontal size={16} />
              </button>
            )}

            {overlay && <TerminalOverlay {...overlay} />}
          </div>
        </div>

        {/* Draggable vertical divider - only visible in split mode */}
        {isSplit && (
          <div 
            data-testid="terminal-divider"
            style={{ 
              width: '5px', 
              height: '100%', 
              backgroundColor: '#6B7280',
              flexShrink: 0,
              flexGrow: 0,
              cursor: 'col-resize',
              position: 'relative',
              zIndex: 10
            }}
            onMouseDown={handleDragStart}
          >
            {/* Visible handle indicator in the middle of the divider */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '3px',
                height: '30px',
                backgroundColor: '#D1D5DB',
                borderRadius: '1.5px'
              }}
            />
          </div>
        )}
        
        {/* Secondary terminal column - only rendered when split is active */}
        {isSplit && (
          <div 
            style={{ 
              width: `${100 - splitPosition}%`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            {/* Terminal 2 tab */}
            <div 
              data-testid="tab-2"
              className="flex items-center bg-gray-900 text-sm select-none border-b border-gray-700"
              style={{ width: '100%', flexShrink: 0, height: '28px' }}
            >
              <div className="flex items-center justify-between w-full px-3 py-1">
                <span>Terminal 2</span>
                <button
                  onClick={handleCloseSecondary}
                  data-testid="close-terminal-2-button"
                  aria-label="Close Terminal 2"
                  className="bg-transparent border-0 text-gray-400 hover:text-white cursor-pointer"
                  style={{
                    padding: '4px',
                    marginLeft: '4px',
                    marginBottom: '2px',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s ease',
                    background: 'transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(75, 85, 99, 0.4)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            
            {/* Secondary terminal container */}
            <div
              ref={secondaryRootRef}
              data-testid="terminal-container-secondary"
              className="Terminal-container bg-black relative overflow-hidden"
              style={{ 
                flex: '1',
                padding: '10px',
                margin: '0',
                boxSizing: 'border-box',
                minHeight: '0', // Important to allow flex container to shrink
                width: '100%',
                position: 'relative'
              }}
            >
              {secondaryOverlay && <TerminalOverlay {...secondaryOverlay} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AblyCliTerminal;