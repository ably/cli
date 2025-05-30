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
skipTestsIfNeeded('Spaces E2E Tests');

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Spaces E2E Tests', function() {
    // Apply standard E2E setup
    before(function() {
      applyE2ETestSetup();
    });

    let testSpaceId: string;
    let client1Id: string;
    let client2Id: string;

    beforeEach(function() {
      testSpaceId = getUniqueChannelName("space");
      client1Id = getUniqueClientId("client1");
      client2Id = getUniqueClientId("client2");
      console.log(`Test setup: Space=${testSpaceId}, Client1=${client1Id}, Client2=${client2Id}`);
    });

    describe('Members presence functionality', function() {
      it('should allow two connections where one person entering is visible to the other', async function() {
        let membersProcess: ChildProcess | null = null;
        let outputPath: string = '';

        try {
          // Create output file for members monitoring
          outputPath = await createTempOutputFile();

          // Start client1 monitoring members in the space
          console.log(`Starting members monitor for client1 on space ${testSpaceId}`);
          const membersInfo = await runLongRunningBackgroundProcess(
            `bin/run.js spaces members subscribe ${testSpaceId} --client-id ${client1Id}`,
            outputPath,
            { readySignal: "Subscribing to member updates", timeoutMs: 15000 }
          );
          membersProcess = membersInfo.process;

          // Wait a moment for subscription to fully establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Have client2 enter the space
          console.log(`Client2 entering space ${testSpaceId}`);
          const enterResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Test User 2","role":"collaborator","department":"E2E Testing"}' --client-id ${client2Id}`
          );

          expect(enterResult.exitCode).to.equal(0);
          expect(enterResult.stdout).to.contain("Successfully entered space");

          // Wait for member update to be received by client1
          console.log("Waiting for member update to be received by monitoring client");
          let memberUpdateReceived = false;
          for (let i = 0; i < 40; i++) { // ~6 seconds polling
            const output = await readProcessOutput(outputPath);
            if (output.includes(client2Id) && output.includes("Test User 2")) {
              console.log("Member update detected in monitoring output");
              memberUpdateReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(memberUpdateReceived, "Client1 should see client2's space entry").to.be.true;

          // Have client2 leave the space
          console.log(`Client2 leaving space ${testSpaceId}`);
          const leaveResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members leave ${testSpaceId} --client-id ${client2Id}`
          );

          expect(leaveResult.exitCode).to.equal(0);
          expect(leaveResult.stdout).to.contain("Successfully left space");

          // Wait for member leave to be received by client1
          console.log("Waiting for member leave to be received by monitoring client");
          let memberLeaveReceived = false;
          for (let i = 0; i < 40; i++) { // ~6 seconds polling
            const output = await readProcessOutput(outputPath);
            if (output.includes(client2Id) && (output.includes("left") || output.includes("leave") || output.includes("removed"))) {
              console.log("Member leave detected in monitoring output");
              memberLeaveReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(memberLeaveReceived, "Client1 should see client2's space leave").to.be.true;

        } finally {
          if (membersProcess) {
            killProcess(membersProcess);
          }
        }
      });
    });

    describe('Location state synchronization', function() {
      it('should synchronize location updates between clients', async function() {
        let locationsProcess: ChildProcess | null = null;
        let outputPath: string = '';

        try {
          // Create output file for locations monitoring
          outputPath = await createTempOutputFile();

          // First, have both clients enter the space
          console.log(`Both clients entering space ${testSpaceId}`);
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 1"}' --client-id ${client1Id}`
          );
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 2"}' --client-id ${client2Id}`
          );

          // Wait for entries to establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Start client1 monitoring locations in the space
          console.log(`Starting locations monitor for client1 on space ${testSpaceId}`);
          const locationsInfo = await runLongRunningBackgroundProcess(
            `bin/run.js spaces locations subscribe ${testSpaceId} --client-id ${client1Id}`,
            outputPath,
            { readySignal: "Subscribing to location updates", timeoutMs: 15000 }
          );
          locationsProcess = locationsInfo.process;

          // Wait a moment for subscription to fully establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Have client2 update their location
          const locationData = {
            x: 100,
            y: 200,
            page: "dashboard",
            section: "analytics",
            viewport: { zoom: 1.5, width: 1920, height: 1080 }
          };
          
          console.log(`Client2 setting location in space ${testSpaceId}`);
          const setLocationResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locations set ${testSpaceId} --location '${JSON.stringify(locationData)}' --client-id ${client2Id}`
          );

          expect(setLocationResult.exitCode).to.equal(0);
          expect(setLocationResult.stdout).to.contain("Location set successfully");

          // Wait for location update to be received by client1
          console.log("Waiting for location update to be received by monitoring client");
          let locationUpdateReceived = false;
          for (let i = 0; i < 50; i++) { // ~7.5 seconds polling
            const output = await readProcessOutput(outputPath);
            if (output.includes(client2Id) && output.includes("dashboard") && output.includes("analytics")) {
              console.log("Location update detected in monitoring output");
              locationUpdateReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(locationUpdateReceived, "Client1 should receive location update from client2").to.be.true;

          // Update location again to test continuous synchronization
          const newLocationData = {
            x: 300,
            y: 400,
            page: "editor",
            section: "code-panel"
          };

          console.log(`Client2 updating location again`);
          const updateLocationResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locations set ${testSpaceId} --location '${JSON.stringify(newLocationData)}' --client-id ${client2Id}`
          );

          expect(updateLocationResult.exitCode).to.equal(0);

          // Wait for second location update
          let secondLocationUpdateReceived = false;
          for (let i = 0; i < 50; i++) {
            const output = await readProcessOutput(outputPath);
            if (output.includes("editor") && output.includes("code-panel")) {
              console.log("Second location update detected in monitoring output");
              secondLocationUpdateReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(secondLocationUpdateReceived, "Client1 should receive second location update").to.be.true;

        } finally {
          if (locationsProcess) {
            killProcess(locationsProcess);
          }
        }
      });
    });

    describe('Cursor state synchronization', function() {
      it('should synchronize cursor updates between clients', async function() {
        let cursorsProcess: ChildProcess | null = null;
        let outputPath: string = '';

        try {
          // Create output file for cursors monitoring
          outputPath = await createTempOutputFile();

          // First, have both clients enter the space
          console.log(`Both clients entering space ${testSpaceId}`);
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 1"}' --client-id ${client1Id}`
          );
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 2"}' --client-id ${client2Id}`
          );

          // Wait for entries to establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Start client1 monitoring cursors in the space
          console.log(`Starting cursors monitor for client1 on space ${testSpaceId}`);
          const cursorsInfo = await runLongRunningBackgroundProcess(
            `bin/run.js spaces cursors subscribe ${testSpaceId} --client-id ${client1Id}`,
            outputPath,
            { readySignal: "Subscribing to cursor updates", timeoutMs: 15000 }
          );
          cursorsProcess = cursorsInfo.process;

          // Wait a moment for subscription to fully establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Have client2 update their cursor position
          const cursorPosition = { x: 250, y: 350 };
          const cursorData = {
            color: "blue",
            tool: "text-cursor",
            isActive: true,
            timestamp: Date.now()
          };
          
          console.log(`Client2 setting cursor in space ${testSpaceId}`);
          const setCursorResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces cursors set ${testSpaceId} --position '${JSON.stringify(cursorPosition)}' --data '${JSON.stringify(cursorData)}' --client-id ${client2Id}`
          );

          expect(setCursorResult.exitCode).to.equal(0);
          expect(setCursorResult.stdout).to.contain("Cursor position set");

          // Wait for cursor update to be received by client1
          console.log("Waiting for cursor update to be received by monitoring client");
          let cursorUpdateReceived = false;
          for (let i = 0; i < 50; i++) { // ~7.5 seconds polling
            const output = await readProcessOutput(outputPath);
            if (output.includes(client2Id) && output.includes("blue") && output.includes("text-cursor")) {
              console.log("Cursor update detected in monitoring output");
              cursorUpdateReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(cursorUpdateReceived, "Client1 should receive cursor update from client2").to.be.true;

        } finally {
          if (cursorsProcess) {
            killProcess(cursorsProcess);
          }
        }
      });
    });

    describe('Locks synchronization', function() {
      it('should synchronize lock acquisition and release between clients', async function() {
        let locksProcess: ChildProcess | null = null;
        let outputPath: string = '';

        try {
          // Create output file for locks monitoring
          outputPath = await createTempOutputFile();

          // First, have both clients enter the space
          console.log(`Both clients entering space ${testSpaceId}`);
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 1"}' --client-id ${client1Id}`
          );
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 2"}' --client-id ${client2Id}`
          );

          // Wait for entries to establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Start client1 monitoring locks in the space
          console.log(`Starting locks monitor for client1 on space ${testSpaceId}`);
          const locksInfo = await runLongRunningBackgroundProcess(
            `bin/run.js spaces locks subscribe ${testSpaceId} --client-id ${client1Id}`,
            outputPath,
            { readySignal: "Subscribing to lock updates", timeoutMs: 15000 }
          );
          locksProcess = locksInfo.process;

          // Wait a moment for subscription to fully establish
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Have client2 acquire a lock
          const lockId = "document-section-1";
          const lockAttributes = {
            operation: "editing",
            priority: "high",
            timeout: 30000,
            reason: "E2E testing lock acquisition"
          };
          
          console.log(`Client2 acquiring lock ${lockId} in space ${testSpaceId}`);
          const acquireLockResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locks acquire ${testSpaceId} ${lockId} --attributes '${JSON.stringify(lockAttributes)}' --client-id ${client2Id}`
          );

          expect(acquireLockResult.exitCode).to.equal(0);
          expect(acquireLockResult.stdout).to.contain("Lock acquired successfully");

          // Wait for lock acquisition to be received by client1
          console.log("Waiting for lock acquisition to be received by monitoring client");
          let lockAcquiredReceived = false;
          for (let i = 0; i < 50; i++) { // ~7.5 seconds polling
            const output = await readProcessOutput(outputPath);
            if (output.includes(lockId) && output.includes(client2Id) && (output.includes("acquired") || output.includes("editing"))) {
              console.log("Lock acquisition detected in monitoring output");
              lockAcquiredReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(lockAcquiredReceived, "Client1 should receive lock acquisition from client2").to.be.true;

          // Have client2 release the lock
          console.log(`Client2 releasing lock ${lockId}`);
          const releaseLockResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locks release ${testSpaceId} ${lockId} --client-id ${client2Id}`
          );

          expect(releaseLockResult.exitCode).to.equal(0);
          expect(releaseLockResult.stdout).to.contain("Lock released successfully");

          // Wait for lock release to be received by client1
          console.log("Waiting for lock release to be received by monitoring client");
          let lockReleasedReceived = false;
          for (let i = 0; i < 50; i++) {
            const output = await readProcessOutput(outputPath);
            if (output.includes(lockId) && (output.includes("released") || output.includes("unlocked"))) {
              console.log("Lock release detected in monitoring output");
              lockReleasedReceived = true;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
          }

          expect(lockReleasedReceived, "Client1 should receive lock release notification").to.be.true;

        } finally {
          if (locksProcess) {
            killProcess(locksProcess);
          }
        }
      });
    });

    describe('Space state retrieval', function() {
      it('should retrieve current state of members, locations, cursors, and locks', async function() {
        try {
          // Set up initial state - have clients enter and set various states
          console.log(`Setting up initial space state for ${testSpaceId}`);
          
          // Client1 enters with profile
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"State Tester 1","role":"admin"}' --client-id ${client1Id}`
          );

          // Client2 enters with profile
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"State Tester 2","role":"user"}' --client-id ${client2Id}`
          );

          // Set locations for both clients
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locations set ${testSpaceId} --location '{"x":100,"y":200,"page":"home"}' --client-id ${client1Id}`
          );
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locations set ${testSpaceId} --location '{"x":300,"y":400,"page":"settings"}' --client-id ${client2Id}`
          );

          // Set cursors for both clients
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces cursors set ${testSpaceId} --position '{"x":150,"y":250}' --data '{"color":"red"}' --client-id ${client1Id}`
          );
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces cursors set ${testSpaceId} --position '{"x":350,"y":450}' --data '{"color":"green"}' --client-id ${client2Id}`
          );

          // Acquire a lock
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locks acquire ${testSpaceId} "test-lock" --attributes '{"type":"test"}' --client-id ${client1Id}`
          );

          // Wait for state to establish
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Retrieve all members
          console.log("Retrieving all members");
          const membersResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members get-all ${testSpaceId}`
          );

          expect(membersResult.exitCode).to.equal(0);
          expect(membersResult.stdout).to.contain("State Tester 1");
          expect(membersResult.stdout).to.contain("State Tester 2");

          // Retrieve all locations
          console.log("Retrieving all locations");
          const locationsResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locations get-all ${testSpaceId}`
          );

          expect(locationsResult.exitCode).to.equal(0);
          expect(locationsResult.stdout).to.contain("home");
          expect(locationsResult.stdout).to.contain("settings");

          // Retrieve all cursors
          console.log("Retrieving all cursors");
          const cursorsResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces cursors get-all ${testSpaceId}`
          );

          expect(cursorsResult.exitCode).to.equal(0);
          expect(cursorsResult.stdout).to.contain("red");
          expect(cursorsResult.stdout).to.contain("green");

          // Retrieve all locks
          console.log("Retrieving all locks");
          const locksResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locks get-all ${testSpaceId}`
          );

          expect(locksResult.exitCode).to.equal(0);
          expect(locksResult.stdout).to.contain("test-lock");

          // Clean up - release lock and leave space
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locks release ${testSpaceId} "test-lock" --client-id ${client1Id}`
          );
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members leave ${testSpaceId} --client-id ${client1Id}`
          );
          await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members leave ${testSpaceId} --client-id ${client2Id}`
          );

        } catch (error) {
          console.error("Error in space state retrieval test:", error);
          throw error;
        }
      });
    });
  });
}