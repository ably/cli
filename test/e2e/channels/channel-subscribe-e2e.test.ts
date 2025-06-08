import { expect } from "@oclif/test";
import {
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  createTempOutputFile,
  runLongRunningBackgroundProcess,
  readProcessOutput,
  publishTestMessage,
  killProcess,
  forceExit,
  cleanupTrackedResources,
  testOutputFiles,
  testCommands,
  displayTestFailureDebugOutput
} from "../../helpers/e2e-test-helper.js";
import { ChildProcess } from "node:child_process";

describe('Channel Subscribe E2E Tests', function() {
  // Skip all tests if API key not available
  before(async function() {
    if (SHOULD_SKIP_E2E) {
      this.skip();
    }
    process.on('SIGINT', forceExit);
  });

  after(function() {
    process.removeListener('SIGINT', forceExit);
  });

  let subscribeChannel: string;
  let outputPath: string;
  let subscribeProcess: ChildProcess | null = null;
  let subscribeProcessInfo: any;

  beforeEach(async function() {
    this.timeout(120000); // 2 minutes per individual test
    // Clear tracked commands and output files before each test
    testOutputFiles.clear();
    testCommands.length = 0;
    subscribeChannel = getUniqueChannelName("subscribe");
    outputPath = await createTempOutputFile();
  });

    afterEach(async function() {
       // Display debug output if test failed
       if (this.currentTest?.state === 'failed') {
         await displayTestFailureDebugOutput(this.currentTest?.title);
       }
       // Kill specific process if necessary
        if (subscribeProcess) {
            await killProcess(subscribeProcess);
            subscribeProcess = null;
        }
        // Perform E2E cleanup
        await cleanupTrackedResources();
    });

    // Test subscribe functionality - subscribe in one process, publish in another
    it('should subscribe to a channel and receive messages', async function() {
      const readySignal = "Subscribing to channel"; // Define the signal to wait for

      // Start the subscribe process, waiting for the ready signal
      subscribeProcessInfo = await runLongRunningBackgroundProcess(
        `bin/run.js channels subscribe ${subscribeChannel}`,
        outputPath,
        { readySignal, timeoutMs: 15000 } // Pass signal and a 15s timeout
      );
      // If the above promise resolved, the process is ready.
      console.log(`[Test Subscribe] Background subscriber process ${subscribeProcessInfo.processId} ready.`);

      try {
        // Publish a message to the channel
        console.log(`[Test Subscribe] Publishing message to ${subscribeChannel}...`);
        const testMessage = { text: "Subscribe E2E Test" };
        await publishTestMessage(subscribeChannel, testMessage);
        console.log(`[Test Subscribe] Message published.`);

        // Wait for the subscribe process to receive the message
        console.log(`[Test Subscribe] Waiting for message in output file ${outputPath}...`);
        let messageReceived = false;
        // Poll for a reasonable time after publishing
        for (let i = 0; i < 50; i++) { // ~7.5 seconds polling
          const output = await readProcessOutput(outputPath);
           // console.log(`[Test Subscribe] Attempt ${i + 1}/50 (message): Reading output file. Content length: ${output.length}`);
          if (output.includes("Subscribe E2E Test")) {
             console.log(`[Test Subscribe] Message received in output.`);
            messageReceived = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 150));
        }
         if (!messageReceived) {
            const finalOutput = await readProcessOutput(outputPath);
            console.error(`[Test Subscribe] FAILED TO FIND MESSAGE. Final output:\n${finalOutput}`);
        }
        expect(messageReceived, "Subscribe process should receive the message").to.be.true;

      } finally {
        // Cleanup is handled by applyE2ETestSetup's afterEach hook
        console.log(`[Test Subscribe] Test finished, cleanup will handle process ${subscribeProcessInfo?.processId}`);
      }
    });
});
