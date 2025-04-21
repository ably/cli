import { test } from "@oclif/test";

// This is the absolute minimum test to see if oclif tests work at all
describe('Minimal oclif test', function() {
  // Set very short timeout to fail fast if hanging
  this.timeout(5000);

  // Just try to execute the help command which should be fast and reliable
  it('runs help command', function() {
    // Try to run the simplest possible command
    test
      .stdout()
      .command(['help'])
      .it('should show help', (_ctx) => {
        // Assertion is just that the command executed without error
      });
  });
});
