import { expect, test } from "@oclif/test";
import {
  E2E_API_KEY,
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  forceExit,
  skipTestsIfNeeded
} from "../../helpers/e2e-test-helper.js";

// Skip tests if API key not available
skipTestsIfNeeded('Channel History E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Channel History E2E Tests', function() {
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
        await test
          .timeout(30000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command([
            "channels",
            "publish",
            historyChannel,
            JSON.stringify({ text: testMessages[i] })
          ])
          .it(`publishes message ${i+1} for history test`, (ctx) => {
            expect(ctx.stdout).to.contain(`Message published successfully to channel "${historyChannel}"`);
          });
      }

      // Add a delay to ensure messages are stored
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Retrieve history using the CLI
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: E2E_API_KEY || "" })
        .stdout()
        .command(["channels", "history", historyChannel])
        .it('retrieves history with CLI-published messages', (ctx) => {
          // Verify all messages are in the history
          for (const message of testMessages) {
            expect(ctx.stdout).to.contain(message);
          }
        });
    });
  });
}
