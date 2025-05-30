/**
 * Test utilities for integration tests
 *
 * This file provides utilities to help with integration testing of the CLI
 */

/**
 * Returns true if we're running in test mode
 */
export function isTestMode(): boolean {
  return process.env.ABLY_CLI_TEST_MODE === 'true';
}

/**
 * Gets the mock Ably Rest client from the global test mocks
 */
export function getMockAblyRest(): any {
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
    // Provide a more structured default mock
    globalThis.__TEST_MOCKS__ = {
      ablyRestMock: {
        // Default successful empty list response for Control API usually
        request: () => Promise.resolve({ statusCode: 200, items: [], headers: new Map(), status: 200 }),
        channels: {
          // Fix: make channels.get compatible with expected signature  
          get: () => ({
            name: "mock-channel",
            publish: async () => ({}), // Mock publish
            subscribe: () => {},      // Mock subscribe
            presence: {              // Mock presence
              get: async () => ([]),
              subscribe: () => {},
              enter: async () => ({}),
              leave: async () => ({}),
            },
            history: async () => ({ items: [] }), // Mock history
            attach: async () => ({}),
            detach: async () => ({}),
          }),
        },
        auth: { // Add required auth object
          clientId: "mock-clientId",
          requestToken: async () => ({ token: "mock-token" }),
          createTokenRequest: async () => ({ keyName: "mock-keyName" }),
        },
        options: { // Add required options object
          key: "mock-app.key:secret",
          clientId: "mock-clientId",
        },
        close: () => {},
        connection: { // Fix: make connection compatible with base expectations
          once: (event: string, cb: () => void) => { if (event === 'connected') setTimeout(cb, 0); }
        }
      }
    };
  }
  // Fix: Add null check before assignment
  if (globalThis.__TEST_MOCKS__) {
    globalThis.__TEST_MOCKS__[key] = mock;
  }
}

/**
 * Gets a registered mock
 * @param key The key of the mock to get
 */
export function getMock<T>(key: string): T {
  // Check for test mode first
  if (!isTestMode()) {
    throw new Error('Attempted to get mock outside of test mode');
  }
  // Fix: Add proper null checking for globalThis.__TEST_MOCKS__
  if (!globalThis.__TEST_MOCKS__ || !(key in globalThis.__TEST_MOCKS__)) {
    throw new Error(`Mock not found for key: ${key}`);
  }
  // Safe to access now after null check
  const mock = globalThis.__TEST_MOCKS__[key];
  if (!mock) {
    throw new Error(`Mock value is null or undefined for key: ${key}`);
  }
  return mock as T;
}
