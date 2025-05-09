// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock ResizeObserver for JSDOM environment
globalThis.ResizeObserver = class ResizeObserver {
  observe() {
    // Implementation does nothing
  }
  unobserve() {
    // Implementation does nothing
  }
  disconnect() {
    // Implementation does nothing
  }
}; 