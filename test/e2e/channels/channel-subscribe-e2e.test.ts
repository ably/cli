import { expect } from "@oclif/test";
import {
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  createTempOutputFile,
  runBackgroundProcess,
  readProcessOutput,
  publishTestMessage,
  killProcess,
  forceExit,
  cleanupBackgroundProcesses,
  skipTestsIfNeeded
} from "../../helpers/e2e-test-helper.js";

// Skip tests if API key not available
skipTestsIfNeeded('Channel Subscribe E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Channel Subscribe E2E Tests', function() {
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

    // Test subscribe functionality - subscribe in one process, publish in another
    it('should subscribe to a channel and receive messages', async function() {
      const subscribeChannel = getUniqueChannelName("subscribe");
      const testMessage = { text: "Subscribe E2E Test" };

      // Create a temporary file to capture the output of the subscribe process
      const outputPath = await createTempOutputFile();

      // Start the subscribe process in the background
      const subscribeProcess = await runBackgroundProcess(
        `bin/run.js channels subscribe ${subscribeChannel}`,
        outputPath
      );

      try {
        // Wait for the subscribe process to be ready
        // The subscribe command outputs "Subscribing to channel" when ready
        let isReady = false;
        for (let i = 0; i < 50; i++) {
          const output = await readProcessOutput(outputPath);
          if (output.includes("Subscribing to channel")) {
            isReady = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        expect(isReady, "Subscribe process should be ready").to.be.true;

        // Publish a message to the channel
        await publishTestMessage(subscribeChannel, testMessage);

        // Wait for the subscribe process to receive the message
        let messageReceived = false;
        for (let i = 0; i < 50; i++) {
          const output = await readProcessOutput(outputPath);
          if (output.includes("Subscribe E2E Test")) {
            messageReceived = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        expect(messageReceived, "Subscribe process should receive the message").to.be.true;
      } finally {
        // Kill the subscribe process safely
        killProcess(subscribeProcess);
      }
    });
  });
}
