import { expect, test } from "@oclif/test";
import {
  E2E_API_KEY,
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  createTempOutputFile,
  runBackgroundProcess,
  readProcessOutput,
  killProcess,
  forceExit,
  cleanupBackgroundProcesses,
  skipTestsIfNeeded
} from "../../helpers/e2e-test-helper.js";

// Skip tests if API key not available
skipTestsIfNeeded('Channel Occupancy E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Channel Occupancy E2E Tests', function() {
    // Set test timeout to accommodate background processes
    this.timeout(30000);

    before(async function() {
      // Add handler for interrupt signal
      process.on('SIGINT', forceExit);
    });

    after(function() {
      // Remove interrupt handler
      process.removeListener('SIGINT', forceExit);
    });

    // Clean up any background processes that might still be running
    afterEach(async function() {
      await cleanupBackgroundProcesses();
    });

    // Test occupancy functionality - use direct CLI calls for simplicity
    it('should get channel occupancy', async function() {
      // Create a unique channel name
      const occupancyChannel = getUniqueChannelName("occupancy");
      console.log(`Using occupancy channel: ${occupancyChannel}`);

      // First, subscribe to the channel in a background process
      const outputPath = await createTempOutputFile();
      console.log(`Channel subscribe output will be logged to: ${outputPath}`);

      const channelProcess = await runBackgroundProcess(
        `bin/run.js channels subscribe ${occupancyChannel}`,
        outputPath
      );

      try {
        // Wait for the channel subscribe to be ready
        let channelIsReady = false;
        for (let i = 0; i < 50; i++) {
          const output = await readProcessOutput(outputPath);
          if (output.includes("Subscribing to channel")) {
            channelIsReady = true;
            console.log("Channel subscribe process is ready");
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        expect(channelIsReady, "Channel subscribe process should be ready").to.be.true;

        // Give some time for the connection to be fully established
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Test occupancy get command
        await test
          .timeout(30000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(["channels", "occupancy", "get", occupancyChannel])
          .it('gets occupancy for a channel with active subscribers', (ctx) => {
            console.log(`Occupancy get output: ${ctx.stdout}`);
            expect(ctx.stdout).to.contain(occupancyChannel);

            // Verify it shows some kind of occupancy data
            expect(ctx.stdout).to.match(/connections|subscribers|publishers|presenceConnections|presenceSubscribers|presenceMembers/);

            // Look for non-zero values to confirm actual occupancy
            // At minimum, we should see 1 subscriber (our background process)
            expect(ctx.stdout).to.match(/[1-9]\d*\s+subscribers/i);
          });
      } finally {
        // Clean up the channel process
        console.log("Cleaning up channel process");
        killProcess(channelProcess);
      }
    });
  });
}
