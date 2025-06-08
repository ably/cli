import { expect } from "chai";
import {
  E2E_API_KEY,
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  forceExit,
  cleanupTrackedResources,
  testOutputFiles,
  testCommands,
  displayTestFailureDebugOutput
} from "../../helpers/e2e-test-helper.js";
import { runCommand } from "../../helpers/command-helpers.js";

describe('Channel History E2E Tests', function() {
  // Skip all tests if API key not available
  before(function() {
    if (SHOULD_SKIP_E2E) {
      this.skip();
    }
    process.on('SIGINT', forceExit);
  });

  after(function() {
    process.removeListener('SIGINT', forceExit);
  });

  beforeEach(function() {
    this.timeout(120000); // 2 minutes per individual test
    // Clear tracked commands and output files before each test
    testOutputFiles.clear();
    testCommands.length = 0;
  });

  afterEach(async function() {
    // Display debug output if test failed
    if (this.currentTest?.state === 'failed') {
      await displayTestFailureDebugOutput(this.currentTest?.title);
    }
    await cleanupTrackedResources();
  });

    // Test history functionality - publish messages with CLI then retrieve history
    it('should publish messages and retrieve history with CLI', async function() {
      // Verify API key is available
      if (!E2E_API_KEY) {
        throw new Error('E2E_API_KEY is not available for testing');
      }

      const historyChannel = getUniqueChannelName("cli-history");
      const testMessages = [
        "CLI History Test Message 1",
        "CLI History Test Message 2",
        "CLI History Test Message 3"
      ];

      // Publish messages using the CLI
      for (let i = 0; i < testMessages.length; i++) {
        console.log(`Publishing message ${i + 1}: ${testMessages[i]} to channel: ${historyChannel}`);
        console.log(`Using API key: ${E2E_API_KEY ? E2E_API_KEY.slice(0, 10) + '...' : 'NOT_SET'}`);
        
        const publishResult = await runCommand([
          "channels",
          "publish",
          historyChannel,
          JSON.stringify({ text: testMessages[i] })
        ], {
          env: { ABLY_API_KEY: E2E_API_KEY || "" },
          timeoutMs: 30000
        });
        
        expect(publishResult.exitCode).to.equal(0, `Publish command failed. Exit code: ${publishResult.exitCode}, stderr: ${publishResult.stderr}, stdout: ${publishResult.stdout}`);
        
        // Check if publish stdout is empty and provide diagnostic info
        if (!publishResult.stdout || publishResult.stdout.trim() === '') {
          throw new Error(`Publish command returned empty output. Exit code: ${publishResult.exitCode}, stderr: "${publishResult.stderr}", stdout: "${publishResult.stdout}"`);
        }
        
        expect(publishResult.stdout).to.contain(`Message published successfully to channel "${historyChannel}"`, `Expected success message in publish output: "${publishResult.stdout}"`);
      }

      // Add a delay to ensure messages are stored
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Retrieve history using the CLI
      const historyResult = await runCommand([
        "channels", 
        "history", 
        historyChannel
      ], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      expect(historyResult.exitCode).to.equal(0, `History command failed. Exit code: ${historyResult.exitCode}, stderr: ${historyResult.stderr}, stdout: ${historyResult.stdout}`);
      
      // Check if stdout is empty and provide diagnostic info
      if (!historyResult.stdout || historyResult.stdout.trim() === '') {
        throw new Error(`History command returned empty output. Exit code: ${historyResult.exitCode}, stderr: "${historyResult.stderr}", stdout: "${historyResult.stdout}"`);
      }
      
      // Verify all messages are in the history
      for (const message of testMessages) {
        expect(historyResult.stdout).to.contain(message, `Expected to find "${message}" in history output: "${historyResult.stdout}"`);
      }
    });
});
