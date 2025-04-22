/**
 * Test utilities for integration tests
 *
 * This file provides utilities to help with integration testing of the CLI
 */


// Type declaration for global mocks - using any to match global declaration
// but we'll use more specific types in the function implementations
interface AblyRestMock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: () => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channels: { get: () => any };
  close: () => void;
  connection?: { once: (event: string, cb: () => void) => void };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface TestMocks {
  ablyRestMock: AblyRestMock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Define the global variable type
declare global {

  var __TEST_MOCKS__: TestMocks | undefined;
}

/**
 * Returns true if we're running in test mode
 */
export function isTestMode(): boolean {
  return process.env.ABLY_CLI_TEST_MODE === 'true';
}

/**
 * Gets the mock Ably Rest client from the global test mocks
 */
export function getMockAblyRest(): AblyRestMock {
  if (!isTestMode() || !globalThis.__TEST_MOCKS__) {
    throw new Error('Not running in test mode or test mocks not set up');
  }
  return globalThis.__TEST_MOCKS__.ablyRestMock;
}

/**
 * Registers a mock for use in tests
 * @param key The key to register the mock under
 * @param mock The mock object
 */
export function registerMock<T>(key: string, mock: T): void {
  if (!globalThis.__TEST_MOCKS__) {
    globalThis.__TEST_MOCKS__ = {
      ablyRestMock: {
        request: () => ({}),
        channels: { get: () => ({}) },
        close: () => {},
      }
    };
  }
  globalThis.__TEST_MOCKS__[key] = mock;
}

/**
 * Gets a registered mock
 * @param key The key of the mock to get
 */
export function getMock<T>(key: string): T {
  if (!isTestMode() || !globalThis.__TEST_MOCKS__ || !globalThis.__TEST_MOCKS__[key]) {
    throw new Error(`Mock not found for key: ${key}`);
  }
  return globalThis.__TEST_MOCKS__[key] as T;
}
