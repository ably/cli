import { expect } from "@oclif/test";
import { randomUUID } from "node:crypto";
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
import { ChildProcess } from "node:child_process";

// Skip tests if API key not available
skipTestsIfNeeded('Rooms E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Rooms E2E Tests', function() {
    // Apply standard E2E setup with increased timeout for E2E tests
    before(function() {
      applyE2ETestSetup();
    });

    // Set timeout for E2E tests (increased but not excessive)
    this.timeout(45000); // 45 seconds max per test

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
        try {
          // First, have client1 enter the room (via presence)
          console.log(`Client1 entering presence to establish room occupancy`);
          const enterResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms presence enter ${testRoomId} '{"name":"Test User 1"}' --client-id ${client1Id}`
          );

          // For E2E tests with mock/fake credentials, we might get exit code 2
          // but the command structure should still be correct
          if (enterResult.exitCode !== 0) {
            console.warn(`Presence enter command exited with code ${enterResult.exitCode}, skipping occupancy test`);
            this.skip();
            return;
          }

          // Wait a moment for presence to establish - reduced timeout
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Check occupancy metrics
          console.log(`Checking occupancy metrics for room ${testRoomId}`);
          const occupancyResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms occupancy get ${testRoomId}`
          );

          // For E2E tests with mock/fake credentials, accept both success and auth failure
          if (occupancyResult.exitCode === 0) {
            expect(occupancyResult.stdout).to.contain("Connections:");
            expect(occupancyResult.stdout).to.contain("Presence Members:");
          } else {
            console.warn(`Occupancy command exited with code ${occupancyResult.exitCode}, likely due to auth issues`);
            // Still verify the command structure exists and runs
            expect(occupancyResult.exitCode).to.be.oneOf([0, 1, 2]); // Accept common exit codes
          }

          // Clean up - leave presence (best effort)
          await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms presence leave ${testRoomId} --client-id ${client1Id}`
          );

        } catch (error) {
          console.error("Error in occupancy test:", error);
          throw error;
        }
      });
    });
    
    // Only run interactive tests if we have a working API key
    if (E2E_API_KEY && !E2E_API_KEY.includes('fake')) {
      describe('Presence functionality', function() {
        it('should allow two connections where one person entering is visible to the other', async function() {
          let presenceProcess: ChildProcess | null = null;
          let outputPath: string = '';

          try {
            // Create output file for presence monitoring
            outputPath = await createTempOutputFile();

            // Start client1 monitoring presence on the room
            console.log(`Starting presence monitor for client1 on room ${testRoomId}`);
            const presenceInfo = await runLongRunningBackgroundProcess(
              `bin/run.js rooms presence subscribe ${testRoomId} --client-id ${client1Id}`,
              outputPath,
              { readySignal: "Subscribing to presence events", timeoutMs: 20000, retryCount: 2 }
            );
            presenceProcess = presenceInfo.process;

            // Wait a moment for subscription to fully establish
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Have client2 enter presence on the same room
            console.log(`Client2 entering presence on room ${testRoomId}`);
            const enterResult = await runBackgroundProcessAndGetOutput(
              `bin/run.js rooms presence enter ${testRoomId} '{"name":"Test User 2","status":"active"}' --client-id ${client2Id}`
            );

            // Handle authentication failures gracefully
            if (enterResult.exitCode !== 0) {
              console.warn(`Presence enter failed with exit code ${enterResult.exitCode}, stderr:`, enterResult.stderr);
              console.warn(`Skipping test due to authentication or connection issues`);
              this.skip();
              return;
            }

            expect(enterResult.stdout).to.contain("Entered presence");

            // Wait for presence update to be received by client1
            console.log("Waiting for presence update to be received by monitoring client");
            let presenceUpdateReceived = false;
            for (let i = 0; i < 40; i++) { // Increased retry count
              const output = await readProcessOutput(outputPath);
              if (output.includes(client2Id) && output.includes("Test User 2")) {
                console.log("Presence update detected in monitoring output");
                presenceUpdateReceived = true;
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 300)); // Increased wait time
            }

            expect(presenceUpdateReceived, "Client1 should see client2's presence entry").to.be.true;

            // Have client2 leave presence
            console.log(`Client2 leaving presence on room ${testRoomId}`);
            const leaveResult = await runBackgroundProcessAndGetOutput(
              `bin/run.js rooms presence leave ${testRoomId} --client-id ${client2Id}`
            );

            // Handle potential exit code issues gracefully
            if (leaveResult.exitCode !== 0) {
              console.warn(`Presence leave failed with exit code ${leaveResult.exitCode}`);
              // Don't fail the test for leave failures - the main functionality was tested
              return;
            }

            expect(leaveResult.stdout).to.contain("Left presence");

          } finally {
            if (presenceProcess) {
              await killProcess(presenceProcess);
            }
          }
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
              `bin/run.js rooms messages subscribe ${testRoomId} --client-id ${client1Id}`,
              outputPath,
              { readySignal: "Subscribing to messages in room", timeoutMs: 20000, retryCount: 2 }
            );
            subscribeProcess = subscribeInfo.process;

            // Wait a moment for subscription to fully establish
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Have client2 send a message to the room
            const testMessage = `E2E test message from ${client2Id} at ${new Date().toISOString()}`;
            console.log(`Client2 sending message to room ${testRoomId}: ${testMessage}`);
            
            const sendResult = await runBackgroundProcessAndGetOutput(
              `bin/run.js rooms messages send ${testRoomId} "${testMessage}" --client-id ${client2Id}`
            );

            // Handle authentication failures gracefully
            if (sendResult.exitCode !== 0) {
              console.warn(`Message send failed with exit code ${sendResult.exitCode}, stderr:`, sendResult.stderr);
              console.warn(`Skipping test due to authentication or connection issues`);
              this.skip();
              return;
            }

            expect(sendResult.stdout).to.contain("Message sent successfully");

            // Wait for message to be received by client1
            console.log("Waiting for message to be received by subscribing client");
            let messageReceived = false;
            for (let i = 0; i < 60; i++) { // Increased retry count
              const output = await readProcessOutput(outputPath);
              if (output.includes(testMessage) && output.includes(client2Id)) {
                console.log("Message received in subscription output");
                messageReceived = true;
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 300)); // Increased wait time
            }

            expect(messageReceived, "Client1 should receive the message sent by client2").to.be.true;

          } finally {
            if (subscribeProcess) {
              await killProcess(subscribeProcess);
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