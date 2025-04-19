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
    status: "connected" | "connecting" | "disconnected" | "error",
  ) => void;
  onSessionEnd?: (reason: string) => void;
  renderRestartButton?: (onRestart: () => void) => React.ReactNode;
  websocketUrl: string;
}

type SessionState = "active" | "connecting" | "ended" | "inactive";

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

  const [sessionState, setSessionState] = useState<SessionState>('inactive');
  const [sessionEndReason, setSessionEndReason] = useState<null | string>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Use a ref for sessionState inside callbacks to avoid stale closures
  const sessionStateRef = useRef(sessionState);
  useEffect(() => { sessionStateRef.current = sessionState; }, [sessionState]);

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
      // Check if already ended to prevent loops
      if (sessionStateRef.current === "ended") return; // Use ref here

      setSessionEndReason(reason);
      setSessionState("ended");
      onConnectionStatusChange?.("disconnected");
      onSessionEnd?.(reason);

      term.current?.writeln(`\r\n\n--- Session Ended: ${reason} ---\r\n`);

      // Close socket if it's still open
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
    [onConnectionStatusChange, onSessionEnd],
  );

  const handleRestart = useCallback(() => {
    console.log("[AblyCLITerminal] User initiated restart");
    globalState.reset(); // Reset reconnection state
    setReconnectAttempt(0);
    setSessionEndReason(null);
    term.current?.reset(); // Clear terminal content
    onConnectionStatusChange?.("connecting"); // Set status immediately
    setSessionState("inactive"); // This will trigger the connection useEffect
  }, [onConnectionStatusChange]);

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
        theme: { background: '#121212' },
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

  // Start connection when credentials are available
  useEffect(() => {
    if (
      !ablyApiKey ||
      !ablyAccessToken ||
      !websocketUrl ||
      sessionState !== "inactive"
    ) {
      return;
    }

    console.log("[AblyCLITerminal] Starting connection process");
    setSessionState("connecting");
    setReconnectAttempt(0); // Reset attempts when starting fresh
    setSessionEndReason(null);
    onConnectionStatusChange?.("connecting");

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

    // WebSocket Handlers using handleSessionEnd
    const handleWsOpen = (socket: WebSocket) => {
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
        setSessionState("active");
        onConnectionStatusChange?.("connected");
      } catch (error) {
        console.error("[AblyCLITerminal] Error sending auth:", error);
        handleSessionEnd(
          `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        ); // Use defined handler
      }
    };

    const handleWsMessage = (event: MessageEvent) => {
      if (!term.current) return;
      try {
        if (typeof event.data === "string") {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "session_end") {
              handleSessionEnd(message.reason || "Server ended session");
              return;
            }

            // If it was JSON but not session_end, maybe write it?
            // For now, assuming only session_end is expected JSON.
            // If other JSON messages are possible, handle them here.
            console.log(
              "[AblyCLITerminal] Received unexpected JSON message:",
              message,
            );
          } catch {
            // --- DEBUGGING: Log string data (less likely to be the issue) ---
            // console.log(`[DEBUG WS_RECV_STR] String(${event.data.length}): ${event.data}`);
            // --- END DEBUGGING ---
            term.current.write(event.data);
          }
        } else if (event.data instanceof Blob) {
          event.data.arrayBuffer().then((buffer) => {
            const dataArray = new Uint8Array(buffer);
            // --- DEBUGGING: Log received ArrayBuffer from Blob ---
            // console.log(`[DEBUG WS_RECV_BLOB] Uint8Array(${dataArray.length}): ${Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join('')}`);
            // --- END DEBUGGING ---
            term.current?.write(dataArray);
          });
        } else if (event.data instanceof ArrayBuffer) {
          const dataArray = new Uint8Array(event.data);
          // --- DEBUGGING: Log received ArrayBuffer directly ---
          // console.log(`[DEBUG WS_RECV_ARRBUF] Uint8Array(${dataArray.length}): ${Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join('')}`);
          // --- END DEBUGGING ---
          term.current.write(dataArray);
        }
      } catch (error) {
        console.error("[AblyCLITerminal] Error processing message:", error);
      }
    };

    const handleWsClose = (event: CloseEvent) => {
      const currentSocket = socketRef.current; // Capture current ref value
      socketRef.current = null;
      if (sessionStateRef.current === "active") {
        console.log(
          `[AblyCLITerminal] Unexpected close (Code: ${event.code}), session ended.`,
        );
        handleSessionEnd(
          `Connection closed unexpectedly (Code: ${event.code})`,
        ); // Use defined handler
      }
    };

    const handleWsError = (event: ErrorEvent | Event) => {
      const reason =
        event instanceof ErrorEvent
          ? event.message
          : "WebSocket connection error";
      console.error(`[AblyCLITerminal] WebSocket Error: ${reason}`);
      if (sessionStateRef.current === "connecting") {
        term.current?.writeln(`\r\nConnection failed: ${reason}`);
        handleSessionEnd(`Connection failed: ${reason}`); // Use defined handler
      }
    };

    const handleReconnectAttempt = (attempt: number) => {
      setReconnectAttempt(attempt);
      onConnectionStatusChange?.("connecting");
    };

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
    sessionState === "inactive",
    handleSessionEnd,
    onConnectionStatusChange,
  ]); // Add handleSessionEnd to deps

  // Ensure terminal is focused when session becomes active
  useEffect(() => {
    if (sessionState === 'active' && term.current) {
      console.log('[AblyCLITerminal] Session active - focusing terminal and triggering initial resize send');
      console.log('[AblyCLITerminal] Session active - focusing terminal');
      // Using setTimeout to ensure DOM is ready and FitAddon has likely run
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
  }, [sessionState]);

  // Add an explicit focus handler
  const handleTerminalClick = useCallback(() => {
    if (term.current && sessionState === "active") {
      console.log("[AblyCLITerminal] Focus requested by click");
      term.current.focus();
    }
  }, [sessionState]);

  // Handle window resize: fit terminal and optionally notify backend
  const handleWindowResize = debounce(() => {
    if (fitAddon.current && term.current) {
      fitAddon.current.fit();
      term.current.scrollToBottom();
      const { cols, rows } = term.current;
      // Only send resize to backend when width changes
      if (sessionStateRef.current === 'active' && socketRef.current?.readyState === WebSocket.OPEN) {
        if (cols !== prevSize.current.cols) {
          socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      }
      prevSize.current = { cols, rows };
    }
  }, 200);
  window.addEventListener('resize', handleWindowResize);

  // Render terminal with reconnection indicator
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',          // Hide internal scrollbars
      position: 'relative',       // Needed for overlays
      width: '100%',
      boxSizing: 'border-box',    // Include padding in width/height
    }}>
      {/* Terminal container with overflow handling and proper padding */}
      <div
        onClick={handleTerminalClick}
        ref={terminalRef}
        style={{
          flex: '1 1 auto',          // Grow/shrink vertically
          height: '100%',            // Full height for FitAddon
          minHeight: 0,              // Fix flex height issues
          overflow: 'auto',          // Allow scroll when content overflows
          padding: '10px',           // Side padding
          position: 'relative',      // For child positioning
          display: 'flex',           // Flex layout for terminal
          flexDirection: 'column'    // Vertical stack
        }}
      />

      {/* Overlays for status/reconnect/restart */}
      {sessionState === "connecting" && (
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
      {sessionState === "ended" && (
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
