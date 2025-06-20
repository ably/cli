/**
 * Global type declarations for Web CLI E2E tests
 */

// Define the structure of the terminal React state
interface AblyCliTerminalReactState {
  componentConnectionStatus: 'connected' | 'connecting' | 'disconnected' | 'unknown';
  isSessionActive: boolean;
}

// Extend Window interface with custom properties
declare global {
  interface Window {
    ablyCliSocket?: WebSocket;
    getAblyCliTerminalReactState?: () => AblyCliTerminalReactState | undefined;
    _sessionId?: string;
  }
}

// Make this a module
export {};