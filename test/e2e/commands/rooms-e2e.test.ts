import { expect } from "@oclif/test";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { exec } from "node:child_process";
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
        let presenceProcess: ChildProcess | null = null;
        let outputPath: string = '';

        try {
          // Create output file for presence monitoring
          outputPath = await createTempOutputFile();

          // Start client1 entering presence (this is a long-running command)
          console.log(`Client1 entering presence to establish room occupancy`);
          const presenceInfo = await runLongRunningBackgroundProcess(
            `bin/run.js rooms presence enter ${testRoomId} --profile-data '{"name":"Test User 1"}' --client-id ${client1Id} --duration 15`,
            outputPath,
            { 
              readySignal: "Entered room", 
              timeoutMs: process.env.CI ? 20000 : 15000, // Increased timeout for CI
              retryCount: 2 
            }
          );
          presenceProcess = presenceInfo.process;

          // Wait longer for presence to establish in CI
          const waitTime = process.env.CI ? 3000 : 1500;
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // Check occupancy metrics (this should exit quickly)
          console.log(`Checking occupancy metrics for room ${testRoomId}`);
          const occupancyResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms occupancy get ${testRoomId}`,
            process.env.CI ? 15000 : 10000 // Increased timeout for CI
          );

          expect(occupancyResult.exitCode).to.equal(0);
          expect(occupancyResult.stdout).to.contain("Connections:");
          expect(occupancyResult.stdout).to.contain("Presence Members:");

        } finally {
          // Clean up - kill the presence process
          if (presenceProcess) {
            await killProcess(presenceProcess);
            // Wait for process to fully exit
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      });
    });
    
    // Only run interactive tests if we have a working API key
    if (E2E_API_KEY && !E2E_API_KEY.includes('fake')) {
      describe('Presence functionality', function() {
        it('should allow two connections where one person entering is visible to the other', async function() {
          const testRoomId = `test-room-${Date.now()}`;
          const client1Id = `client-1-${Date.now()}`;
          const client2Id = `client-2-${Date.now()}`;
          const tmpDir = os.tmpdir();
          const outputPath = `${tmpDir}/rooms-presence-output.txt`;

          // Create a child process to subscribe to presence in the background
          const subscribeChild = spawn(
            "bin/run.js",
            [
              "rooms",
              "presence",
              "subscribe",
              testRoomId,
              "--client-id",
              client1Id,
              "--duration",
              "15", // Increased duration for CI
            ],
            {
              stdio: ["pipe", "pipe", "pipe"],
              env: {
                ...process.env,
                ABLY_API_KEY: E2E_API_KEY, // Ensure the subscriber gets the API key
                // Remove ABLY_CLI_TEST_MODE so it uses real Ably
              },
            }
          );

          let subscribeOutput = "";
          subscribeChild.stdout?.on("data", (data) => {
            subscribeOutput += data.toString();
          });
          subscribeChild.stderr?.on("data", (data) => {
            subscribeOutput += data.toString();
          });

          // Wait for the subscriber to be ready (looking for the ready signal)
          await waitForStringInOutput(
            () => subscribeOutput,
            "Subscribing to presence events. Press Ctrl+C to exit.",
            process.env.CI ? 10000 : 5000 // Increased timeout for CI
          );

          // Additional wait for subscription to fully establish
          await new Promise(resolve => setTimeout(resolve, process.env.CI ? 2000 : 1000));

          // Now have client 2 enter the room
          const enterResult = await execAsync(
            `bin/run.js rooms presence enter ${testRoomId} --profile-data '{"name":"Test User 2","status":"active"}' --client-id ${client2Id} --duration 8`,
            {
              env: {
                ...process.env,
                ABLY_API_KEY: E2E_API_KEY,
                // Remove ABLY_CLI_TEST_MODE so it uses real Ably
              },
            }
          );

          expect(enterResult.stderr).to.be.empty;
          expect(enterResult.stdout).to.contain("Entered room");

          // Wait longer for the presence event to be received by the subscriber
          // We need to poll the subscribeOutput for presence events
          let presenceEventDetected = false;
          const maxWaitTime = process.env.CI ? 15000 : 8000; // Increased for CI
          const pollInterval = 300; // Faster polling
          const maxAttempts = maxWaitTime / pollInterval;

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (subscribeOutput.includes("Test User 2") && subscribeOutput.includes("enter")) {
              presenceEventDetected = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }

          // Clean up the subscribe process
          subscribeChild.kill("SIGTERM");
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for cleanup

          // Check that the presence event was detected
          expect(presenceEventDetected).to.be.true;
          expect(subscribeOutput).to.contain("Test User 2");
          expect(subscribeOutput).to.contain("enter");
        });
      });

      describe('Message publish and subscribe functionality', function() {
        it('should allow subscribe to show messages arrive whilst publishing', async function() {
          let subscribeProcess: ChildProcess | null = null;
          let outputPath: string = '';

          try {
            // Create output file for message monitoring
            outputPath = await createTempOutputFile();

            // Start client1 subscribing to messages on the room
            console.log(`Starting message subscription for client1 on room ${testRoomId}`);
            const subscribeInfo = await runLongRunningBackgroundProcess(
              `bin/run.js rooms messages subscribe ${testRoomId} --client-id ${client1Id} --duration 15`,
              outputPath,
              { 
                readySignal: "Listening for messages", 
                timeoutMs: process.env.CI ? 20000 : 15000, // Increased timeout for CI
                retryCount: 2 
              }
            );
            subscribeProcess = subscribeInfo.process;

            // Wait longer for subscription to fully establish
            const setupWait = process.env.CI ? 3000 : 1500;
            await new Promise(resolve => setTimeout(resolve, setupWait));

            // Have client2 send a message to the room
            const testMessage = `E2E test message from ${client2Id} at ${new Date().toISOString()}`;
            console.log(`Client2 sending message to room ${testRoomId}: ${testMessage}`);
            
            const sendResult = await runBackgroundProcessAndGetOutput(
              `bin/run.js rooms messages send ${testRoomId} "${testMessage}" --client-id ${client2Id}`,
              process.env.CI ? 15000 : 10000 // Increased timeout for CI
            );

            // Handle authentication failures gracefully
            if (!sendResult || sendResult.exitCode == null || sendResult.exitCode !== 0) {
              console.warn(`Message send failed with exit code ${sendResult?.exitCode}, stderr:`, sendResult?.stderr);
              console.warn(`stdout:`, sendResult?.stdout);
              if (sendResult?.stderr?.includes('authentication') || sendResult?.stderr?.includes('401')) {
                console.warn('Authentication failure detected, skipping test');
                this.skip();
                return;
              }
              expect(sendResult?.exitCode).to.equal(0);
            }

            expect(sendResult.stdout).to.contain("Message sent successfully");

            // Wait for message to be received by client1
            console.log("Waiting for message to be received by subscribing client");
            let messageReceived = false;
            const maxAttempts = process.env.CI ? 40 : 25; // More attempts for CI
            
            for (let i = 0; i < maxAttempts; i++) {
              const output = await readProcessOutput(outputPath);
              if ((output.includes(testMessage) || output.includes(client2Id)) && 
                  !output.includes('Failed to subscribe')) {
                console.log("Message received in subscription output");
                messageReceived = true;
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 200));
            }

            expect(messageReceived, "Client1 should receive the message sent by client2").to.be.true;

          } finally {
            if (subscribeProcess) {
              await killProcess(subscribeProcess);
              // Wait for cleanup
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        });
      });
    } else {
      describe('Command Structure Tests (No Real API Key)', function() {
        it('should have properly structured presence commands', async function() {
          // Test help command to ensure command structure exists
          const helpResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms presence subscribe --help`
          );
          expect(helpResult.exitCode).to.equal(0);
          expect(helpResult.stdout).to.contain("Subscribe to presence events");
        });

        it('should have properly structured message commands', async function() {
          const helpResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms messages subscribe --help`
          );
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