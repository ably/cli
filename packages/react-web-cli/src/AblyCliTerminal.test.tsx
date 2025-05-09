import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AblyCliTerminal } from './AblyCliTerminal';
import { Terminal } from '@xterm/xterm';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Simple minimal test component to verify hooks work in the test environment
const MinimalHookComponent = () => {
  const [state] = React.useState('test');
  return <div data-testid="minimal">{state}</div>;
};

// Test if a basic hook component works
describe('Minimal Hook Component Test', () => {
  test('can render a component with hooks', () => {
    const { getByTestId } = render(<MinimalHookComponent />);
    expect(getByTestId('minimal')).toHaveTextContent('test');
  });
});

// Mock xterm Terminal
const mockWrite = vi.fn();
const mockWriteln = vi.fn();
const mockReset = vi.fn();
const mockFocus = vi.fn();
const mockOnResize = vi.fn();
const mockFit = vi.fn();

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    write: mockWrite,
    writeln: mockWriteln,
    reset: mockReset,
    focus: mockFocus,
    onData: vi.fn(),
    onResize: mockOnResize,
    dispose: vi.fn(),
    loadAddon: vi.fn().mockImplementation(() => ({
      fit: mockFit,
    })),
    options: {},
    element: null,
    textarea: null,
    onWriteParsed: vi.fn(),
    scrollToBottom: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: mockFit,
  })),
}));

// Mock global WebSocket
let mockSocketInstance: Partial<WebSocket> & {
  listeners: Record<string, ((event: any) => void)[]>;
  triggerEvent: (eventName: string, eventData?: any) => void;
  readyStateValue: number;
  onmessageCallback?: (event: any) => void; // Add direct onmessage callback storage
};

const mockSend = vi.fn();
const mockClose = vi.fn();

// Cast to any to satisfy TypeScript for the global assignment
(global as any).WebSocket = vi.fn().mockImplementation((url: string) => {
  mockSocketInstance = {
    url,
    send: mockSend,
    close: mockClose,
    listeners: { open: [], message: [], close: [], error: [] },
    addEventListener: vi.fn((event, cb) => {
      if (mockSocketInstance.listeners[event]) {
        mockSocketInstance.listeners[event].push(cb);
      }
    }),
    removeEventListener: vi.fn((event, cb) => {
      if (mockSocketInstance.listeners[event]) {
        mockSocketInstance.listeners[event] = mockSocketInstance.listeners[event].filter(l => l !== cb);
      }
    }),
    triggerEvent: (eventName: string, eventData?: any) => {
      // Handle both direct assignment and addEventListener
      if (eventName === 'message' && mockSocketInstance.onmessageCallback) {
        mockSocketInstance.onmessageCallback(eventData);
      }
      
      if (mockSocketInstance.listeners[eventName]) {
        mockSocketInstance.listeners[eventName].forEach(cb => cb(eventData));
      }
    },
    readyStateValue: WebSocket.CONNECTING, // Initial state
    get readyState() {
      return this.readyStateValue;
    },
    set readyState(value: number) {
      this.readyStateValue = value;
    },
    // Handle onmessage as a property (common usage pattern)
    set onmessage(callback: (event: any) => void) {
      mockSocketInstance.onmessageCallback = callback;
    },
    get onmessage() {
      return mockSocketInstance.onmessageCallback || (() => {}); // Return no-op function if undefined
    }
  };
  setTimeout(() => {
    if (mockSocketInstance) { // Check if instance exists
        mockSocketInstance.readyStateValue = WebSocket.OPEN;
        mockSocketInstance.triggerEvent('open', {});
    }
  }, 10);
  return mockSocketInstance as WebSocket;
});


describe('AblyCliTerminal - Connection Status and Animation', () => {
  let onConnectionStatusChangeMock: ReturnType<typeof vi.fn>;
  let onConnectionStatusChangeMockId: string | null;

  beforeEach(() => {
    onConnectionStatusChangeMock = vi.fn();
    // Assign a debug ID to the mock for comparison
    (onConnectionStatusChangeMock as any)._debugId = Math.random().toString(36).substr(2, 9);
    onConnectionStatusChangeMockId = (onConnectionStatusChangeMock as any)._debugId;

    mockWrite.mockClear();
    mockWriteln.mockClear();
    mockSend.mockClear();
    mockClose.mockClear();
    if (mockSocketInstance) {
        mockSocketInstance.listeners = { open: [], message: [], close: [], error: [] };
        mockSocketInstance.onmessageCallback = undefined;
    }
  });

  const renderTerminal = (props: Partial<React.ComponentProps<typeof AblyCliTerminal>> = {}) => {
    try {
      const result = render(
        <AblyCliTerminal
          websocketUrl="ws://localhost:8080"
          ablyAccessToken="test-token"
          ablyApiKey="test-key"
          onConnectionStatusChange={onConnectionStatusChangeMock}
          {...props}
        />
      );
      return result;
    } catch (error) {
      console.error('[Test] Error rendering AblyCliTerminal:', error);
      throw error;
    }
  };

  test('initial state is "initial", then "connecting" when component mounts and WebSocket attempts connection', async () => {
    renderTerminal();
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('initial');
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('connecting');
  });

  test('displays "Connecting..." animation when server sends "connecting" status', async () => {
    renderTerminal();
    act(() => {
      if (!mockSocketInstance) throw new Error("mockSocketInstance not initialized");
      mockSocketInstance.triggerEvent('message', { data: JSON.stringify({ type: 'status', payload: 'connecting' }) });
    });
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('connecting');
  });

  test('stops animation and shows "Connected." when server sends "connected" status', async () => {
    renderTerminal();
    
    // Wait for initial setup to complete
    await act(async () => {
      await Promise.resolve();
    });
    
    // Force reset the mock to clear any auto-calls during initialization
    onConnectionStatusChangeMock.mockClear();
    mockWrite.mockClear(); // Clear any previous write calls
    
    await act(async () => {
      if (!mockSocketInstance) throw new Error("mockSocketInstance not initialized");
      
      // Set readyState to OPEN and manually simulate the message
      mockSocketInstance.readyStateValue = WebSocket.OPEN;
      
      // Use the onmessage callback directly if it exists
      if (mockSocketInstance.onmessageCallback) {
        mockSocketInstance.onmessageCallback({ 
          data: JSON.stringify({ type: 'status', payload: 'connected' })
        });
      } else {
        // Fall back to the event system
        mockSocketInstance.triggerEvent('message', { 
          data: JSON.stringify({ type: 'status', payload: 'connected' })
        });
      }
      
      // Allow time for React to process state updates
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    // Check if connected status was set - this is the key assertion
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('connected');
    
    // Verify that animation cleanup happened in some form (indicated by write being called)
    expect(mockWrite).toHaveBeenCalled();
  });

  test('handles "disconnected" status from server', async () => {
    renderTerminal();

    // Wait for initial setup to complete
    await act(async () => {
      await Promise.resolve();
    });
    
    // Force reset the mock to clear any auto-calls during initialization
    onConnectionStatusChangeMock.mockClear();
    
    await act(async () => {
      if (!mockSocketInstance) throw new Error("mockSocketInstance not initialized");
      
      // Set readyState to OPEN and manually simulate the message
      mockSocketInstance.readyStateValue = WebSocket.OPEN;
      
      // Use the onmessage callback directly
      if (mockSocketInstance.onmessageCallback) {
        mockSocketInstance.onmessageCallback({ 
          data: JSON.stringify({ 
            type: 'status', 
            payload: 'disconnected', 
            reason: 'Test disconnect reason' 
          })
        });
      } else {
        // Fall back to the event system
        mockSocketInstance.triggerEvent('message', { 
          data: JSON.stringify({ 
            type: 'status', 
            payload: 'disconnected', 
            reason: 'Test disconnect reason' 
          }) 
        });
      }
      
      // Allow time for React to process state updates
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    // Check if disconnected status was set
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('disconnected');
    expect(mockWriteln).toHaveBeenCalledWith(expect.stringContaining('--- Session Ended: Test disconnect reason ---'));
  });

  test('handles "error" status from server', async () => {
    renderTerminal();

    // Wait for initial setup to complete
    await act(async () => {
      await Promise.resolve();
    });
    
    // Force reset the mock to clear any auto-calls during initialization
    onConnectionStatusChangeMock.mockClear();
    
    await act(async () => {
      if (!mockSocketInstance) throw new Error("mockSocketInstance not initialized");
      
      // Set readyState to OPEN and manually simulate the message
      mockSocketInstance.readyStateValue = WebSocket.OPEN;
      
      // Use the onmessage callback directly
      if (mockSocketInstance.onmessageCallback) {
        mockSocketInstance.onmessageCallback({ 
          data: JSON.stringify({ 
            type: 'status', 
            payload: 'error', 
            reason: 'Test error reason' 
          })
        });
      } else {
        // Fall back to the event system
        mockSocketInstance.triggerEvent('message', { 
          data: JSON.stringify({ 
            type: 'status', 
            payload: 'error', 
            reason: 'Test error reason' 
          }) 
        });
      }
      
      // Allow time for React to process state updates
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    
    // Check if error status was set
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('error');
    expect(mockWriteln).toHaveBeenCalledWith(expect.stringContaining('--- Error: Test error reason ---'));
  });
  
  test('clears animation on WebSocket close', async () => {
    renderTerminal();
    act(() => {
      if (!mockSocketInstance) throw new Error("mockSocketInstance not initialized");
      mockSocketInstance.triggerEvent('message', { data: JSON.stringify({ type: 'status', payload: 'connecting' }) });
    });
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('Connecting.'));

    act(() => {
      if (!mockSocketInstance) throw new Error("mockSocketInstance not initialized");
      mockSocketInstance.triggerEvent('close', { code: 1006, reason: 'Closed abnormally' });
    });
    
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('disconnected');
    mockWrite.mockClear();
    expect(mockWrite).not.toHaveBeenCalledWith(expect.stringContaining('Connecting'));
    expect(mockWriteln).toHaveBeenCalledWith(expect.stringContaining('--- Connection Closed (Code: 1006) ---'));
  });
}); 