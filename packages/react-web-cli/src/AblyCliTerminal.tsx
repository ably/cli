import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';

// Simple global reconnection state tracker
// Not affected by React component lifecycle
const globalState = {
  attempts: 0,
  getBackoffDelay(): number {
    if (this.attempts === 0) return 0;
    if (this.attempts === 1) return 1000;

    // Exponential backoff: 2^(n-1) * 1000ms with max of 30 seconds
    const baseDelay = Math.min(2 ** (this.attempts - 1) * 1000, 30_000);

    // Add jitter to prevent reconnection storms
    const jitter = 0.2; // 20% jitter
    const randomFactor = 1 - jitter + Math.random() * jitter * 2;
    const delay = Math.floor(baseDelay * randomFactor);

    console.log(
      `[GlobalReconnect] Calculated delay of ${delay}ms for attempt ${this.attempts}`,
    );
    return delay;
  },
  increment() {
    this.attempts++;
    console.log(
      `[GlobalReconnect] Attempt counter incremented to ${this.attempts}`,
    );
  },
  maxAttempts: 15,
  reset() {
    console.log("[GlobalReconnect] Resetting state");
    if (this.timer) clearTimeout(this.timer);
    this.attempts = 0;
    this.timer = null;
  },
  schedule(callback: () => void, delay: number) {
    if (this.timer) clearTimeout(this.timer);

    console.log(
      `[GlobalReconnect] Scheduling attempt #${this.attempts + 1} in ${delay}ms`,
    );
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.attempts < this.maxAttempts) {
        callback();
      }
    }, delay);
  },
  timer: null as NodeJS.Timeout | null,
};

// Connection Status type, mirrors server but can have additional client-side states
type ConnectionStatus = "initial" | "connecting" | "connected" | "disconnected" | "error";

// Keep websocket connection attempts working even when component unmounts
function getGlobalWebsocket(
  url: string,
  callbacks: {
    onClose?: (event: CloseEvent) => void;
    onError?: (event: ErrorEvent | Event) => void; // Allow ErrorEvent
    onMessage?: (event: MessageEvent) => void;
    onOpen?: (ws: WebSocket) => void;
    onReconnect?: (attempt: number) => void;
  },
) {
  try {
    console.log(
      `[GlobalReconnect] Attempting connection to ${url}, attempt #${globalState.attempts + 1}`,
    );
    callbacks.onReconnect?.(globalState.attempts + 1);

    const socket = new WebSocket(url);

    socket.addEventListener("open", (event) => {
      console.log("[GlobalReconnect] Connection successful");
      globalState.reset();
      callbacks.onOpen?.(socket);
    });

    socket.onmessage = (event) => {
      callbacks.onMessage?.(event);
    };

    socket.addEventListener("close", (event) => {
      console.log(`[GlobalReconnect] Connection closed: ${event.code}`);
      callbacks.onClose?.(event);

      // Only reconnect for unexpected close events
      if (event.code !== 1000 && event.code !== 1001) {
        globalState.increment();
        if (globalState.attempts < globalState.maxAttempts) {
          const delay = globalState.getBackoffDelay();
          console.log(`[GlobalReconnect] Will reconnect in ${delay}ms`);
          globalState.schedule(() => {
            getGlobalWebsocket(url, callbacks);
          }, delay);
        } else {
          console.log("[GlobalReconnect] Max attempts reached");
        }
      }
    });

    socket.onerror = (event) => {
      console.log("[GlobalReconnect] Connection error");
      callbacks.onError?.(event);
      // Don't handle reconnection here - onclose will be called after error
    };

    return socket;
  } catch (error) {
    console.error("[GlobalReconnect] Error creating WebSocket:", error);
    callbacks.onError?.(new Event("error"));

    // Schedule reconnection
    globalState.increment();
    if (globalState.attempts < globalState.maxAttempts) {
      const delay = globalState.getBackoffDelay();
      console.log(`[GlobalReconnect] Will reconnect in ${delay}ms after error`);
      globalState.schedule(() => {
        getGlobalWebsocket(url, callbacks);
      }, delay);
    } else {
      console.log("[GlobalReconnect] Max attempts reached after error");
    }

    return null;
  }
}

interface AblyCliTerminalProps {
  ablyAccessToken?: string;
  ablyApiKey?: string;
  onConnectionStatusChange?: (
    status: ConnectionStatus,
  ) => void;
  onSessionEnd?: (reason: string) => void;
  renderRestartButton?: (onRestart: () => void) => React.ReactNode;
  websocketUrl: string;
}

// Simple debounce function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(later, wait);
  };
}

// Debounced function to send resize messages
const debouncedSendResize = debounce(
  (socket: WebSocket | null, cols: number, rows: number) => {
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ cols, rows, type: "resize" }));
        console.log(`[AblyCLITerminal] Sent resize: ${cols}x${rows}`);
      } catch (error) {
        console.error("[AblyCLITerminal] Error sending resize message:", error);
      }
    }
  },
  250,
); // Debounce resize sending by 250ms

// Removed unused scrollbar gutter fix hooks

export const AblyCliTerminal: React.FC<AblyCliTerminalProps> = ({
  ablyAccessToken,
  ablyApiKey,
  onConnectionStatusChange,
  onSessionEnd,
  renderRestartButton,
  websocketUrl,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  // Track previous cols/rows to only send backend resize on width changes
  const prevSize = useRef({ cols: 0, rows: 0 });

  // Replace SessionState with ConnectionStatus for more granularity
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('initial');
  const [sessionEndReason, setSessionEndReason] = useState<null | string>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Use a ref for sessionState inside callbacks to avoid stale closures
  const connectionStatusRef = useRef(connectionStatus);

  // Add a unique ID to the onConnectionStatusChange prop if it's a function, for logging
  const onConnectionStatusChangeId = typeof onConnectionStatusChange === 'function' ? (onConnectionStatusChange as any)._debugId || ((onConnectionStatusChange as any)._debugId = Math.random().toString(36).substr(2, 9)) : null;

  useEffect(() => {
    const oldStatus = connectionStatusRef.current;
    connectionStatusRef.current = connectionStatus;
    
    // useEffect is the source of truth for prop calls based on state changes
    onConnectionStatusChange?.(connectionStatus);

    if (connectionStatus === "connecting") {
      // Ensure terminal is ready for animation, and animation isn't already running
      if (term.current && !animationInterval.current) {
        startConnectingAnimation();
      }
    } else {
      // If status is not connecting, ensure animation is stopped.
      // This is a safeguard; specific handlers should primarily manage stopping.
      if (animationInterval.current) {
        stopConnectingAnimation();
      }
    }
  }, [connectionStatus, onConnectionStatusChange]);

  // ASCII Animation states
  const animationFrames = useRef(["Connecting.  ", "Connecting.. ", "Connecting..."]);
  const animationInterval = useRef<NodeJS.Timeout | null>(null);
  const currentFrameIndex = useRef(0);
  const longestFrameLen = useRef(Math.max(...animationFrames.current.map(f => f.length)));

  const clearAnimationLine = useCallback(() => {
    if (term.current) {
      term.current.write('\r' + ' '.repeat(longestFrameLen.current + 5) + '\r'); // +5 for safety
    }
  }, []);

  const startConnectingAnimation = useCallback(() => {
    if (animationInterval.current) clearInterval(animationInterval.current);
    if (!term.current) return;

    currentFrameIndex.current = 0;
    term.current.write("\r" + animationFrames.current[currentFrameIndex.current]);

    animationInterval.current = setInterval(() => {
      currentFrameIndex.current = (currentFrameIndex.current + 1) % animationFrames.current.length;
      if (term.current) { // Check term.current inside interval
        term.current.write("\r" + animationFrames.current[currentFrameIndex.current]);
      }
    }, 500);
  }, [/* term, animationFrames, currentFrameIndex */]); // Dependencies managed by refs

  const stopConnectingAnimation = useCallback(() => {
    if (animationInterval.current) {
      clearInterval(animationInterval.current);
      animationInterval.current = null;
      console.log("[AblyCLITerminal] Animation interval cleared.");
    }
    console.log("[AblyCLITerminal] Clearing animation line.");
    clearAnimationLine();
  }, [clearAnimationLine]);

  // Debounced backend resize: send resize 200ms after last event
  const debouncedBackendResize = useRef(
    debounce((cols: number, rows: number) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    }, 200)
  ).current;

  // Handlers defined before useEffects that use them
  const handleSessionEnd = useCallback(
    (reason: string) => {
      console.log(`[AblyCLITerminal] Session ended: ${reason}`);
      if (connectionStatusRef.current === "disconnected" || connectionStatusRef.current === "error" ) return;

      stopConnectingAnimation();
      setSessionEndReason(reason);
      setConnectionStatus("disconnected"); 
      onSessionEnd?.(reason);

      if (term.current) { // Check if term.current exists
        term.current.writeln(`\r\n\n--- Session Ended: ${reason} ---\r\n`);
      }

      if (socketRef.current) {
        console.log("[AblyCLITerminal] Closing socket on session end");
        const socketToClose = socketRef.current;
        socketRef.current = null;
        socketToClose.onclose = null; // Prevent handleWsClose
        socketToClose.onerror = null;
        try {
          if (socketToClose.readyState === WebSocket.OPEN) {
            socketToClose.close(1000, "Session ended by server or error");
          }
        } catch (error) {
          console.error(
            "[AblyCLITerminal] Error closing socket on session end:",
            error,
          );
        }
      }
    },
    [onSessionEnd],
  );

  const handleRestart = useCallback(() => {
    console.log("[AblyCLITerminal] User initiated restart");
    globalState.reset(); // Reset reconnection state
    setReconnectAttempt(0);
    setSessionEndReason(null);
    term.current?.reset(); // Clear terminal content
    setConnectionStatus("initial"); // This will trigger the connection useEffect
  }, []);

  // Initialize terminal & setup ONLY window resize handling
  useEffect(() => {
    let initialFitTimeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;

    // Use ResizeObserver on the terminal container to trigger fit
    let resizeObserver: ResizeObserver | null = null;

    if (terminalRef.current && !term.current) {
      console.log("[AblyCLITerminal] Initializing Terminal");
      const terminal = new Terminal({
        allowTransparency: true,
        convertEol: true,
        cursorBlink: true,
        fontSize: 14,
        theme: { background: '#000000' },
        scrollback: 5000,  // Set a larger scrollback buffer to ensure all content is maintained
        smoothScrollDuration: 300, // Enable smooth scrolling effect for 300ms duration
        // @ts-ignore: reflowCursorLine exists at runtime though missing in types
        reflowCursorLine: true
      });
      const addon = new FitAddon();
      terminal.loadAddon(addon);

      term.current = terminal;
      fitAddon.current = addon;

      terminal.open(terminalRef.current);
      // Initialize prevSize to initial terminal dimensions
      prevSize.current = { cols: terminal.cols, rows: terminal.rows };

      terminal.onData((data) => {
        if (isMounted && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(data);
        }
      });

      // Observe container resize to trigger fit and gutter fix
      resizeObserver = new ResizeObserver(() => {
        if (isMounted && fitAddon.current) {
          console.log('[AblyCLITerminal] ResizeObserver triggered fit');
          fitAddon.current.fit();
        }
      });
      resizeObserver.observe(terminalRef.current);

      // Initial fit and gutter fix
      initialFitTimeoutId = setTimeout(() => {
        if (!isMounted || !fitAddon.current) return;
        console.log('[AblyCLITerminal] Initial delayed fit executing');
        fitAddon.current.fit();
        term.current?.focus();
      }, 100);

      // Scroll to bottom on any parsed write to keep last line visible
      terminal.onWriteParsed(() => {
        if (isMounted) {
          terminal.scrollToBottom();
        }
      });

      // Removed unused CSS injection
    }

    // Cleanup
    return () => {
      isMounted = false;
      console.log("[AblyCLITerminal] Disposing Terminal");
      if (initialFitTimeoutId) clearTimeout(initialFitTimeoutId);
      if (resizeObserver) resizeObserver.disconnect();
      term.current?.dispose();
      term.current = null;
      fitAddon.current = null;
      socketRef.current?.close(1000, "Terminal component unmounting");
    };
  }, []); // IMPORTANT: Run only once on mount

  // WebSocket Handlers defined using useCallback for stable references
  const handleWsOpen = useCallback((socket: WebSocket) => {
    console.log("[AblyCLITerminal] Connection opened");
    socketRef.current = socket;
    socket.binaryType = "arraybuffer";
    try {
      const authMessage = JSON.stringify({
        accessToken: ablyAccessToken,
        apiKey: ablyApiKey,
        environmentVariables: {
          COLORTERM: "truecolor",
          LANG: "en_US.UTF-8",
          LC_ALL: "en_US.UTF-8",
          LC_CTYPE: "en_US.UTF-8",
          PS1: "$ ",
          TERM: "xterm-256color",
        },
        type: "auth",
      });
      socket.send(authMessage);
      setReconnectAttempt(0); // Reset reconnect attempts on successful open
    } catch (error) {
      console.error("[AblyCLITerminal] Error sending auth:", error);
      handleSessionEnd(
        `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, [ablyAccessToken, ablyApiKey, handleSessionEnd]);

  const handleWsMessage = useCallback((event: MessageEvent) => {
    if (!term.current) return;
    // Update type to include Uint8Array
    let rawPtyData: string | Uint8Array | null = null;
    let receivedMsgType = 'unknown'; // For logging
    let statusPayload = 'none'; // For logging

    try {
      console.log(`[AblyCLITerminal] handleWsMessage - Raw data received`);
      const messageData = JSON.parse(event.data as string);
      receivedMsgType = messageData.type || 'json_no_type';

      if (messageData.type === "status") {
        statusPayload = messageData.payload || 'status_no_payload';
        console.log(`[AblyCLITerminal] Received status message: ${statusPayload}`);
        const { payload, reason, details } = messageData;
        switch (payload) {
          case "connecting": // Server confirms it's processing connection
            if (connectionStatusRef.current !== "connecting") {
              setConnectionStatus("connecting");
              // useEffect will call onConnectionStatusChange("connecting") and start animation
            }
            break;
          case "connected": // Server confirms PTY is ready
            if (connectionStatusRef.current === "connecting") {
              stopConnectingAnimation();
            }
            setConnectionStatus("connected");
            onConnectionStatusChange?.("connected");
            setTimeout(() => fitAddon.current?.fit(), 50);
            break;
          case "disconnected":
            if (connectionStatusRef.current === "connecting") {
              stopConnectingAnimation();
            }
            handleSessionEnd(reason || "Disconnected by server");
            onConnectionStatusChange?.("disconnected");
            break;
          case "error":
            if (connectionStatusRef.current === "connecting") {
              stopConnectingAnimation(); // Ensure animation is stopped before status change
            }
            setConnectionStatus("error");
            onConnectionStatusChange?.("error");
            if (term.current) {
              term.current.writeln(`\r\n\n--- Error: ${reason || "Unknown server error"} ---\r\n`);
              if (details) {
                term.current.writeln(JSON.stringify(details, null, 2));
              }
            }
            break;
          default:
            console.warn("[AblyCLITerminal] Unknown status payload:", payload);
        }
      } else if (messageData.type === "data" && typeof messageData.payload === "string") {
        console.log("[AblyCLITerminal] Received wrapped PTY data");
        rawPtyData = messageData.payload;
      } else {
        console.warn("[AblyCLITerminal] Received other JSON message type:", messageData.type);
        rawPtyData = event.data as string;
      }
    } catch (error) {
      console.log("[AblyCLITerminal] Received non-JSON PTY data");
      receivedMsgType = 'raw_non_json';
      
      // --- Explicitly handle expected types --- 
      if (event.data instanceof ArrayBuffer) {
         console.log("[AblyCLITerminal] Data is ArrayBuffer");
         rawPtyData = new Uint8Array(event.data); // Correct type for term.write
      } else if (typeof event.data === 'string') {
         console.log("[AblyCLITerminal] Data is string");
         rawPtyData = event.data;
      } else {
         // Log unexpected types
         console.error(`[AblyCLITerminal] UNEXPECTED data type received: ${typeof event.data}`, event.data);
         rawPtyData = null; // Prevent writing unknown types
      }
    }

    if (rawPtyData !== null) {
      console.log(`[AblyCLITerminal] Processing PTY data`);
      if (connectionStatusRef.current === "connecting") {
        console.log("[AblyCLITerminal] Stopping animation due to first PTY data reception.");
        stopConnectingAnimation();
        setConnectionStatus("connected"); // Implicitly connected
      }
      term.current?.write(rawPtyData); // Pass string or Uint8Array
    }
  }, [handleSessionEnd, stopConnectingAnimation, onConnectionStatusChange, onConnectionStatusChangeId]);

  const handleWsClose = useCallback((event: CloseEvent) => {
    console.log(`[AblyCLITerminal] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
    stopConnectingAnimation(); // Ensure animation is stopped
    // Avoid calling sessionEnd if already ended by server message or error
    if (connectionStatusRef.current !== "disconnected" && connectionStatusRef.current !== "error") {
      setConnectionStatus("disconnected");
      setSessionEndReason(event.reason || `WebSocket closed: ${event.code}`);
      onSessionEnd?.(event.reason || `WebSocket closed: ${event.code}`);
      if (term.current) { // Check if term.current exists
          term.current.writeln(`\r\n\n--- Connection Closed (Code: ${event.code}) ---\r\n`);
      }
    }
    socketRef.current = null;
  }, [onSessionEnd, stopConnectingAnimation]);

  const handleWsError = useCallback((event: ErrorEvent | Event) => {
    console.error("[AblyCLITerminal] WebSocket error:", event);
    stopConnectingAnimation(); // Ensure animation is stopped
    if (connectionStatusRef.current !== "disconnected" && connectionStatusRef.current !== "error") {
      setConnectionStatus("error");
      setSessionEndReason((event as ErrorEvent).message || "WebSocket error");
      if (term.current) { // Check term.current
        term.current.writeln(
          `\r\n\n--- Connection Error: ${(event as ErrorEvent).message || "Unknown WebSocket error"} ---\r\n`,
        );
      }
    }
    // getGlobalWebsocket will handle reconnection logic, so no need to close socketRef here directly
    // as onclose will be triggered by getGlobalWebsocket if the error leads to a close.
  }, [stopConnectingAnimation]);

  const handleReconnectAttempt = useCallback((attempt: number) => {
    console.log(`[AblyCLITerminal] Reconnect attempt: ${attempt}`);
    setReconnectAttempt(attempt);
    // Set status to connecting. useEffect will handle starting animation.
    if (connectionStatusRef.current !== "connecting") {
      setConnectionStatus("connecting");
    } else {
      // If already connecting, ensure animation is running (e.g. if it was stopped by a quick error)
      if (term.current && !animationInterval.current) {
        startConnectingAnimation();
      }
    }
    // The old logic to writeln reconnect attempt here is removed as animation handles "Connecting..."
  }, [startConnectingAnimation]);

  // Start connection when credentials are available
  useEffect(() => {
    if (
      !ablyApiKey ||
      !ablyAccessToken ||
      !websocketUrl ||
      connectionStatus !== "initial"
    ) {
      return;
    }

    console.log("[AblyCLITerminal] Starting connection process");
    setConnectionStatus("connecting");
    setReconnectAttempt(0); // Reset attempts when starting fresh
    setSessionEndReason(null);

    // Close existing socket if any (e.g., from a previous failed attempt)
    if (socketRef.current) {
      console.log("[AblyCLITerminal] Closing existing socket before reconnect");
      socketRef.current.onclose = null; // Prevent close handler conflicts
      socketRef.current.onerror = null;
      try {
        socketRef.current.close(1000, "Starting new connection");
      } catch (error) {
        console.error(
          "[AblyCLITerminal] Error closing existing socket:",
          error,
        );
      }

      socketRef.current = null;
    }

    const url = websocketUrl.endsWith("/")
      ? websocketUrl.slice(0, -1)
      : websocketUrl;

    // Initiate connection
    getGlobalWebsocket(url, {
      onClose: handleWsClose,
      onError: handleWsError,
      onMessage: handleWsMessage,
      onOpen: handleWsOpen,
      onReconnect: handleReconnectAttempt,
    });

    // Cleanup function for this effect
    return () => {
      console.log(
        "[AblyCLITerminal] Connection effect cleanup. Current socket state:",
        socketRef.current?.readyState,
      );
      if (
        socketRef.current &&
        (socketRef.current.readyState === WebSocket.OPEN ||
          socketRef.current.readyState === WebSocket.CONNECTING)
      ) {
        console.log(
          "[AblyCLITerminal] Closing socket during connection effect cleanup",
        );
        const socketToClose = socketRef.current;
        socketRef.current = null;
        socketToClose.onclose = null;
        socketToClose.onerror = null;
        try {
          socketToClose.close(1000, "Component unmounting or deps changed");
        } catch (error) {
          console.error(
            "[AblyCLITerminal] Error closing socket during cleanup:",
            error,
          );
        }
      }
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [
    ablyApiKey,
    ablyAccessToken,
    websocketUrl,
    connectionStatus,
    onConnectionStatusChange,
    handleWsOpen,
    handleWsMessage,
    handleWsClose,
    handleWsError,
    handleReconnectAttempt,
    handleSessionEnd
  ]);

  // Ensure terminal is focused when session becomes active
  useEffect(() => {
    if (connectionStatus === 'connected' && term.current) {
      console.log('[AblyCLITerminal] Session active - focusing terminal');
      setTimeout(() => {
        term.current?.focus();

        // Apply fit and send resize without manipulating rows
        if (fitAddon.current && term.current) {
          console.log('[AblyCLITerminal] Applying fit on session active');
          fitAddon.current.fit();

          // Get current dimensions for resize message
          // REMOVED: Manual resize send is no longer needed here, terminal.onResize handles it
          /*
          const { cols, rows } = term.current;
          console.log(`[AblyCLITerminal] Session active, terminal size: ${cols}x${rows}`);

          // Send resize message with original dimensions
          // FIX LINTER: Add null check for socketRef.current and readyState check
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
          */
          // NOTE: We no longer manually send resize from here.
          // The terminal.onResize handler, triggered by fitAddon.fit(),
          // will send the necessary update immediately.
        }
      }, 100);
    }
  }, [connectionStatus]);

  // Add an explicit focus handler
  const handleTerminalClick = useCallback(() => {
    if (term.current && connectionStatus === "connected") {
      console.log("[AblyCLITerminal] Focus requested by click");
      term.current.focus();
    }
  }, [connectionStatus]);

  // Handle window resize: fit terminal and optionally notify backend
  const handleWindowResize = debounce(() => {
    if (fitAddon.current && term.current) {
      fitAddon.current.fit();
      // term.current.scrollToBottom(); // Removed: This caused issues with scrollback
      const { cols, rows } = term.current;
      // Only send resize to backend when width changes
      if (connectionStatusRef.current === 'connected' && socketRef.current?.readyState === WebSocket.OPEN) {
        if (cols !== prevSize.current.cols || rows !== prevSize.current.rows ) { // Send if either cols or rows change
          // Send resize with debounced sender
          debouncedSendResize(socketRef.current, cols, rows);
          // socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      }
      prevSize.current = { cols, rows };
    }
  }, 200);
  // Attach and detach resize listener correctly
  useEffect(() => {
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [handleWindowResize]);

  // Render terminal with reconnection indicator
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      position: 'relative',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Terminal container with overflow handling and proper padding */}
      <div
        onClick={handleTerminalClick}
        ref={terminalRef}
        style={{
          flex: '1 1 auto',
          height: '100%',
          minHeight: 0,
          overflow: 'auto',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}
      />

      {/* Overlays for status/reconnect/restart */}
      {connectionStatus === "connecting" && (
        <div
          style={{
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.7)",
            bottom: 0,
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            justifyContent: "center",
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
            zIndex: 10,
          }}
        >
          <div>Connecting to Ably CLI...</div>
          {reconnectAttempt > 0 && (
            <div style={{ fontSize: "0.9em", opacity: 0.8 }}>
              (Attempt {reconnectAttempt}/{globalState.maxAttempts})
            </div>
          )}
        </div>
      )}
      {(connectionStatus === "disconnected" || connectionStatus === "error") && (
        <div
          style={{
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.8)",
            bottom: 0,
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            justifyContent: "center",
            left: 0,
            padding: "20px",
            position: "absolute",
            right: 0,
            textAlign: "center",
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ color: "#ff6b6b", fontSize: "1.2em" }}>
            Session Ended
          </div>
          <div style={{ fontSize: "0.9em", opacity: 0.9 }}>
            {sessionEndReason || "Connection closed"}
          </div>
          {renderRestartButton ? (
            renderRestartButton(handleRestart)
          ) : (
            <button
              onClick={handleRestart}
              style={{
                backgroundColor: "#4CAF50",
                border: "none",
                borderRadius: "4px",
                color: "white",
                cursor: "pointer",
                marginTop: "10px",
                padding: "8px 16px",
              }}
            >
              Restart Session
            </button>
          )}
        </div>
      )}
    </div>
  );
};
