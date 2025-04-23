import { expect, test } from "@oclif/test";
import { randomUUID } from "node:crypto";
import {
  E2E_API_KEY,
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  forceExit,
  skipTestsIfNeeded
} from "../../helpers/e2e-test-helper.js";

// Skip tests if API key not available
skipTestsIfNeeded('Channel Presence E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Channel Presence E2E Tests', function() {
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

    // Test presence functionality - use direct CLI calls instead of background processes
    it('should enter, list and leave presence on a channel', async function() {
      const presenceChannel = getUniqueChannelName("presence");
      const clientId = `cli-e2e-test-${randomUUID()}`;
      const clientData = { name: "E2E Test Client" };

      console.log(`Using presence channel: ${presenceChannel} with client ID: ${clientId}`);

      // Enter the presence channel using the CLI
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: E2E_API_KEY || "" })
        .stdout()
        .command([
          "channels",
          "presence",
          "enter",
          presenceChannel,
          JSON.stringify(clientData),
          "--client-id",
          clientId
        ])
        .it('enters presence on a channel', (ctx) => {
          console.log(`Presence enter output: ${ctx.stdout}`);
          expect(ctx.stdout).to.contain("Entered presence");
        });

      // Add a delay to ensure presence entry has been processed
      await new Promise(resolve => setTimeout(resolve, 2000));

      // List presence using the CLI
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: E2E_API_KEY || "" })
        .stdout()
        .command(["channels", "presence", "list", presenceChannel])
        .it('lists presence members including our test client', (ctx) => {
          console.log(`Presence list output: ${ctx.stdout}`);

          // Verify test client is in the presence list
          expect(ctx.stdout).to.contain(clientId);
          expect(ctx.stdout).to.contain("E2E Test Client");
        });

      // Leave presence to clean up
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: E2E_API_KEY || "" })
        .stdout()
        .command([
          "channels",
          "presence",
          "leave",
          presenceChannel,
          "--client-id",
          clientId
        ])
        .it('leaves presence on channel', (ctx) => {
          console.log(`Presence leave output: ${ctx.stdout}`);
          expect(ctx.stdout).to.contain("Left presence");
        });

      // Verify client is no longer in presence
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: E2E_API_KEY || "" })
        .stdout()
        .command(["channels", "presence", "list", presenceChannel])
        .it('confirms client is no longer in presence list', (ctx) => {
          console.log(`Final presence list output: ${ctx.stdout}`);
          // The client ID should no longer be in the presence list
          expect(ctx.stdout).to.not.contain(clientId);
        });
    });
  });
}
