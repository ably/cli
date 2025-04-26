import { globalCleanup } from './setup.js';

export const mochaHooks = {
  async afterAll() {
    // The root hook runs outside the context where this.timeout() is valid.
    // Rely on the overall test timeout or potentially adjust the runner script's timeout if needed.
    console.log('Running global cleanup in root hook (afterAll)...');
    await globalCleanup();
    console.log('Global cleanup finished in root hook (afterAll).');
  }
};
