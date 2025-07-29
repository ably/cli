/**
 * Shared terminal functionality for primary and secondary terminals
 * This module contains common logic to ensure consistency between terminals
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

// Constants
export const MAX_PTY_BUFFER_LENGTH = 10000;
export const CONTROL_MESSAGE_PREFIX = '\u0000\u0000ABLY_CTRL:';
export const TERMINAL_PROMPT_PATTERN = /\$\s$/;
export const MAX_HANDSHAKE_BUFFER_LENGTH = 200;

// Docker handshake pattern - matches the server-side regex
const DOCKER_HANDSHAKE_REGEX = /\{[^}]*stream[^}]*stdin[^}]*stdout[^}]*stderr[^}]*hijack[^}]*\}/;

/**
 * Shared state for handshake filtering
 */
export interface HandshakeFilterState {
  handshakeHandled: boolean;
  handshakeBuffer: string;
}

/**
 * Creates a new handshake filter state
 */
export function createHandshakeFilterState(): HandshakeFilterState {
  return {
    handshakeHandled: false,
    handshakeBuffer: ''
  };
}

/**
 * Filters Docker handshake JSON from incoming data stream
 * This handles both complete and fragmented JSON across multiple WebSocket frames
 * 
 * @param data - The incoming data string
 * @param filterState - The current filter state
 * @returns The filtered data string (with handshake removed if found)
 */
export function filterDockerHandshake(
  data: string, 
  filterState: HandshakeFilterState
): string {
  // Fast path: if handshake already handled, return data as-is
  if (filterState.handshakeHandled) {
    return data;
  }

  // IMPORTANT: Check if this is a text-based control message that should bypass filtering
  // This handles cases where control messages arrive as text (e.g., through proxies)
  if (data.includes('ABLY_CTRL:')) {
    // Don't buffer control messages - pass them through immediately
    filterState.handshakeHandled = true;
    const bufferedData = filterState.handshakeBuffer;
    filterState.handshakeBuffer = '';
    // Return any buffered data plus the control message
    return bufferedData + data;
  }

  // Accumulate data in buffer
  filterState.handshakeBuffer += data;

  // Check if we have a complete handshake JSON
  const match = filterState.handshakeBuffer.match(DOCKER_HANDSHAKE_REGEX);

  if (match) {
    // Found complete handshake - mark as handled
    filterState.handshakeHandled = true;
    
    // Extract the parts before and after the handshake
    const before = filterState.handshakeBuffer.slice(0, match.index);
    const after = filterState.handshakeBuffer.slice(match.index! + match[0].length);
    
    // Clear the buffer
    filterState.handshakeBuffer = '';
    
    // Return combined data without the handshake
    return before + after;
  } else if (filterState.handshakeBuffer.length > MAX_HANDSHAKE_BUFFER_LENGTH) {
    // Safety valve: if we've accumulated too much data without finding handshake,
    // assume there isn't one and flush the buffer
    filterState.handshakeHandled = true;
    const bufferedData = filterState.handshakeBuffer;
    filterState.handshakeBuffer = '';
    return bufferedData;
  }

  // Still accumulating - don't output anything yet
  return '';
}

/**
 * Checks if a string contains Docker handshake markers (legacy function for compatibility)
 * Note: This only works for complete chunks and is kept for backward compatibility
 */
export function isHijackMetaChunk(txt: string): boolean {
  return /"stream"\s*:\s*true/.test(txt) || /"hijack"\s*:\s*true/.test(txt);
}

/**
 * Terminal configuration shared between primary and secondary terminals
 */
export const SHARED_TERMINAL_CONFIG = {
  cursorBlink: true,
  cursorStyle: 'block' as const,
  fontFamily: 'monospace',
  fontSize: 14,
  theme: {
    background: '#000000',
    foreground: '#abb2bf',
    cursor: '#528bff',
    selectionBackground: '#3e4451',
    selectionForeground: '#ffffff'
  },
  convertEol: true,
};

/**
 * Creates and configures a new terminal instance with shared settings
 */
export function createTerminal(): Terminal {
  return new Terminal(SHARED_TERMINAL_CONFIG);
}

/**
 * Creates and configures a FitAddon for terminal resizing
 */
export function createFitAddon(): FitAddon {
  return new FitAddon();
}

/**
 * Safely attempts to fit the terminal to its container
 */
export function safeFit(fitAddon: FitAddon | null, terminalName: string = 'terminal'): void {
  if (!fitAddon) return;
  
  try {
    fitAddon.fit();
  } catch (error) {
    console.warn(`[${terminalName}] Error during fit:`, error);
  }
}

/**
 * WebSocket authentication payload
 */
export interface AuthPayload {
  apiKey?: string;
  accessToken?: string;
  sessionId?: string | null;
  environmentVariables?: Record<string, string>;
  ciAuthToken?: string;
}

/**
 * Creates authentication payload for WebSocket connection
 */
export function createAuthPayload(
  apiKey?: string,
  accessToken?: string,
  sessionId?: string | null,
  additionalEnvVars?: Record<string, string>
): AuthPayload {
  const payload: AuthPayload = {
    environmentVariables: {
      ABLY_WEB_CLI_MODE: 'true',
      PS1: '$ ',
      ...additionalEnvVars
    }
  };

  if (apiKey) payload.apiKey = apiKey;
  if (accessToken) payload.accessToken = accessToken;
  if (sessionId) payload.sessionId = sessionId;

  // Check for CI auth token in window object
  // This will be injected during test execution
  const win = globalThis as any;
  if (win.__ABLY_CLI_CI_AUTH_TOKEN__) {
    payload.ciAuthToken = win.__ABLY_CLI_CI_AUTH_TOKEN__;
    // Debug logging in CI
    if (win.__ABLY_CLI_CI_MODE__ === 'true') {
      console.log('[CI Auth] Including CI auth token in payload', {
        tokenLength: payload.ciAuthToken.length,
        testGroup: win.__ABLY_CLI_TEST_GROUP__ || 'unknown',
        runId: win.__ABLY_CLI_RUN_ID__ || 'unknown'
      });
    }
  } else if (win.__ABLY_CLI_CI_MODE__ === 'true') {
    console.warn('[CI Auth] CI mode enabled but no auth token found in window object!');
  }

  return payload;
}

/**
 * Parses control messages from WebSocket data
 */
export function parseControlMessage(data: Uint8Array): any | null {
  const prefixBytes = new TextEncoder().encode(CONTROL_MESSAGE_PREFIX);
  
  // Check if this is a control message
  if (data.length < prefixBytes.length) return null;
  
  for (let i = 0; i < prefixBytes.length; i++) {
    if (data[i] !== prefixBytes[i]) return null;
  }
  
  // Extract and parse JSON
  try {
    const jsonBytes = data.slice(prefixBytes.length);
    const jsonStr = new TextDecoder().decode(jsonBytes);
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Failed to parse control message:', error);
    return null;
  }
}

/**
 * Converts various WebSocket message data types to Uint8Array
 */
export async function messageDataToUint8Array(data: any): Promise<Uint8Array> {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  } else if (data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } else if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  } else {
    // Assume it's already a Uint8Array or similar
    return new Uint8Array(data);
  }
}

/**
 * Clears the "Connecting..." message from terminal
 */
export function clearConnectingMessage(term: Terminal): void {
  const termAny = term as any;
  if (termAny._connectingLine !== undefined) {
    try {
      const currentY = term.buffer?.active?.cursorY ?? 0;
      const currentX = term.buffer?.active?.cursorX ?? 0;
      const connectingLine = termAny._connectingLine;
      const bufferLength = term.buffer?.active?.length ?? 0;
      const baseY = term.buffer?.active?.baseY ?? 0;
      const viewportY = term.buffer?.active?.viewportY ?? 0;
      
      // Move to the connecting line and clear it
      term.write(`\u001B[${connectingLine + 1};1H`); // Move to line
      term.write('\u001B[2K'); // Clear entire line
      
      // Move cursor back to previous position
      term.write(`\u001B[${currentY + 1};${currentX + 1}H`);
      
      delete termAny._connectingLine;
      delete termAny._connectingMessageLength;
    } catch (error) {
      console.warn('Could not clear connecting message:', error);
    }
  }
}

/**
 * Shows a message and stores line position for later clearing
 */
export function showConnectingMessage(term: Terminal, message: string = 'Connecting to Ably CLI server...'): void {
  try {
    const cursorY = term.buffer?.active?.cursorY ?? 0;
    const cursorX = term.buffer?.active?.cursorX ?? 0;
    const bufferLength = term.buffer?.active?.length ?? 0;
    const baseY = term.buffer?.active?.baseY ?? 0;
    const viewportY = term.buffer?.active?.viewportY ?? 0;
    
    term.writeln(message);
    
    // Store line number for later clearing
    (term as any)._connectingLine = cursorY;
    (term as any)._connectingMessageLength = message.length;
  } catch (error) {
    console.error(`[showConnectingMessage] Error:`, error);
    // If buffer is not ready, just write without tracking line number
    term.writeln(message);
  }
}

/**
 * Debug logging helper
 */
export function debugLog(...args: unknown[]): void {
  if (typeof globalThis !== 'undefined' && (globalThis as any).ABLY_CLI_DEBUG) {
    console.log('[AblyCLITerminal DEBUG]', ...args);
  }
}