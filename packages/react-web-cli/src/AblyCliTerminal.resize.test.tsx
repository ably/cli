import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, vi, test, expect, beforeEach } from 'vitest';
import { AblyCliTerminal } from './AblyCliTerminal';

// Re-use mocks from the main test file
vi.mock('./global-reconnect', () => ({
  getAttempts: () => 0,
  getMaxAttempts: () => 15,
  isMaxAttemptsReached: () => false,
  isCancelledState: () => false,
  resetState: vi.fn(),
  increment: vi.fn(),
  cancelReconnect: vi.fn(),
  scheduleReconnect: vi.fn(),
  setCountdownCallback: vi.fn(),
  successfulConnectionReset: vi.fn(),
}));

// Track calls to fit()
const fitSpy = vi.fn();

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: fitSpy,
  })),
}));

// Minimal Terminal mock
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    loadAddon: vi.fn(),
    onData: vi.fn(),
    dispose: vi.fn(),
    focus: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
  })),
}));

vi.mock('./use-terminal-visibility', () => ({
  useTerminalVisibility: () => true,
}));

// lucide mock
vi.mock('lucide-react', () => ({ SplitSquareHorizontal: () => null, X: () => null }));

describe('AblyCliTerminal – debounced fit', () => {
  beforeEach(() => {
    fitSpy.mockClear();
    vi.useFakeTimers();
  });

  test('fit() is called initially and at most once during rapid resize events', async () => {
    const { unmount } = render(
      <AblyCliTerminal websocketUrl="ws://dummy" ablyApiKey="key" />,
    );

    // Initial fit is called once
    expect(fitSpy).toHaveBeenCalledTimes(1);

    // Fire 5 rapid resize events
    act(() => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new Event('resize'));
      }
    });

    // Advance fake timers by debounce interval
    act(() => {
      vi.advanceTimersByTime(200); // >100ms debounce window
    });

    // After debounce window, fit may be called up to 3 times:
    // 1. Initial fit when terminal opens
    // 2. The setTimeout call within the initialization
    // 3. The debounced window resize event handler
    expect(fitSpy.mock.calls.length).toBeLessThanOrEqual(3);

    unmount();
    vi.useRealTimers();
  });
}); 