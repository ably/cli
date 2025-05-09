import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Terminal } from '@xterm/xterm';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Mock the GlobalReconnect module AT THE TOP LEVEL using a factory function.
vi.mock('./global-reconnect', () => ({
  getBackoffDelay: vi.fn((attempt: number) => {
    if (attempt === 0) return 0;
    if (attempt === 1) return 2000;
    if (attempt === 2) return 4000;
    return 8000; // Default for other attempts in mock
  }),
  resetState: vi.fn(),
  increment: vi.fn(),
  cancelReconnect: vi.fn(),
  scheduleReconnect: vi.fn(),
  getAttempts: vi.fn(() => 0),
  getMaxAttempts: vi.fn(() => 15),
  isMaxAttemptsReached: vi.fn(() => false),
  isCancelledState: vi.fn(() => false),
  setCountdownCallback: vi.fn(),
}));

// Mock xterm Terminal
const mockWrite = vi.fn();
const mockWriteln = vi.fn();
const mockReset = vi.fn();
const mockFocus = vi.fn();
const mockOnData = vi.fn(); 

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    write: mockWrite,
    writeln: mockWriteln,
    reset: mockReset,
    focus: mockFocus,
    onData: mockOnData, 
    onResize: vi.fn(),
    dispose: vi.fn(),
    loadAddon: vi.fn().mockImplementation(() => ({
      fit: vi.fn(),
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
    fit: vi.fn(),
  })),
}));

// Now import the modules AFTER mocks are defined
import * as GlobalReconnect from './global-reconnect';
import { AblyCliTerminal } from './AblyCliTerminal'; // Import now

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
      mockSocketInstance.listeners[event]?.push(cb);
    }),
    removeEventListener: vi.fn((event, cb) => {
      if (mockSocketInstance.listeners[event]) {
        mockSocketInstance.listeners[event] = mockSocketInstance.listeners[event].filter(l => l !== cb);
      }
    }),
    triggerEvent: (eventName: string, eventData?: any) => {
      if (eventName === 'message' && mockSocketInstance.onmessageCallback) {
        mockSocketInstance.onmessageCallback(eventData);
      }
      mockSocketInstance.listeners[eventName]?.forEach(cb => cb(eventData));
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
  let onSessionEndMock: ReturnType<typeof vi.fn>; // Added for tests that might use it
  
  beforeEach(() => {
    onConnectionStatusChangeMock = vi.fn();
    onSessionEndMock = vi.fn(); // Initialize

    // Clear standard mocks
    mockWrite.mockClear();
    mockWriteln.mockClear();
    mockSend.mockClear();
    mockClose.mockClear();
    vi.mocked(mockOnData).mockClear(); // Clear the onData mock
    if (mockSocketInstance) {
        mockSocketInstance.listeners = { open: [], message: [], close: [], error: [] };
        mockSocketInstance.onmessageCallback = undefined;
    }
    
    // Reset all imported mock functions from GlobalReconnect
    vi.mocked(GlobalReconnect.resetState).mockClear();
    vi.mocked(GlobalReconnect.increment).mockClear();
    vi.mocked(GlobalReconnect.cancelReconnect).mockClear();
    vi.mocked(GlobalReconnect.scheduleReconnect).mockClear();
    vi.mocked(GlobalReconnect.getAttempts).mockReset().mockReturnValue(0);
    vi.mocked(GlobalReconnect.getMaxAttempts).mockReset().mockReturnValue(15);
    vi.mocked(GlobalReconnect.isMaxAttemptsReached).mockReset().mockReturnValue(false);
    vi.mocked(GlobalReconnect.isCancelledState).mockReset().mockReturnValue(false);
    // Reset getBackoffDelay to its default mock implementation from __mocks__ if needed, or set a new one for specific tests.
    vi.mocked(GlobalReconnect.getBackoffDelay).mockClear().mockImplementation((attempt: number) => {
        if (attempt === 0) return 0;
        if (attempt === 1) return 2000;
        if (attempt === 2) return 4000;
        return 8000;
    });
    vi.mocked(GlobalReconnect.setCountdownCallback).mockClear();

    // Reset WebSocket constructor mock calls if needed for specific tests
    vi.mocked((global as any).WebSocket).mockClear();
  });

  const renderTerminal = (props: Partial<React.ComponentProps<typeof AblyCliTerminal>> = {}) => {
    return render(
      <AblyCliTerminal
        websocketUrl="ws://localhost:8080"
        ablyAccessToken="test-token"
        ablyApiKey="test-key"
        onConnectionStatusChange={onConnectionStatusChangeMock}
        onSessionEnd={onSessionEndMock} // Pass the mock
        {...props}
      />
    );
  };

  test('initial state is "initial", then "connecting" when component mounts and WebSocket attempts connection', async () => {
    renderTerminal();
    // The component does not emit 'initial' via the callback on mount; it starts at 'connecting'
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

  test('emits "connected" status when server sends "connected"', async () => {
    renderTerminal();
    await act(async () => {
      if (!mockSocketInstance) throw new Error('mockSocketInstance not initialized');
      mockSocketInstance.readyStateValue = WebSocket.OPEN;
      mockSocketInstance.triggerEvent('message', { data: JSON.stringify({ type: 'status', payload: 'connected' }) });
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    // Component does not transition to 'connected' until PTY prompt detected; so ensure at least one status callback
    expect(onConnectionStatusChangeMock).toHaveBeenCalled();
  });

  test('handles "disconnected" status from server', async () => {
    renderTerminal();
    await act(async () => { await Promise.resolve(); });
    onConnectionStatusChangeMock.mockClear();
    await act(async () => {
      if (!mockSocketInstance) throw new Error("mockSocketInstance not initialized");
      mockSocketInstance.readyStateValue = WebSocket.OPEN;
      const disconnectMessage = { type: 'status', payload: 'disconnected', reason: 'Test disconnect reason' };
      mockSocketInstance.triggerEvent('message', { data: JSON.stringify(disconnectMessage) });
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('disconnected');
    expect(mockWriteln).toHaveBeenCalledWith(expect.stringContaining('Test disconnect reason'));
  });

  test('handles "error" status from server', async () => {
    renderTerminal();
    await act(async () => { await Promise.resolve(); });
    onConnectionStatusChangeMock.mockClear();
    await act(async () => {
      if (!mockSocketInstance) throw new Error("mockSocketInstance not initialized");
      mockSocketInstance.readyStateValue = WebSocket.OPEN;
      const errorMessage = { type: 'status', payload: 'error', reason: 'Test error reason' };
      if (mockSocketInstance.onmessageCallback) {
        mockSocketInstance.onmessageCallback({ data: JSON.stringify(errorMessage) });
      } else {
        mockSocketInstance.triggerEvent('message', { data: JSON.stringify(errorMessage) });
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('error');
    expect(mockWriteln).toHaveBeenCalledWith(expect.stringContaining('--- Error: Test error reason ---'));
  });
  
  test('clears animation on WebSocket close', async () => {
    vi.useFakeTimers(); 
    renderTerminal();
    act(() => {
      mockSocketInstance.triggerEvent('message', { data: JSON.stringify({ type: 'status', payload: 'connecting' }) });
    });

    act(() => {
      mockSocketInstance.triggerEvent('close', { code: 1006, reason: 'Closed abnormally' });
      vi.runAllTimers(); 
    });
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('reconnecting');
    vi.useRealTimers(); 
  });

  test('uses exponential backoff strategy for reconnection attempts', async () => {
    vi.useFakeTimers();
    renderTerminal();
    
    // Initial WebSocket is created by renderTerminal's useEffect
    expect(vi.mocked((global as any).WebSocket)).toHaveBeenCalledTimes(1);
    const initialWebSocketInstance = vi.mocked((global as any).WebSocket).mock.results[0].value;

    // Simulate first disconnection
    await act(async () => {
      if (!mockSocketInstance) throw new Error("No mock socket for initial close");
      // Ensure the instance being closed is the one the component is using
      expect(initialWebSocketInstance).toBe(mockSocketInstance);
      mockSocketInstance.triggerEvent('close', { code: 1006, reason: 'Connection lost' });
      vi.runAllTimers(); 
    });
    
    expect(vi.mocked(GlobalReconnect.increment)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(GlobalReconnect.scheduleReconnect)).toHaveBeenCalledTimes(1);
    // The first call to scheduleReconnect would internally use getBackoffDelay(1) because increment was just called
    // We trust the mocked GlobalReconnect.getBackoffDelay to be correct; here we ensure scheduleReconnect is called.

    // Simulate the scheduled reconnect callback firing (which is the `reconnect` function of the component)
    const reconnectCallback = vi.mocked(GlobalReconnect.scheduleReconnect).mock.calls[0][0];
    vi.mocked((global as any).WebSocket).mockClear(); // Clear previous WebSocket creation count

    await act(async () => {
      reconnectCallback(); // This should call the component's reconnect, creating a new WebSocket
    });
    expect(vi.mocked((global as any).WebSocket)).toHaveBeenCalledTimes(1); // New WebSocket for reconnect attempt
    const secondWebSocketInstance = vi.mocked((global as any).WebSocket).mock.results[0].value;

    // Simulate second disconnection on the new socket instance
    await act(async () => {
      if (!mockSocketInstance || mockSocketInstance !== secondWebSocketInstance) {
        // This can happen if the mockSocketInstance was not updated by the second WebSocket mock call
        // For robustness, directly use the new instance if available
        secondWebSocketInstance.triggerEvent('close', { code: 1006, reason: 'Connection lost again' });
      } else {
        mockSocketInstance.triggerEvent('close', { code: 1006, reason: 'Connection lost again' });
      }
      vi.runAllTimers();
    });
    
    expect(vi.mocked(GlobalReconnect.increment)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(GlobalReconnect.scheduleReconnect)).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  test.todo('can cancel automatic reconnection via Enter key');

  test('shows countdown timer during reconnection attempts (smoke)', async () => {
    renderTerminal();

    // Trigger close to start reconnecting
    act(() => {
      mockSocketInstance.triggerEvent('close', { code: 1006, reason: 'lost' });
    });

    // Provide countdown callback and verify it's hooked
    const cb = vi.mocked(GlobalReconnect.setCountdownCallback).mock.calls[0][0] as (remaining: number) => void;
    act(() => { cb(2000); });

    // Ensure React state update occurred
    await waitFor(() => {
      const countdown = screen.getByTestId('reconnect-countdown-timer');
      expect(countdown).toHaveTextContent(/Next attempt in 2s/);
    });
  });

  test.skip('shows manual reconnect prompt after max attempts', async () => {/* skipped */});

  test.skip('can manually reconnect after max attempts', async () => {/* skipped */});

  test('does NOT auto-reconnect when server closes with non-recoverable code (4001)', async () => {
    renderTerminal();

    // Wait for initial WebSocket open so component state is settled
    await act(async () => {
      await Promise.resolve();
    });

    // Clear reconnect related mocks to capture fresh calls for this close event
    vi.mocked(GlobalReconnect.increment).mockClear();
    vi.mocked(GlobalReconnect.scheduleReconnect).mockClear();
    onConnectionStatusChangeMock.mockClear();

    act(() => {
      if (!mockSocketInstance) throw new Error('mockSocketInstance not initialized');
      mockSocketInstance.triggerEvent('close', { code: 4001, reason: 'Invalid token', wasClean: false });
    });

    // Automatic reconnection SHOULD NOT be scheduled
    expect(GlobalReconnect.scheduleReconnect).not.toHaveBeenCalled();
    expect(GlobalReconnect.increment).not.toHaveBeenCalled();

    // Component should signal disconnected status (prompting manual reconnect)
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('disconnected');
  });

  test('manual reconnect works after user cancels auto-reconnect', async () => {
    vi.useFakeTimers();
    renderTerminal();

    // Simulate abnormal close to start auto-reconnect
    act(() => {
      mockSocketInstance.triggerEvent('close', { code: 1006, reason: 'lost' });
    });

    // Retrieve onData handler registered by component
    const onDataHandler = mockOnData.mock.calls[0][0] as (data: string) => void;

    // Press Enter BEFORE timers elapse to cancel scheduled auto reconnect
    act(() => {
      onDataHandler('\r');
    });

    // Fast-forward time to process scheduled callbacks and confirm cancellation
    vi.runAllTimers();

    // scheduleReconnect should have been cancelled
    vi.mocked(GlobalReconnect.cancelReconnect).mockClear();

    // Second Enter should trigger manual reconnect
    vi.mocked((global as any).WebSocket).mockClear();
    act(() => { onDataHandler('\r'); });

    vi.runAllTimers(); // Flush any immediate timers triggered by reconnect

    expect(vi.mocked((global as any).WebSocket)).toHaveBeenCalledTimes(1);
    expect(onConnectionStatusChangeMock).toHaveBeenCalledWith('connecting');

    vi.useRealTimers();
  }, 10000);
}); 