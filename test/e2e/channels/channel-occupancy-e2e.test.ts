import { expect, test } from "@oclif/test";
import {
  E2E_API_KEY,
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  createTempOutputFile,
  runLongRunningBackgroundProcess,
  readProcessOutput,
  killProcess,
  skipTestsIfNeeded,
  applyE2ETestSetup
} from "../../helpers/e2e-test-helper.js";
import { ChildProcess } from "node:child_process";

// Skip tests if API key not available
skipTestsIfNeeded('Channel Occupancy E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Channel Occupancy E2E Tests', function() {
    // Apply standard E2E setup via a before hook
    before(function() {
      applyE2ETestSetup();
    });

    let occupancyChannel: string;
    let outputPath: string;
    let subscribeProcessInfo: { process: ChildProcess; processId: string } | null = null;

    beforeEach(async function(){
      occupancyChannel = getUniqueChannelName("occupancy");
      outputPath = await createTempOutputFile();
      subscribeProcessInfo = null; // Reset before each test
    });

    // Cleanup is handled by applyE2ETestSetup's afterEach hook

    it('should get channel occupancy', async function() {
      // Start a background subscriber process
      subscribeProcessInfo = await runLongRunningBackgroundProcess(
        `bin/run.js channels subscribe ${occupancyChannel}`,
        outputPath
      );
      console.log(`[Test Occupancy] Started background subscriber process ${subscribeProcessInfo.processId} (PID: ${subscribeProcessInfo.process.pid})`);

      // Wait for the subscriber process to be ready
      let isReady = false;
      for (let i = 0; i < 50; i++) {
        const output = await readProcessOutput(outputPath);
        if (output.includes("Subscribing to channel")) {
          isReady = true;
          console.log(`[Test Occupancy] Background subscriber process ${subscribeProcessInfo.processId} ready.`);
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      expect(isReady, "Background subscriber process should be ready").to.be.true;

      // Add a small delay to ensure the subscriber is fully counted by Ably
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Run the occupancy get command IN THE FOREGROUND using oclif/test
      await test
        .env({ ABLY_API_KEY: E2E_API_KEY || "" })
        .stdout()
        .command(["channels", "occupancy", "get", occupancyChannel])
        .it('gets occupancy for a channel with active subscribers', (ctx) => {
            console.log(`[Test Occupancy] Foreground 'get' command stdout:\n${ctx.stdout}`);
            expect(ctx.stdout).to.include(occupancyChannel);
            expect(ctx.stdout).to.match(/presenceMembers:\s*\d+/i);
            expect(ctx.stdout).to.match(/Subscribers:\s*[1-9]\d*/i);
        });

      // Explicitly kill the background process *after* the test logic completes
      // The afterEach hook in applyE2ETestSetup will also attempt cleanup
      if (subscribeProcessInfo) {
        killProcess(subscribeProcessInfo.process);
      }
    });
  });
}
