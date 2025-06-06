import { expect } from "chai";
import { randomUUID } from "node:crypto";
import {
  E2E_API_KEY,
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  skipTestsIfNeeded,
  applyE2ETestSetup
} from "../../helpers/e2e-test-helper.js";
import { runCommand } from "../../helpers/command-helpers.js";

// Skip tests if API key not available
skipTestsIfNeeded('Channel Presence E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Channel Presence E2E Tests', function() {
    // Apply E2E test setup for debug output on failures
    applyE2ETestSetup();
    
    // Set test timeout to accommodate background processes
    this.timeout(60000);

    // Test presence functionality - simplified to enter/exit only since list command doesn't exist
    it('should enter and exit presence on a channel', async function() {
      const presenceChannel = getUniqueChannelName("presence");
      const clientId = `cli-e2e-test-${randomUUID()}`;
      const clientData = { name: "E2E Test Client" };

      console.log(`Using presence channel: ${presenceChannel} with client ID: ${clientId}`);

      // Enter the presence channel using the CLI (exit after 2 seconds)
      const enterResult = await runCommand([
        "channels",
        "presence",
        "enter",
        presenceChannel,
        "--client-id",
        clientId,
        "--profile-data",
        JSON.stringify(clientData),
        "--duration",
        "2"
      ], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      console.log(`Presence enter output: ${enterResult.stdout}`);
      expect(enterResult.exitCode).to.equal(0);
      expect(enterResult.stdout).to.contain("Entered channel");
      expect(enterResult.stdout).to.contain("Duration elapsed – command finished cleanly");
    });
  });
}
