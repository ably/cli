import { expect } from "chai";
import { randomUUID } from "node:crypto";
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

describe('Channel Presence E2E Tests', function() {
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
        "--data",
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
