import { globalCleanup } from './setup.js';
import { getTrackedRunners, clearTrackingForTest } from './helpers/cli-runner-store.js';

export const mochaHooks = {
  beforeEach() {
    // Make current test available globally for CLI runner tracking
    (globalThis as Record<string, unknown>).currentTest = this.currentTest;
  },

  afterEach() {
    const test = this.currentTest;
    if (!test) return;

    // If the test failed, show CLI output for debugging
    if (test.state === 'failed') {
      const runners = getTrackedRunners(test);
      if (runners.length > 0) {
        console.log('\n=== E2E TEST FAILURE DEBUG ===');
        console.log(`Test: ${test.fullTitle()}`);
        console.log(`Error: ${test.err?.message || 'Unknown error'}`);
        console.log('');

        runners.forEach((runner, index) => {
          const label = runners.length > 1 ? ` [${index + 1}/${runners.length}]` : '';
          console.log(`--- CLI Command${label}: ${runner.getCommand()} ---`);
          
          const stdout = runner.stdout();
          const stderr = runner.stderr();
          
          if (stdout.trim()) {
            console.log('STDOUT:');
            console.log(stdout);
          }
          
          if (stderr.trim()) {
            console.log('STDERR:');
            console.log(stderr);
          }
          
          if (!stdout.trim() && !stderr.trim()) {
            console.log('(No output captured)');
          }
          
          console.log(`Exit Code: ${runner.exitCode()}`);
          console.log('');
        });
        
        console.log('=== END E2E TEST FAILURE DEBUG ===\n');
      }
    }

    // Clean up tracking for this test
    clearTrackingForTest(test);
    
    // Clear global test reference
    (globalThis as Record<string, unknown>).currentTest = null;
  },

  async afterAll() {
    // The root hook runs outside the context where this.timeout() is valid.
    // Rely on the overall test timeout or potentially adjust the runner script's timeout if needed.
    console.log('Running global cleanup in root hook (afterAll)...');
    await globalCleanup();
    console.log('Global cleanup finished in root hook (afterAll).');
  }
};
