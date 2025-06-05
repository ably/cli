import { expect } from "@oclif/test";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { exec } from "node:child_process";
import * as fs from 'node:fs';
import {
  E2E_API_KEY,
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  getUniqueClientId,
  createTempOutputFile,
  runLongRunningBackgroundProcess,
  readProcessOutput,
  runBackgroundProcessAndGetOutput,
  killProcess,
  skipTestsIfNeeded,
  applyE2ETestSetup,
  createAblyRealtimeClient
} from "../../helpers/e2e-test-helper.js";
import { startSubscribeCommand, startPresenceCommand, runCommand, waitForOutput, cleanupRunners } from "../../helpers/command-helpers.js";
import { CliRunner } from "../../helpers/cli-runner.js";
import { ChildProcess, spawn } from "node:child_process";
import * as os from "node:os";

const execAsync = promisify(exec);

// Helper function to wait for a string to appear in output
async function waitForStringInOutput(
  outputFn: () => string,
  targetString: string,
  timeoutMs: number = 20000 // Increased default timeout for CI
): Promise<void> {
  const startTime = Date.now();
  let lastOutput = '';
  
  while (Date.now() - startTime < timeoutMs) {
    const output = outputFn();
    
    // Log output changes for debugging
    if (output !== lastOutput && process.env.E2E_DEBUG) {
      console.log(`[DEBUG] Output updated, looking for "${targetString}"`);
      console.log(`[DEBUG] Current output: ${output.slice(Math.max(0, output.length - 200))}`);
      lastOutput = output;
    }
    
    // Check both raw output and normalized versions
    if (output.includes(targetString) || 
        output.toLowerCase().includes(targetString.toLowerCase()) ||
        // Handle ANSI codes that might interfere
        stripAnsi(output).includes(targetString)) {
      console.log(`Found target string: "${targetString}"`);
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100)); // Faster polling
  }
  
  // Include more context in error message
  const recentOutput = lastOutput.slice(Math.max(0, lastOutput.length - 500));
  throw new Error(`Timeout waiting for string "${targetString}" in output after ${timeoutMs}ms. Recent output:\n${recentOutput}`);
}

// Helper function to strip ANSI codes
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Skip tests if API key not available
skipTestsIfNeeded('Rooms E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Rooms E2E Tests', function() {
    // Apply standard E2E setup with increased timeout for E2E tests
    before(function() {
      applyE2ETestSetup();
    });

    // Set timeout for E2E tests - increased for CI environments
    this.timeout(process.env.CI ? 45000 : 25000); // 45s for CI, 25s locally

    let testRoomId: string;
    let client1Id: string;
    let client2Id: string;

    beforeEach(function() {
      testRoomId = getUniqueChannelName("room");
      client1Id = getUniqueClientId("client1");
      client2Id = getUniqueClientId("client2");
      console.log(`Test setup: Room=${testRoomId}, Client1=${client1Id}, Client2=${client2Id}`);
    });

    describe('Room occupancy functionality', function() {
      it('should show occupancy metrics for active room', async function() {
        let presenceRunner: CliRunner | null = null;

        try {
          // Start client1 entering presence (this is a long-running command)
          console.log(`Client1 entering presence to establish room occupancy`);
          presenceRunner = await startPresenceCommand(
            ['rooms', 'presence', 'enter', testRoomId, '--profile-data', '{"name":"TestUser1"}', '--client-id', client1Id, '--duration', '15'],
            /Entered room/,
            { timeoutMs: process.env.CI ? 20000 : 15000 }
          );

          // Wait longer for presence to establish in CI
          const initialWait = process.env.CI ? 5000 : 3000;
          console.log(`Waiting ${initialWait}ms for presence to fully establish...`);
          await new Promise(resolve => setTimeout(resolve, initialWait));

          console.log(`Presence process output so far: ${presenceRunner.combined().slice(-200)}`);

          // Check occupancy metrics multiple times with retry logic
          let occupancyResult: { exitCode: number | null; stdout: string; stderr: string } | null = null;
          let attempts = 0;
          const maxAttempts = process.env.CI ? 5 : 3;

          while (attempts < maxAttempts) {
            attempts++;
            console.log(`Checking occupancy metrics for room ${testRoomId} (attempt ${attempts}/${maxAttempts})`);
            
            occupancyResult = await runCommand(['rooms', 'occupancy', 'get', testRoomId], {
              timeoutMs: process.env.CI ? 15000 : 10000
            });

            console.log(`Occupancy attempt ${attempts} - Exit code: ${occupancyResult.exitCode}`);
            console.log(`Occupancy stdout: ${occupancyResult.stdout}`);
            console.log(`Occupancy stderr: ${occupancyResult.stderr}`);

            if (occupancyResult.exitCode === 0 && 
                occupancyResult.stdout.includes("Connections:") && 
                occupancyResult.stdout.includes("Presence Members:")) {
              break;
            }

            if (attempts < maxAttempts) {
              const retryDelay = 2000 * attempts; // Progressive delay
              console.log(`Occupancy check failed, waiting ${retryDelay}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }

          // Validate final result
          expect(occupancyResult, "Should have occupancy result").to.not.be.null;
          expect(occupancyResult!.exitCode, `Exit code should be 0. stderr: ${occupancyResult!.stderr}`).to.equal(0);
          expect(occupancyResult!.stdout).to.contain("Connections:");
          expect(occupancyResult!.stdout).to.contain("Presence Members:");

        } finally {
          // Clean up
          if (presenceRunner) {
            await presenceRunner.kill();
          }
        }
      });
    });
    
    // Only run interactive tests if we have a working API key
    if (E2E_API_KEY && !E2E_API_KEY.includes('fake')) {
      describe('Presence functionality', function() {
        it('should allow two connections where one person entering is visible to the other', async function() {
          this.timeout(process.env.CI ? 90000 : 75000); // Restored and generous timeout
          let subscribeRunner: CliRunner | null = null;
          let enterRunner: CliRunner | null = null;

          try {
            // Start client1 subscribing to presence events
            console.log(`[Test Debug] Starting presence subscription for client1 (${client1Id}) on room ${testRoomId}`);
            subscribeRunner = await startSubscribeCommand(
              ['rooms', 'presence', 'subscribe', testRoomId, '--client-id', client1Id, '--duration', '35'],
              /Subscribing to presence events/,
              { timeoutMs: process.env.CI ? 30000 : 20000 }
            );
            console.log(`[Test Debug] Subscriber process for client1 started and ready.`);

            // Wait a moment for client1's subscription to fully establish
            const client1SetupWait = process.env.CI ? 4000 : 2000;
            console.log(`[Test Debug] Waiting ${client1SetupWait}ms for client1 subscription to fully establish.`);
            await new Promise(resolve => setTimeout(resolve, client1SetupWait));

            // Have client2 enter the room
            console.log(`[Test Debug] Client2 (${client2Id}) entering room ${testRoomId} with profile data.`);
            enterRunner = await startPresenceCommand(
              ['rooms', 'presence', 'enter', testRoomId, '--profile-data', '{"name":"TestUser2","status":"active"}', '--client-id', client2Id, '--duration', '25'],
              /Entered room/,
              { timeoutMs: process.env.CI ? 30000 : 20000 }
            );
            console.log(`[Test Debug] Enter process for client2 started and ready.`);

            // Add a significant delay for presence event propagation
            const propagationDelay = process.env.CI ? 10000 : 7000; 
            console.log(`[Test Debug] Waiting ${propagationDelay}ms for presence event propagation after client2 entered.`);
            await new Promise(resolve => setTimeout(resolve, propagationDelay));

            // Wait for all presence event components using the improved detection
            console.log("[Test Debug] Waiting for presence event components to appear...");

            try {
              // Wait for action enter pattern
              await waitForOutput(subscribeRunner, `Action: enter`, process.env.CI ? 20000 : 15000);
              console.log("[Test Debug] ✓ Detected presence action: enter");

              // Wait for client ID pattern
              await waitForOutput(subscribeRunner, `Client: ${client2Id}`, process.env.CI ? 10000 : 5000);
              console.log("[Test Debug] ✓ Detected client ID in presence event");

              // Wait for profile data pattern
              await waitForOutput(subscribeRunner, `"name":"TestUser2"`, process.env.CI ? 10000 : 5000);
              console.log("[Test Debug] ✓ Detected profile data in presence event");

              // Wait for status in profile data
              await waitForOutput(subscribeRunner, `"status":"active"`, process.env.CI ? 5000 : 3000);
              console.log("[Test Debug] ✓ Detected status in profile data");

              console.log("[Test Debug] All presence event components detected successfully!");

            } catch (error) {
              console.log(`[TEST FAILURE DEBUG] Failed to detect presence event components: ${error instanceof Error ? error.message : String(error)}`);
              console.log(`[TEST FAILURE DEBUG] Final subscriber output:\n${subscribeRunner.combined().slice(-1500)}`);
              console.log(`[TEST FAILURE DEBUG] Final enterer output:\n${enterRunner.combined().slice(-1500)}`);
              throw error;
            }

          } finally {
            console.log("[Test Debug] Entering finally block for Rooms Presence test.");
            await cleanupRunners([subscribeRunner, enterRunner].filter(Boolean) as CliRunner[]);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Final wait for cleanup
          }
        });
      });

      describe('Message publish and subscribe functionality', function() {
        it('should allow publishing and subscribing to messages', async function() {
          let subscribeRunner: CliRunner | null = null;

          try {
            // Start subscribing to messages with client1
            console.log(`[Test Debug] Starting message subscribe for client1 on room ${testRoomId}`);
            subscribeRunner = await startSubscribeCommand(
              ['rooms', 'messages', 'subscribe', testRoomId, '--client-id', client1Id, '--duration', '30'],
              /Connected to room:/,
              { timeoutMs: process.env.CI ? 45000 : 25000 }
            );

            console.log(`[Test Debug] Subscribe process started and ready`);

            // Wait a bit to ensure subscription is established
            const setupWait = process.env.CI ? 3000 : 1000;
            console.log(`[Test Debug] Waiting ${setupWait}ms for subscription to establish`);
            await new Promise(resolve => setTimeout(resolve, setupWait));

            // Have client2 send a message
            const testMessage = "Hello from E2E test!";
            console.log(`[Test Debug] Client2 sending message: "${testMessage}"`);
            const sendResult = await runCommand(['rooms', 'messages', 'send', testRoomId, testMessage, '--client-id', client2Id], {
              timeoutMs: process.env.CI ? 20000 : 10000
            });

            console.log(`[Test Debug] Send result - exitCode: ${sendResult.exitCode}`);
            console.log(`[Test Debug] Send result - stdout: ${sendResult.stdout}`);
            console.log(`[Test Debug] Send result - stderr: ${sendResult.stderr}`);

            expect(sendResult.exitCode).to.equal(0);
            expect(sendResult.stdout).to.contain("Message sent successfully");

            // Wait for the message to be received by the subscriber
            console.log(`[Test Debug] Waiting for message to be received by subscriber`);
            await waitForOutput(subscribeRunner, testMessage, process.env.CI ? 10000 : 6000);
            await waitForOutput(subscribeRunner, client2Id, process.env.CI ? 5000 : 3000);
            console.log(`[Test Debug] Message detected in subscriber output!`);

            // Send a second message with metadata
            const secondMessage = "Second test message with metadata";
            const metadata = { timestamp: Date.now(), type: "test" };
            console.log(`[Test Debug] Client2 sending second message with metadata`);
            const sendResult2 = await runCommand([
              'rooms', 'messages', 'send', testRoomId, secondMessage, 
              '--metadata', JSON.stringify(metadata), '--client-id', client2Id
            ], {
              timeoutMs: process.env.CI ? 20000 : 10000
            });

            expect(sendResult2.exitCode).to.equal(0);

            // Wait for the second message to be received
            console.log(`[Test Debug] Waiting for second message to be received`);
            await waitForOutput(subscribeRunner, secondMessage, process.env.CI ? 10000 : 6000);
            console.log(`[Test Debug] Second message detected in subscriber output!`);

          } finally {
            if (subscribeRunner) {
              await subscribeRunner.kill();
            }
          }
        });
      });
    } else {
      describe('Command Structure Tests (No Real API Key)', function() {
        it('should have properly structured presence commands', async function() {
          // Test help command to ensure command structure exists
          const helpResult = await runCommand(['rooms', 'presence', 'subscribe', '--help']);
          expect(helpResult.exitCode).to.equal(0);
          expect(helpResult.stdout).to.contain("Subscribe to presence events");
        });

        it('should have properly structured message commands', async function() {
          const helpResult = await runCommand(['rooms', 'messages', 'subscribe', '--help']);
          expect(helpResult.exitCode).to.equal(0);
          expect(helpResult.stdout).to.contain("Subscribe to messages");
        });
      });
    }
  });
} else {
  describe('Rooms E2E Tests', function() {
    it('should be skipped when E2E_ABLY_API_KEY is not set', function() {
      console.log('Skipping Rooms E2E Tests - E2E_ABLY_API_KEY not configured');
      this.skip();
    });
  });
}