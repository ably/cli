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
    // Apply standard E2E setup with increased timeout for E2E tests
    before(function() {
      applyE2ETestSetup();
    });

    // Set timeout for E2E tests - increased for CI environments
    this.timeout(process.env.CI ? 45000 : 25000); // 45s for CI, 25s locally

    let testSpaceId: string;
    let client1Id: string;
    let client2Id: string;

    beforeEach(function() {
      testSpaceId = getUniqueChannelName("space");
      client1Id = getUniqueClientId("client1");
      client2Id = getUniqueClientId("client2");
      console.log(`Test setup: Space=${testSpaceId}, Client1=${client1Id}, Client2=${client2Id}`);
    });

    // Only run interactive tests if we have a working API key
    if (E2E_API_KEY && !E2E_API_KEY.includes('fake')) {
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
              `bin/run.js spaces members subscribe ${testSpaceId} --client-id ${client1Id} --duration 15`,
              outputPath,
              { 
                readySignal: "Subscribing to member updates", 
                timeoutMs: process.env.CI ? 20000 : 15000, // Increased local timeout
                retryCount: 2 
              }
            );
            membersProcess = membersInfo.process;

            // Wait a moment for subscription to fully establish
            const setupWait = process.env.CI ? 3000 : 1000;
            await new Promise(resolve => setTimeout(resolve, setupWait));

            // Have client2 enter the space (this is likely a long-running command too)
            console.log(`Client2 entering space ${testSpaceId}`);
            const client2OutputPath = await createTempOutputFile();
            const client2SpaceInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Test User 2","role":"collaborator","department":"E2E Testing"}' --client-id ${client2Id} --duration 12`,
              client2OutputPath,
              { 
                readySignal: "Successfully entered space:", 
                timeoutMs: process.env.CI ? 20000 : 15000, // Increased local timeout
                retryCount: 2 
              }
            );
            const client2Process = client2SpaceInfo.process;

            // Wait for member update to be received by client1
            console.log("Waiting for member update to be received by monitoring client");
            let memberUpdateReceived = false;
            const maxAttempts = process.env.CI ? 25 : 15; // More attempts for CI
            
            for (let i = 0; i < maxAttempts; i++) { 
              const output = await readProcessOutput(outputPath);
              if (output.includes(client2Id) && output.includes("Test User 2")) {
                console.log("Member update detected in monitoring output");
                memberUpdateReceived = true;
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 200));
            }

            expect(memberUpdateReceived, "Client1 should see client2's space entry").to.be.true;

            // Clean up client2 space process (killing it will trigger leave)
            await killProcess(client2Process);

            // Wait for leave event to be processed
            await new Promise(resolve => setTimeout(resolve, 1000));

          } finally {
            if (membersProcess) {
              await killProcess(membersProcess);
            }
          }
        });
      });

      describe('Location state synchronization', function() {
        it('should synchronize location updates between clients', async function() {
          let locationsProcess: ChildProcess | null = null;
          let client1SpaceProcess: ChildProcess | null = null;
          let client2SpaceProcess: ChildProcess | null = null;
          let outputPath: string = '';

          try {
            // Create output file for locations monitoring
            outputPath = await createTempOutputFile();

            // First, have both clients enter the space (long-running commands)
            console.log(`[Test Debug] Both clients entering space ${testSpaceId}`);
            const client1OutputPath = await createTempOutputFile();
            const client2OutputPath = await createTempOutputFile();
            
            console.log(`[Test Debug] Client1 entering with command: bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 1"}' --client-id ${client1Id} --duration 20`);
            const client1SpaceInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 1"}' --client-id ${client1Id} --duration 20`,
              client1OutputPath,
              { 
                readySignal: "Successfully entered space:", 
                timeoutMs: process.env.CI ? 20000 : 15000,
                retryCount: 2 
              }
            );
            client1SpaceProcess = client1SpaceInfo.process;
            console.log(`[Test Debug] Client1 space process started with PID: ${client1SpaceInfo.processId}`);
            
            console.log(`[Test Debug] Client2 entering with command: bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 2"}' --client-id ${client2Id} --duration 20`);
            const client2SpaceInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 2"}' --client-id ${client2Id} --duration 20`,
              client2OutputPath,
              { 
                readySignal: "Successfully entered space:", 
                timeoutMs: process.env.CI ? 20000 : 15000,
                retryCount: 2 
              }
            );
            client2SpaceProcess = client2SpaceInfo.process;
            console.log(`[Test Debug] Client2 space process started with PID: ${client2SpaceInfo.processId}`);

            // Wait for entries to establish
            const entriesWait = process.env.CI ? 3000 : 1000;
            console.log(`[Test Debug] Waiting ${entriesWait}ms for entries to establish`);
            await new Promise(resolve => setTimeout(resolve, entriesWait));

            // Subscribe to location updates on the space with client1 
            console.log(`[Test Debug] Starting location subscribe for client1 on space ${testSpaceId}`);
            const locationsInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces locations subscribe ${testSpaceId} --client-id ${client1Id} --duration 20`,
              outputPath,
              { 
                readySignal: "Fetching current locations for space", 
                timeoutMs: process.env.CI ? 40000 : 30000, // Increased timeout
                retryCount: 2 
              }
            );
            locationsProcess = locationsInfo.process;

            // Wait a moment for subscription to fully establish
            const subscriptionWait = process.env.CI ? 3000 : 1000;
            console.log(`[Test Debug] Waiting ${subscriptionWait}ms for subscription to establish`);
            await new Promise(resolve => setTimeout(resolve, subscriptionWait));

            // Have client2 update their location
            const locationData = {
              x: 100,
              y: 200,
              page: "dashboard",
              section: "analytics",
              viewport: { zoom: 1.5, width: 1920, height: 1080 }
            };
            
            console.log(`[Test Debug] Client2 setting location in space ${testSpaceId}`);
            console.log(`[Test Debug] Location data: ${JSON.stringify(locationData)}`);
            const setLocationResult = await runBackgroundProcessAndGetOutput(
              `bin/run.js spaces locations set ${testSpaceId} --location '${JSON.stringify(locationData)}' --client-id ${client2Id}`,
              process.env.CI ? 15000 : 15000 // Increased local timeout
            );

            console.log(`[Test Debug] Set location result - exitCode: ${setLocationResult.exitCode}`);
            console.log(`[Test Debug] Set location result - stdout: ${setLocationResult.stdout}`);
            console.log(`[Test Debug] Set location result - stderr: ${setLocationResult.stderr}`);

            expect(setLocationResult.exitCode).to.equal(0);
            expect(setLocationResult.stdout).to.contain("Successfully set location");

            // Wait for location update to be received by client1
            console.log("[Test Debug] Waiting for location update to be received by monitoring client");
            let locationUpdateReceived = false;
            const maxAttempts = process.env.CI ? 25 : 15; // More attempts for CI
            
            for (let i = 0; i < maxAttempts; i++) { 
              const output = await readProcessOutput(outputPath);
              console.log(`[Test Debug] Attempt ${i+1}/${maxAttempts}, output length: ${output.length}`);
              
              if (i % 5 === 0 && output.length > 0) {
                console.log(`[Test Debug] Output sample (last 500 chars): ${output.slice(-500)}`);
              }
              
              if (output.includes(client2Id) && output.includes("dashboard") && output.includes("analytics")) {
                console.log("[Test Debug] Location update detected in monitoring output");
                locationUpdateReceived = true;
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 200));
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
              `bin/run.js spaces locations set ${testSpaceId} --location '${JSON.stringify(newLocationData)}' --client-id ${client2Id}`,
              process.env.CI ? 15000 : 15000 // Increased local timeout
            );

            expect(updateLocationResult.exitCode).to.equal(0);

            // Wait for second location update
            let secondLocationUpdateReceived = false;
            for (let i = 0; i < maxAttempts; i++) { 
              const output = await readProcessOutput(outputPath);
              if (output.includes("editor") && output.includes("code-panel")) {
                console.log("Second location update detected in monitoring output");
                secondLocationUpdateReceived = true;
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 200));
            }

            expect(secondLocationUpdateReceived, "Client1 should receive second location update").to.be.true;

          } finally {
            if (locationsProcess) {
              await killProcess(locationsProcess);
            }
            if (client1SpaceProcess) {
              await killProcess(client1SpaceProcess);
            }
            if (client2SpaceProcess) {
              await killProcess(client2SpaceProcess);
            }
          }
        });
      });

      describe('Cursor state synchronization', function() {
        it('should synchronize cursor updates between clients', async function() {
          let cursorsProcess: ChildProcess | null = null;
          let client1SpaceProcess: ChildProcess | null = null;
          let client2SpaceProcess: ChildProcess | null = null;
          let outputPath: string = '';

          try {
            // Create output file for cursors monitoring
            outputPath = await createTempOutputFile();

            // First, have both clients enter the space (long-running commands)
            console.log(`[Test Debug] Both clients entering space ${testSpaceId}`);
            const client1OutputPath = await createTempOutputFile();
            const client2OutputPath = await createTempOutputFile();
            
            console.log(`[Test Debug] Client1 entering with command: bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 1"}' --client-id ${client1Id} --duration 20`);
            const client1SpaceInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 1"}' --client-id ${client1Id} --duration 20`,
              client1OutputPath,
              { 
                readySignal: "Successfully entered space:", 
                timeoutMs: process.env.CI ? 20000 : 15000,
                retryCount: 2 
              }
            );
            client1SpaceProcess = client1SpaceInfo.process;
            console.log(`[Test Debug] Client1 space process started with PID: ${client1SpaceInfo.processId}`);
            
            console.log(`[Test Debug] Client2 entering with command: bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 2"}' --client-id ${client2Id} --duration 20`);
            const client2SpaceInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 2"}' --client-id ${client2Id} --duration 20`,
              client2OutputPath,
              { 
                readySignal: "Successfully entered space:", 
                timeoutMs: process.env.CI ? 20000 : 15000,
                retryCount: 2 
              }
            );
            client2SpaceProcess = client2SpaceInfo.process;
            console.log(`[Test Debug] Client2 space process started with PID: ${client2SpaceInfo.processId}`);

            // Wait for entries to establish
            const setupWait = process.env.CI ? 3000 : 1000;
            console.log(`[Test Debug] Waiting ${setupWait}ms for entries to establish`);
            await new Promise(resolve => setTimeout(resolve, setupWait));

            // Start client1 monitoring cursors in the space
            console.log(`[Test Debug] Starting cursors monitor for client1 on space ${testSpaceId}`);
            const cursorsInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces cursors subscribe ${testSpaceId} --client-id ${client1Id} --duration 20`,
              outputPath,
              { 
                readySignal: "Subscribing to cursor movements. Press Ctrl+C to exit.", 
                timeoutMs: process.env.CI ? 45000 : 30000, // Increased timeout
                retryCount: 2 
              }
            );
            cursorsProcess = cursorsInfo.process;
            console.log(`[Test Debug] Cursors monitor process started with PID: ${cursorsInfo.processId}`);

            // Wait a moment for subscription to fully establish
            const subscriptionWait = process.env.CI ? 3000 : 1000;
            console.log(`[Test Debug] Waiting ${subscriptionWait}ms for subscription to establish`);
            await new Promise(resolve => setTimeout(resolve, subscriptionWait));

            // Have client2 set a cursor position and data
            const cursorPosition = { x: 100, y: 200 };
            const cursorData = { name: 'TestUser2', color: '#ff0000' };
            console.log(`[Test Debug] Client2 setting cursor at position: ${JSON.stringify(cursorPosition)}`);
            const setCursorResult = await runBackgroundProcessAndGetOutput(
              `bin/run.js spaces cursors set ${testSpaceId} --data '${JSON.stringify({ position: cursorPosition, data: cursorData })}' --client-id ${client2Id}`,
              process.env.CI ? 20000 : 10000
            );

            console.log(`[Test Debug] Set cursor result - exitCode: ${setCursorResult.exitCode}`);
            console.log(`[Test Debug] Set cursor result - stdout: ${setCursorResult.stdout}`);
            console.log(`[Test Debug] Set cursor result - stderr: ${setCursorResult.stderr}`);

            expect(setCursorResult.exitCode).to.equal(0);
            expect(setCursorResult.stdout).to.contain("Set cursor in space");

            // Wait for cursor update to be received by client1
            console.log("[Test Debug] Waiting for cursor update to be received by monitoring client");
            let cursorUpdateReceived = false;
            const maxAttempts = process.env.CI ? 25 : 15; // More attempts for CI
            
            for (let i = 0; i < maxAttempts; i++) { 
              const output = await readProcessOutput(outputPath);
              console.log(`[Test Debug] Attempt ${i+1}/${maxAttempts}, output length: ${output.length}`);
              
              if (i % 5 === 0 && output.length > 0) {
                console.log(`[Test Debug] Output sample (last 500 chars): ${output.slice(-500)}`);
              }
              
              if (output.includes(client2Id) && output.includes("TestUser2") && output.includes("#ff0000")) {
                console.log("[Test Debug] Cursor update detected in monitoring output");
                cursorUpdateReceived = true;
                break;
              }
              await new Promise(resolve => setTimeout(resolve, 200));
            }

            expect(cursorUpdateReceived, "Client1 should receive cursor update from client2").to.be.true;

          } finally {
            if (cursorsProcess) {
              await killProcess(cursorsProcess);
            }
            if (client1SpaceProcess) {
              await killProcess(client1SpaceProcess);
            }
            if (client2SpaceProcess) {
              await killProcess(client2SpaceProcess);
            }
          }
        });
      });

      describe('Locks synchronization', function() {
        it('should synchronize lock acquisition and release between clients', async function() {
          let locksProcess: ChildProcess | null = null;
          let client1SpaceProcess: ChildProcess | null = null;
          let client2SpaceProcess: ChildProcess | null = null;
          let outputPath: string = '';

          try {
            // Create output file for locks monitoring
            outputPath = await createTempOutputFile();

            // First, have both clients enter the space (long-running commands)
            console.log(`Both clients entering space ${testSpaceId}`);
            const client1OutputPath = await createTempOutputFile();
            const client2OutputPath = await createTempOutputFile();
            
            const client1SpaceInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 1"}' --client-id ${client1Id} --duration 20`,
              client1OutputPath,
              { 
                readySignal: "Successfully entered space:", 
                timeoutMs: process.env.CI ? 20000 : 15000,
                retryCount: 2 
              }
            );
            client1SpaceProcess = client1SpaceInfo.process;
            
            const client2SpaceInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces members enter ${testSpaceId} --profile '{"name":"Client 2"}' --client-id ${client2Id} --duration 20`,
              client2OutputPath,
              { 
                readySignal: "Successfully entered space:", 
                timeoutMs: process.env.CI ? 20000 : 15000,
                retryCount: 2 
              }
            );
            client2SpaceProcess = client2SpaceInfo.process;

            // Wait for entries to establish
            const setupWait = process.env.CI ? 3000 : 1000;
            await new Promise(resolve => setTimeout(resolve, setupWait));

            // Start client1 monitoring locks in the space
            console.log(`Starting locks monitor for client1 on space ${testSpaceId}`);
            const locksInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces locks subscribe ${testSpaceId} --client-id ${client1Id} --duration 15`,
              outputPath,
              { 
                readySignal: "Subscribing to lock events", 
                timeoutMs: process.env.CI ? 20000 : 15000, // Increased local timeout
                retryCount: 2
              }
            );
            locksProcess = locksInfo.process;

            // Wait a moment for subscription to fully establish
            const subscriptionWait = process.env.CI ? 3000 : 1000;
            await new Promise(resolve => setTimeout(resolve, subscriptionWait));

            // Have client2 acquire a lock
            const lockId = "document-section-1";
            const lockAttributes = {
              operation: "editing",
              priority: "high",
              timeout: 30000,
              reason: "E2E testing lock acquisition"
            };
            
            console.log(`Client2 acquiring lock ${lockId} in space ${testSpaceId} (long-running)`);
            const lockOutputPath = await createTempOutputFile();
            const acquireLockInfo = await runLongRunningBackgroundProcess(
              `bin/run.js spaces locks acquire ${testSpaceId} ${lockId} --data '${JSON.stringify(lockAttributes)}' --client-id ${client2Id}`,
              lockOutputPath,
              { 
                readySignal: "Successfully acquired lock", 
                timeoutMs: process.env.CI ? 20000 : 15000,
                retryCount: 2 
              }
            );
            const lockProcess = acquireLockInfo.process;

            // Wait for lock acquisition to be received by client1
            console.log("Waiting for lock acquisition to be received by monitoring client");
            let lockAcquiredReceived = false;
            const maxAttempts = process.env.CI ? 40 : 30; // Increased attempts
            
            for (let i = 0; i < maxAttempts; i++) { 
              const output = await readProcessOutput(outputPath);
              // Check for lockId, client2Id, and a status indicating the lock is held (e.g., "locked")
              // The subscriber logs: `  Status: ${lock.status}` and `  Member: ${lock.member?.clientId}`
              if (output.includes(lockId) && output.includes(client2Id) && output.includes("Status: locked")) {
                console.log("[Test Debug] Lock acquisition detected in subscriber output (locked status).");
                lockAcquiredReceived = true;
                break;
              } else if (output.includes(lockId) && output.includes(client2Id) && output.includes("Status: pending")) {
                console.log("[Test Debug] Lock acquisition detected in subscriber output (pending status), will wait for locked.");
                // It's pending, might become locked soon, continue polling but log it.
              } else if (i % 5 === 0 && output.length > 0 && process.env.E2E_DEBUG) {
                console.log(`[Test Debug] Lock acquire poll attempt ${i}/${maxAttempts}. Output (last 300): ${output.slice(-300)}`);
              }
              await new Promise(resolve => setTimeout(resolve, 300)); // Slightly longer poll interval
            }

            expect(lockAcquiredReceived, "Client1 should receive lock acquisition from client2").to.be.true;

            // Release the lock by killing the acquire process
            console.log(`[Test Debug] Client2 releasing lock ${lockId} by terminating process ${lockProcess.pid}`);
            await killProcess(lockProcess);

            // Wait for lock release to be received by client1
            console.log("[Test Debug] Waiting for lock release to be received by subscriber");
            let lockReleasedReceived = false;
            for (let i = 0; i < maxAttempts; i++) { 
              const output = await readProcessOutput(outputPath);
              // Check for lockId and a status like "unlocked" or if the member is no longer client2Id for that lockId
              if (output.includes(lockId) && (output.includes("Status: unlocked") || output.includes("Status: released") || (output.includes(client2Id) && output.includes("leave")) )) {
                console.log("[Test Debug] Lock release detected in subscriber output.");
                lockReleasedReceived = true;
                break;
              } else if (i % 5 === 0 && output.length > 0 && process.env.E2E_DEBUG) {
                console.log(`[Test Debug] Lock release poll attempt ${i}/${maxAttempts}. Output (last 300): ${output.slice(-300)}`);
              }
              await new Promise(resolve => setTimeout(resolve, 300));
            }

            expect(lockReleasedReceived, "Client1 should receive lock release notification").to.be.true;

          } finally {
            if (locksProcess) {
              await killProcess(locksProcess);
            }
            if (client1SpaceProcess) {
              await killProcess(client1SpaceProcess);
            }
            if (client2SpaceProcess) {
              await killProcess(client2SpaceProcess);
            }
          }
        });
      });
    } else {
      describe('Command Structure Tests (No Real API Key)', function() {
        it('should have properly structured spaces member commands', async function() {
          // Test help command to ensure command structure exists
          const helpResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces members subscribe --help`
          );
          expect(helpResult.exitCode).to.equal(0);
          expect(helpResult.stdout).to.contain("Subscribe to member presence events");
        });

        it('should have properly structured spaces location commands', async function() {
          const helpResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locations subscribe --help`
          );
          expect(helpResult.exitCode).to.equal(0);
          expect(helpResult.stdout).to.contain("Subscribe to location updates");
        });

        it('should have properly structured spaces cursor commands', async function() {
          const helpResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces cursors subscribe --help`
          );
          expect(helpResult.exitCode).to.equal(0);
          expect(helpResult.stdout).to.contain("Subscribe to cursor movements");
        });

        it('should have properly structured spaces lock commands', async function() {
          const helpResult = await runBackgroundProcessAndGetOutput(
            `bin/run.js spaces locks subscribe --help`
          );
          expect(helpResult.exitCode).to.equal(0);
          expect(helpResult.stdout).to.contain("Subscribe to lock events");
        });
      });
    }
  });
} else {
  describe('Spaces E2E Tests', function() {
    it('should be skipped when E2E_ABLY_API_KEY is not set', function() {
      console.log('Skipping Spaces E2E Tests - E2E_ABLY_API_KEY not configured');
      this.skip();
    });
  });
}