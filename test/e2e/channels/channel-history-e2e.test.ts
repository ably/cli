import { expect } from "chai";
import {
  E2E_API_KEY,
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  skipTestsIfNeeded,
  applyE2ETestSetup
} from "../../helpers/e2e-test-helper.js";
import { runCommand } from "../../helpers/command-helpers.js";

// Skip tests if API key not available
skipTestsIfNeeded('Channel History E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Channel History E2E Tests', function() {
    // Apply E2E test setup for debug output on failures
    applyE2ETestSetup();
    
    // Set test timeout to accommodate background processes
    this.timeout(30000);

    // Test history functionality - publish messages with CLI then retrieve history
    it('should publish messages and retrieve history with CLI', async function() {
      const historyChannel = getUniqueChannelName("cli-history");
      const testMessages = [
        "CLI History Test Message 1",
        "CLI History Test Message 2",
        "CLI History Test Message 3"
      ];

      // Publish messages using the CLI
      for (let i = 0; i < testMessages.length; i++) {
        const publishResult = await runCommand([
          "channels",
          "publish",
          historyChannel,
          JSON.stringify({ text: testMessages[i] })
        ], {
          env: { ABLY_API_KEY: E2E_API_KEY || "" },
          timeoutMs: 30000
        });
        
        expect(publishResult.exitCode).to.equal(0);
        expect(publishResult.stdout).to.contain(`Message published successfully to channel "${historyChannel}"`);
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
      
      expect(historyResult.exitCode).to.equal(0);
      
      // Verify all messages are in the history
      for (const message of testMessages) {
        expect(historyResult.stdout).to.contain(message);
      }
    });
  });
}
