import { expect } from "@oclif/test";
import {
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  createTempOutputFile,
  runLongRunningBackgroundProcess,
  runBackgroundProcessAndGetOutput,
  killProcess,
  skipTestsIfNeeded,
  applyE2ETestSetup
} from "../../helpers/e2e-test-helper.js";
import { ChildProcess } from "node:child_process";

// Skip tests if API key not available
skipTestsIfNeeded('Channel Occupancy E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (SHOULD_SKIP_E2E) {
  describe('Channel Occupancy E2E Tests (Skipped)', function() {
    it('should be skipped when E2E_ABLY_API_KEY is not set', function() {
      console.log('Skipping Channel Occupancy E2E Tests - E2E_ABLY_API_KEY not configured');
      this.skip();
    });
  });
} else {
  describe('Channel Occupancy E2E Tests', function() {
    // Apply standard E2E setup via a before hook
    before(function() {
      applyE2ETestSetup();
    });

    // Set timeout for E2E tests - increased for CI environments
    this.timeout(process.env.CI ? 45000 : 25000); // 45s for CI, 25s locally

    let occupancyChannel: string;
    let outputPath: string;

    beforeEach(async function(){
      occupancyChannel = getUniqueChannelName("occupancy");
      outputPath = await createTempOutputFile();
    });

    it('should get channel occupancy', async function() {
      let subscribeProcess: ChildProcess | null = null;

      try {
        // Start a background subscriber process
        console.log(`Starting background subscriber for channel ${occupancyChannel}`);
        const subscribeInfo = await runLongRunningBackgroundProcess(
          `bin/run.js channels subscribe ${occupancyChannel} --duration 20`,
          outputPath,
          { 
            readySignal: "Subscribing to channel", 
            timeoutMs: process.env.CI ? 20000 : 15000, // Increased timeout for CI
            retryCount: 2 
          }
        );
        subscribeProcess = subscribeInfo.process;

        console.log(`Background subscriber process started (PID: ${subscribeProcess.pid})`);

        // Wait longer for the subscriber to be fully counted by Ably in CI
        const waitTime = process.env.CI ? 4000 : 2000;
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // Run the occupancy get command
        console.log(`Getting occupancy for channel ${occupancyChannel}`);
        const occupancyResult = await runBackgroundProcessAndGetOutput(
          `bin/run.js channels occupancy get ${occupancyChannel}`,
          process.env.CI ? 15000 : 10000 // Increased timeout for CI
        );

        expect(occupancyResult.exitCode).to.equal(0);
        expect(occupancyResult.stdout).to.contain(occupancyChannel);
        expect(occupancyResult.stdout).to.match(/Presence Members:\s*\d+/i);
        expect(occupancyResult.stdout).to.match(/Subscribers:\s*[1-9]\d*/i);

        console.log(`Occupancy command completed successfully`);

      } finally {
        // Clean up - kill the subscriber process
        if (subscribeProcess) {
          await killProcess(subscribeProcess);
          // Wait for process to fully exit
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    });
  });
}
