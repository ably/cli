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
    // Apply standard E2E setup
    before(function() {
      applyE2ETestSetup();
    });

    let testRoomId: string;
    let client1Id: string;
    let client2Id: string;

    beforeEach(function() {
      testRoomId = getUniqueChannelName("room");
      client1Id = getUniqueClientId("client1");
      client2Id = getUniqueClientId("client2");
      console.log(`Test setup: Room=${testRoomId}, Client1=${client1Id}, Client2=${client2Id}`);
    });

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
            { readySignal: "Subscribing to presence updates", timeoutMs: 15000 }
          );
          presenceProcess = presenceInfo.process;

          // Wait a moment for subscription to fully establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Have client2 enter presence on the same room
          console.log(`Client2 entering presence on room ${testRoomId}`);
          const enterResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms presence enter ${testRoomId} '{"name":"Test User 2","status":"active"}' --client-id ${client2Id}`
          );

          expect(enterResult.exitCode).to.equal(0);
          expect(enterResult.stdout).to.contain("Entered presence");

          // Wait for presence update to be received by client1
          console.log("Waiting for presence update to be received by monitoring client");
          let presenceUpdateReceived = false;
          for (let i = 0; i < 40; i++) { // ~6 seconds polling
            const output = await readProcessOutput(outputPath);
            if (output.includes(client2Id) && output.includes("Test User 2")) {
              console.log("Presence update detected in monitoring output");
              presenceUpdateReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(presenceUpdateReceived, "Client1 should see client2's presence entry").to.be.true;

          // Have client2 leave presence
          console.log(`Client2 leaving presence on room ${testRoomId}`);
          const leaveResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms presence leave ${testRoomId} --client-id ${client2Id}`
          );

          expect(leaveResult.exitCode).to.equal(0);
          expect(leaveResult.stdout).to.contain("Left presence");

          // Wait for presence leave to be received by client1
          console.log("Waiting for presence leave to be received by monitoring client");
          let presenceLeaveReceived = false;
          for (let i = 0; i < 40; i++) { // ~6 seconds polling
            const output = await readProcessOutput(outputPath);
            if (output.includes(client2Id) && (output.includes("left") || output.includes("leave"))) {
              console.log("Presence leave detected in monitoring output");
              presenceLeaveReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(presenceLeaveReceived, "Client1 should see client2's presence leave").to.be.true;

        } finally {
          if (presenceProcess) {
            killProcess(presenceProcess);
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
            { readySignal: "Subscribing to messages", timeoutMs: 15000 }
          );
          subscribeProcess = subscribeInfo.process;

          // Wait a moment for subscription to fully establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Have client2 send a message to the room
          const testMessage = `E2E test message from ${client2Id} at ${new Date().toISOString()}`;
          console.log(`Client2 sending message to room ${testRoomId}: ${testMessage}`);
          
          const sendResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms messages send ${testRoomId} "${testMessage}" --client-id ${client2Id}`
          );

          expect(sendResult.exitCode).to.equal(0);
          expect(sendResult.stdout).to.contain("Message sent successfully");

          // Wait for message to be received by client1
          console.log("Waiting for message to be received by subscribing client");
          let messageReceived = false;
          for (let i = 0; i < 50; i++) { // ~7.5 seconds polling
            const output = await readProcessOutput(outputPath);
            if (output.includes(testMessage) && output.includes(client2Id)) {
              console.log("Message received in subscription output");
              messageReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(messageReceived, "Client1 should receive the message sent by client2").to.be.true;

          // Send another message to verify continuous functionality
          const secondMessage = `Second E2E test message from ${client2Id}`;
          console.log(`Client2 sending second message: ${secondMessage}`);
          
          const secondSendResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms messages send ${testRoomId} "${secondMessage}" --client-id ${client2Id}`
          );

          expect(secondSendResult.exitCode).to.equal(0);

          // Wait for second message
          let secondMessageReceived = false;
          for (let i = 0; i < 50; i++) {
            const output = await readProcessOutput(outputPath);
            if (output.includes(secondMessage)) {
              console.log("Second message received in subscription output");
              secondMessageReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(secondMessageReceived, "Client1 should receive the second message").to.be.true;

        } finally {
          if (subscribeProcess) {
            killProcess(subscribeProcess);
          }
        }
      });
    });

    describe('Reactions functionality', function() {
      it('should allow sending reactions and receiving them via subscription', async function() {
        let reactionsProcess: ChildProcess | null = null;
        let outputPath: string = '';

        try {
          // Create output file for reactions monitoring
          outputPath = await createTempOutputFile();

          // Start client1 subscribing to reactions on the room
          console.log(`Starting reactions subscription for client1 on room ${testRoomId}`);
          const reactionsInfo = await runLongRunningBackgroundProcess(
            `bin/run.js rooms reactions subscribe ${testRoomId} --client-id ${client1Id}`,
            outputPath,
            { readySignal: "Subscribing to reactions", timeoutMs: 15000 }
          );
          reactionsProcess = reactionsInfo.process;

          // Wait a moment for subscription to fully establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Have client2 send a reaction
          const emoji = "👍";
          console.log(`Client2 sending reaction ${emoji} to room ${testRoomId}`);
          
          const reactionResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms reactions send ${testRoomId} "${emoji}" --client-id ${client2Id}`
          );

          expect(reactionResult.exitCode).to.equal(0);
          expect(reactionResult.stdout).to.contain("Reaction sent successfully");

          // Wait for reaction to be received by client1
          console.log("Waiting for reaction to be received by subscribing client");
          let reactionReceived = false;
          for (let i = 0; i < 50; i++) { // ~7.5 seconds polling
            const output = await readProcessOutput(outputPath);
            if (output.includes(emoji) && output.includes(client2Id)) {
              console.log("Reaction received in subscription output");
              reactionReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(reactionReceived, "Client1 should receive the reaction sent by client2").to.be.true;

          // Send a different reaction to verify multiple reactions work
          const secondEmoji = "❤️";
          console.log(`Client2 sending second reaction ${secondEmoji}`);
          
          const secondReactionResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms reactions send ${testRoomId} "${secondEmoji}" --client-id ${client2Id}`
          );

          expect(secondReactionResult.exitCode).to.equal(0);

          // Wait for second reaction
          let secondReactionReceived = false;
          for (let i = 0; i < 50; i++) {
            const output = await readProcessOutput(outputPath);
            if (output.includes(secondEmoji)) {
              console.log("Second reaction received in subscription output");
              secondReactionReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(secondReactionReceived, "Client1 should receive the second reaction").to.be.true;

        } finally {
          if (reactionsProcess) {
            killProcess(reactionsProcess);
          }
        }
      });
    });

    describe('Typing indicators functionality', function() {
      it('should allow sending typing indicators and receiving them via subscription', async function() {
        let typingProcess: ChildProcess | null = null;
        let outputPath: string = '';

        try {
          // Create output file for typing monitoring
          outputPath = await createTempOutputFile();

          // Start client1 subscribing to typing indicators on the room
          console.log(`Starting typing subscription for client1 on room ${testRoomId}`);
          const typingInfo = await runLongRunningBackgroundProcess(
            `bin/run.js rooms typing subscribe ${testRoomId} --client-id ${client1Id}`,
            outputPath,
            { readySignal: "Subscribing to typing events", timeoutMs: 15000 }
          );
          typingProcess = typingInfo.process;

          // Wait a moment for subscription to fully establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Have client2 start typing
          console.log(`Client2 starting typing in room ${testRoomId}`);
          
          const typingResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms typing keystroke ${testRoomId} --client-id ${client2Id}`
          );

          expect(typingResult.exitCode).to.equal(0);
          expect(typingResult.stdout).to.contain("Typing indicator started");

          // Wait for typing indicator to be received by client1
          console.log("Waiting for typing indicator to be received by subscribing client");
          let typingReceived = false;
          for (let i = 0; i < 50; i++) { // ~7.5 seconds polling
            const output = await readProcessOutput(outputPath);
            if (output.includes(client2Id) && (output.includes("typing") || output.includes("start"))) {
              console.log("Typing indicator received in subscription output");
              typingReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(typingReceived, "Client1 should receive typing indicator from client2").to.be.true;

        } finally {
          if (typingProcess) {
            killProcess(typingProcess);
          }
        }
      });
    });

    describe('Room occupancy functionality', function() {
      it('should show occupancy metrics for active room', async function() {
        try {
          // First, have client1 enter the room (via presence)
          console.log(`Client1 entering presence to establish room occupancy`);
          const enterResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms presence enter ${testRoomId} '{"name":"Test User 1"}' --client-id ${client1Id}`
          );

          expect(enterResult.exitCode).to.equal(0);

          // Wait a moment for presence to establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Check occupancy metrics
          console.log(`Checking occupancy metrics for room ${testRoomId}`);
          const occupancyResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms occupancy get ${testRoomId}`
          );

          expect(occupancyResult.exitCode).to.equal(0);
          expect(occupancyResult.stdout).to.contain("Connections:");
          expect(occupancyResult.stdout).to.contain("Publishers:");
          expect(occupancyResult.stdout).to.contain("Subscribers:");

          // Clean up - leave presence
          await runBackgroundProcessAndGetOutput(
            `bin/run.js rooms presence leave ${testRoomId} --client-id ${client1Id}`
          );

        } catch (error) {
          console.error("Error in occupancy test:", error);
          throw error;
        }
      });
    });
  });
}