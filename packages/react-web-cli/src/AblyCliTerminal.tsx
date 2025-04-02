import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit'; // Step 4: Re-enable FitAddon import
import '@xterm/xterm/css/xterm.css';

// Simple global reconnection state tracker
// Not affected by React component lifecycle
const globalState = {
  attempts: 0,
  timer: null as NodeJS.Timeout | null,
  maxAttempts: 15,
  reset() {
    console.log('[GlobalReconnect] Resetting state');
    if (this.timer) clearTimeout(this.timer);
    this.attempts = 0;
    this.timer = null;
  },
  increment() {
    this.attempts++;
    console.log(`[GlobalReconnect] Attempt counter incremented to ${this.attempts}`);
  },
  schedule(callback: () => void, delay: number) {
    if (this.timer) clearTimeout(this.timer);
    
    console.log(`[GlobalReconnect] Scheduling attempt #${this.attempts + 1} in ${delay}ms`);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.attempts < this.maxAttempts) {
        callback();
      }
    }, delay);
  },
  getBackoffDelay(): number {
    if (this.attempts === 0) return 0;
    if (this.attempts === 1) return 1000;
    
    // Exponential backoff: 2^(n-1) * 1000ms with max of 30 seconds
    const baseDelay = Math.min(Math.pow(2, this.attempts - 1) * 1000, 30000);
    
    // Add jitter to prevent reconnection storms
    const jitter = 0.2; // 20% jitter
    const randomFactor = 1 - jitter + (Math.random() * jitter * 2);
    const delay = Math.floor(baseDelay * randomFactor);
    
    console.log(`[GlobalReconnect] Calculated delay of ${delay}ms for attempt ${this.attempts}`);
    return delay;
  }
};

// Keep websocket connection attempts working even when component unmounts
function getGlobalWebsocket(url: string, callbacks: {
  onOpen?: (ws: WebSocket) => void;
  onMessage?: (event: MessageEvent) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event | ErrorEvent) => void; // Allow ErrorEvent
  onReconnect?: (attempt: number) => void;
}) {
  try {
    console.log(`[GlobalReconnect] Attempting connection to ${url}, attempt #${globalState.attempts + 1}`);
    callbacks.onReconnect?.(globalState.attempts + 1);
    
    const socket = new WebSocket(url);
    
    socket.onopen = (event) => {
      console.log('[GlobalReconnect] Connection successful');
      globalState.reset();
      callbacks.onOpen?.(socket);
    };
    
    socket.onmessage = (event) => {
      callbacks.onMessage?.(event);
    };
    
    socket.onclose = (event) => {
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
          console.log('[GlobalReconnect] Max attempts reached');
        }
      }
    };
    
    socket.onerror = (event) => {
      console.log('[GlobalReconnect] Connection error');
      callbacks.onError?.(event);
      // Don't handle reconnection here - onclose will be called after error
    };
    
    return socket;
  } catch (error) {
    console.error('[GlobalReconnect] Error creating WebSocket:', error);
    callbacks.onError?.(new Event('error'));
    
    // Schedule reconnection
    globalState.increment();
    if (globalState.attempts < globalState.maxAttempts) {
      const delay = globalState.getBackoffDelay();
      console.log(`[GlobalReconnect] Will reconnect in ${delay}ms after error`);
      globalState.schedule(() => {
        getGlobalWebsocket(url, callbacks);
      }, delay);
    } else {
      console.log('[GlobalReconnect] Max attempts reached after error');
    }
    
    return null;
  }
}

interface AblyCliTerminalProps {
  websocketUrl: string;
  ablyApiKey?: string;
  ablyAccessToken?: string;
  onConnectionStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  onSessionEnd?: (reason: string) => void;
  renderRestartButton?: (onRestart: () => void) => React.ReactNode;
}

type SessionState = 'inactive' | 'connecting' | 'active' | 'ended';

// Simple debounce function
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
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
const debouncedSendResize = debounce((socket: WebSocket | null, cols: number, rows: number) => {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'resize', cols, rows }));
      console.log(`[AblyCLITerminal] Sent resize: ${cols}x${rows}`);
    } catch (err) {
      console.error('[AblyCLITerminal] Error sending resize message:', err);
    }
  }
}, 250); // Debounce resize sending by 250ms

export const AblyCliTerminal: React.FC<AblyCliTerminalProps> = ({
  websocketUrl,
  ablyApiKey,
  ablyAccessToken,
  onConnectionStatusChange,
  onSessionEnd,
  renderRestartButton,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null); // Step 4: Re-enable FitAddon ref
  const socketRef = useRef<WebSocket | null>(null);
  
  const [sessionState, setSessionState] = useState<SessionState>('inactive');
  const [sessionEndReason, setSessionEndReason] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Use a ref for sessionState inside callbacks to avoid stale closures
  const sessionStateRef = useRef(sessionState);
  useEffect(() => { sessionStateRef.current = sessionState; }, [sessionState]);
  
  // Handlers defined before useEffects that use them
  const handleSessionEnd = useCallback((reason: string) => {
    console.log(`[AblyCLITerminal] Session ended: ${reason}`);
    // Check if already ended to prevent loops
    if (sessionStateRef.current === 'ended') return; // Use ref here
    
    setSessionEndReason(reason);
    setSessionState('ended');
    onConnectionStatusChange?.('disconnected');
    onSessionEnd?.(reason);

    term.current?.writeln(`\r\n\n--- Session Ended: ${reason} ---\r\n`);

    // Close socket if it's still open
    if (socketRef.current) {
       console.log('[AblyCLITerminal] Closing socket on session end');
       const socketToClose = socketRef.current;
       socketRef.current = null;
       socketToClose.onclose = null; // Prevent handleWsClose
       socketToClose.onerror = null;
       try {
          if(socketToClose.readyState === WebSocket.OPEN) {
             socketToClose.close(1000, "Session ended by server or error");
          }
       } catch (e) { console.error('[AblyCLITerminal] Error closing socket on session end:', e); }
    }
  }, [onConnectionStatusChange, onSessionEnd]);

  const handleRestart = useCallback(() => {
    console.log('[AblyCLITerminal] User initiated restart');
    globalState.reset(); // Reset reconnection state
    setReconnectAttempt(0);
    setSessionEndReason(null);
    term.current?.reset(); // Clear terminal content
    onConnectionStatusChange?.('connecting'); // Set status immediately
    setSessionState('inactive'); // This will trigger the connection useEffect
  }, [onConnectionStatusChange]);

  // Initialize terminal & setup ONLY window resize handling
  useEffect(() => {
    let initialFitTimeoutId: NodeJS.Timeout | null = null; 
    let isMounted = true;

    // Debounced fit function for window resize
    const debouncedWindowResizeFit = debounce(() => {
      if (isMounted && fitAddon.current ) { // Step 4: Re-enable fitAddon check
        console.log('[AblyCLITerminal] Window resize -> fit executing');
        fitAddon.current.fit(); // Step 4: Re-enable fit call
      }
    }, 150); 

    if (terminalRef.current && !term.current) {
      console.log('[AblyCLITerminal] Initializing Terminal');
      const terminal = new Terminal({
        cursorBlink: true,
        convertEol: true,
        fontSize: 14,
        allowTransparency: true,
        theme: { background: '#121212' }
      });
      const addon = new FitAddon(); // Step 4: Re-enable addon creation
      terminal.loadAddon(addon); // Step 4: Re-enable loading addon

      term.current = terminal;
      fitAddon.current = addon; // Step 4: Re-enable storing addon ref

      terminal.open(terminalRef.current);

      // --- CRITICAL: Initial Fit --- 
      initialFitTimeoutId = setTimeout(() => {
         if (isMounted && fitAddon.current) { // Step 4: Add check here too
            console.log('[AblyCLITerminal] Initial delayed fit executing');
            fitAddon.current.fit(); // Step 4: Re-enable initial fit call
            term.current?.focus(); 
        }
      }, 100);
      // setTimeout(() => term.current?.focus(), 100); // Focus is now inside fit timeout

      terminal.onData((data) => {
        if (isMounted && socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(data);
        }
      });

      // Attach listener ONLY for window resize events
      window.addEventListener('resize', debouncedWindowResizeFit);

      // Add listener for terminal resize events (triggered by FitAddon)
      terminal.onResize(({ cols, rows }) => {
        if (isMounted && sessionStateRef.current === 'active') { // Only send when active
          debouncedSendResize(socketRef.current, cols, rows);
        }
      });

      // Cleanup
      return () => {
        isMounted = false;
        console.log('[AblyCLITerminal] Disposing Terminal');
        if (initialFitTimeoutId) clearTimeout(initialFitTimeoutId); // Step 4: Re-enable timer clear
        window.removeEventListener('resize', debouncedWindowResizeFit);
        term.current?.dispose();
        term.current = null;
        fitAddon.current = null; // Step 4: Re-enable ref clear
        socketRef.current?.close(1000, "Terminal component unmounting");
      };
    }
  }, []); // IMPORTANT: Run only once on mount

  // Start connection when credentials are available
  useEffect(() => {
    if (!ablyApiKey || !ablyAccessToken || !websocketUrl || sessionState !== 'inactive') {
      return;
    }

    console.log('[AblyCLITerminal] Starting connection process');
    setSessionState('connecting');
    setReconnectAttempt(0); // Reset attempts when starting fresh
    setSessionEndReason(null);
    onConnectionStatusChange?.('connecting');

    // Close existing socket if any (e.g., from a previous failed attempt)
    if (socketRef.current) {
      console.log('[AblyCLITerminal] Closing existing socket before reconnect');
      socketRef.current.onclose = null; // Prevent close handler conflicts
      socketRef.current.onerror = null;
      try {
        socketRef.current.close(1000, "Starting new connection");
      } catch (e) {
        console.error('[AblyCLITerminal] Error closing existing socket:', e);
      }
      socketRef.current = null;
    }

    const url = websocketUrl.endsWith('/') ? websocketUrl.slice(0, -1) : websocketUrl;

    // WebSocket Handlers using handleSessionEnd
    const handleWsOpen = (socket: WebSocket) => {
      console.log('[AblyCLITerminal] Connection opened');
      socketRef.current = socket;
      socket.binaryType = 'arraybuffer';
      try {
        const authMessage = JSON.stringify({
          type: 'auth',
          apiKey: ablyApiKey,
          accessToken: ablyAccessToken,
          environmentVariables: {
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            LANG: 'en_US.UTF-8',
            LC_ALL: 'en_US.UTF-8',
            LC_CTYPE: 'en_US.UTF-8',
            PS1: '$ '
          }
        });
        socket.send(authMessage);
        setSessionState('active');
        onConnectionStatusChange?.('connected');
      } catch (err) {
        console.error('[AblyCLITerminal] Error sending auth:', err);
        handleSessionEnd(`Authentication failed: ${err instanceof Error ? err.message : String(err)}`); // Use defined handler
      }
    };

    const handleWsMessage = (event: MessageEvent) => {
      if (!term.current) return;
      try {
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'session_end') {
              handleSessionEnd(message.reason || 'Server ended session');
              return;
            }
            // If it was JSON but not session_end, maybe write it?
            // For now, assuming only session_end is expected JSON.
            // If other JSON messages are possible, handle them here.
            console.log('[AblyCLITerminal] Received unexpected JSON message:', message);
          } catch (e) {
            // --- DEBUGGING: Log string data (less likely to be the issue) ---
            // console.log(`[DEBUG WS_RECV_STR] String(${event.data.length}): ${event.data}`);
            // --- END DEBUGGING ---
            term.current.write(event.data);
          }
        } else if (event.data instanceof Blob) {
          event.data.arrayBuffer().then(buffer => {
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
      } catch (err) {
        console.error('[AblyCLITerminal] Error processing message:', err);
      }
    };

    const handleWsClose = (event: CloseEvent) => {
      const currentSocket = socketRef.current; // Capture current ref value
      socketRef.current = null;
      if (sessionStateRef.current === 'active') {
         console.log(`[AblyCLITerminal] Unexpected close (Code: ${event.code}), session ended.`);
         handleSessionEnd(`Connection closed unexpectedly (Code: ${event.code})`); // Use defined handler
      }
    };

    const handleWsError = (event: Event | ErrorEvent) => {
      const reason = event instanceof ErrorEvent ? event.message : 'WebSocket connection error';
      console.error(`[AblyCLITerminal] WebSocket Error: ${reason}`);
       if (sessionStateRef.current === 'connecting') {
          term.current?.writeln(`\r\nConnection failed: ${reason}`);
          handleSessionEnd(`Connection failed: ${reason}`); // Use defined handler
       }
    };

    const handleReconnectAttempt = (attempt: number) => {
      setReconnectAttempt(attempt);
      onConnectionStatusChange?.('connecting');
    };
    
    // Initiate connection
    getGlobalWebsocket(url, {
      onOpen: handleWsOpen,
      onMessage: handleWsMessage,
      onClose: handleWsClose,
      onError: handleWsError,
      onReconnect: handleReconnectAttempt
    });

    // Cleanup function for this effect
    return () => {
      console.log('[AblyCLITerminal] Connection effect cleanup. Current socket state:', socketRef.current?.readyState);
      if (socketRef.current && 
         (socketRef.current.readyState === WebSocket.OPEN || 
          socketRef.current.readyState === WebSocket.CONNECTING)) {
        console.log('[AblyCLITerminal] Closing socket during connection effect cleanup');
        const socketToClose = socketRef.current;
        socketRef.current = null;
        socketToClose.onclose = null;
        socketToClose.onerror = null;
        try {
           socketToClose.close(1000, "Component unmounting or deps changed");
        } catch (e) {
           console.error('[AblyCLITerminal] Error closing socket during cleanup:', e);
        }
      }
    };
  }, [ablyApiKey, ablyAccessToken, websocketUrl, sessionState === 'inactive', handleSessionEnd, onConnectionStatusChange]); // Add handleSessionEnd to deps

  // Ensure terminal is focused when session becomes active
  useEffect(() => {
    if (sessionState === 'active' && term.current) {
      console.log('[AblyCLITerminal] Session active - focusing terminal and triggering initial resize send');
      // Using setTimeout to ensure DOM is ready and FitAddon has likely run
      setTimeout(() => {
        term.current?.focus();
        // Trigger initial resize send after fit
        if (fitAddon.current && term.current) {
           const { cols, rows } = term.current;
           debouncedSendResize(socketRef.current, cols, rows);
        }
      }, 100);
    }
  }, [sessionState]);

  // Add an explicit focus handler
  const handleTerminalClick = useCallback(() => {
    if (term.current && sessionState === 'active') {
      console.log('[AblyCLITerminal] Focus requested by click');
      term.current.focus();
    }
  }, [sessionState]);

  // Render terminal with reconnection indicator
  return (
    <div style={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative' // Needed for absolute positioning of overlays
    }}>
      {/* Container for the terminal mount point */}
      {/* CSS flex ensures this takes available space */}
      {/* CSS padding ensures space around the terminal */}
      <div
        ref={terminalRef}
        style={{
          flex: '1 1 auto',        // Grow/shrink vertically
          height: '100%',          // Needed for flex calculation
          minHeight: 0,            // Fix flex height issues
          padding: '10px',         // Apply padding directly
          boxSizing: 'border-box', // Include padding in width/height
          overflow: 'hidden'       // Hide internal scrollbars if padding causes overflow
        }}
        onClick={handleTerminalClick}
        // The terminal instance is opened inside this div by terminal.open()
      />

      {/* Overlays for status/reconnect/restart */}
      {sessionState === 'connecting' && (
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', zIndex: 10,
            flexDirection: 'column', gap: '10px'
        }}>
          <div>Connecting to Ably CLI...</div>
          {reconnectAttempt > 0 && 
            <div style={{fontSize: '0.9em', opacity: 0.8}}>
                (Attempt {reconnectAttempt}/{globalState.maxAttempts})
            </div>
          }
        </div>
      )}
      {sessionState === 'ended' && (
         <div style={{
             position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
             display: 'flex', alignItems: 'center', justifyContent: 'center',
             backgroundColor: 'rgba(0,0,0,0.8)', color: 'white', zIndex: 10,
             flexDirection: 'column', gap: '15px', padding: '20px', textAlign: 'center'
         }}>
            <div style={{fontSize: '1.2em', color: '#ff6b6b'}}>Session Ended</div>
            <div style={{fontSize: '0.9em', opacity: 0.9}}>{sessionEndReason || 'Connection closed'}</div>
            {renderRestartButton ? renderRestartButton(handleRestart) : (
               <button 
                  onClick={handleRestart} 
                  style={{ 
                    padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', 
                    border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px'
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