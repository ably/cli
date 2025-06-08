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
  forceExit,
  cleanupTrackedResources,
  createAblyRealtimeClient,
  testOutputFiles,
  testCommands,
  displayTestFailureDebugOutput
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
    
    if (output !== lastOutput) {
      lastOutput = output;
    }
    
    // Check both raw output and normalized versions
    if (output.includes(targetString) || 
        output.toLowerCase().includes(targetString.toLowerCase()) ||
        // Handle ANSI codes that might interfere
        stripAnsi(output).includes(targetString)) {
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

describe('Rooms E2E Tests', function() {
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

  let testRoomId: string;
  let client1Id: string;
  let client2Id: string;

  beforeEach(function() {
    this.timeout(120000); // 2 minutes per individual test
    // Clear tracked output files and commands for this test
    testOutputFiles.clear();
    testCommands.length = 0;
    
    testRoomId = getUniqueChannelName("room");
    client1Id = getUniqueClientId("client1");
    client2Id = getUniqueClientId("client2");
  });

  afterEach(async function() {
    if (this.currentTest?.state === 'failed') {
      await displayTestFailureDebugOutput(this.currentTest?.title);
    }
    await cleanupTrackedResources();
  });

  describe('Room occupancy functionality', function() {
      it('should show occupancy metrics for active room', async function() {
        let presenceRunner: CliRunner | null = null;

        try {
          // Start client1 entering presence (this is a long-running command)
          presenceRunner = await startPresenceCommand(
            ['rooms', 'presence', 'enter', testRoomId, '--profile-data', '{"name":"TestUser1"}', '--client-id', client1Id, '--duration', '15'],
            /Entered room/,
            { timeoutMs: process.env.CI ? 20000 : 15000 }
          );

          // Wait longer for presence to establish in CI
          const initialWait = process.env.CI ? 5000 : 3000;
          await new Promise(resolve => setTimeout(resolve, initialWait));


          // Check occupancy metrics multiple times with retry logic
          let occupancyResult: { exitCode: number | null; stdout: string; stderr: string } | null = null;
          let attempts = 0;
          const maxAttempts = process.env.CI ? 5 : 3;

          while (attempts < maxAttempts) {
            attempts++;
            
            occupancyResult = await runCommand(['rooms', 'occupancy', 'get', testRoomId], {
              timeoutMs: process.env.CI ? 15000 : 10000
            });


            if (occupancyResult.exitCode === 0 && 
                occupancyResult.stdout.includes("Connections:") && 
                occupancyResult.stdout.includes("Presence Members:")) {
              break;
            }

            if (attempts < maxAttempts) {
              const retryDelay = 2000 * attempts; // Progressive delay
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
            subscribeRunner = await startSubscribeCommand(
              ['rooms', 'presence', 'subscribe', testRoomId, '--client-id', client1Id, '--duration', '35'],
              /Subscribing to presence events/,
              { timeoutMs: process.env.CI ? 30000 : 20000 }
            );

            // Wait a moment for client1's subscription to fully establish
            const client1SetupWait = process.env.CI ? 4000 : 2000;
            await new Promise(resolve => setTimeout(resolve, client1SetupWait));

            // Have client2 enter the room
            enterRunner = await startPresenceCommand(
              ['rooms', 'presence', 'enter', testRoomId, '--profile-data', '{"name":"TestUser2","status":"active"}', '--client-id', client2Id, '--duration', '25'],
              /Entered room/,
              { timeoutMs: process.env.CI ? 30000 : 20000 }
            );

            // Add a significant delay for presence event propagation
            const propagationDelay = process.env.CI ? 10000 : 7000; 
            await new Promise(resolve => setTimeout(resolve, propagationDelay));

            // Wait for all presence event components using the improved detection

            try {
              // Wait for action enter pattern - look for the actual format: "clientId enter"
              await waitForOutput(subscribeRunner, ` ${client2Id} enter`, process.env.CI ? 20000 : 15000);

              // Wait for profile data pattern - correct JSON formatting with spaces
              await waitForOutput(subscribeRunner, `"name": "TestUser2"`, process.env.CI ? 10000 : 5000);

              // Wait for status in profile data - correct JSON formatting with spaces
              await waitForOutput(subscribeRunner, `"status": "active"`, process.env.CI ? 5000 : 3000);


            } catch (error) {
              throw error;
            }

          } finally {
            await cleanupRunners([subscribeRunner, enterRunner].filter(Boolean) as CliRunner[]);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Final wait for cleanup
          }
        });
      });

      describe('Message publish and subscribe functionality', function() {
        it('should allow publishing and subscribing to messages', async function() {
          this.timeout(process.env.CI ? 60000 : 45000); // Increased timeout for second message test
          let subscribeRunner: CliRunner | null = null;

          try {
            // Start subscribing to messages with client1
            subscribeRunner = await startSubscribeCommand(
              ['rooms', 'messages', 'subscribe', testRoomId, '--client-id', client1Id, '--duration', '60'],
              'Connected to room:',
              { timeoutMs: process.env.CI ? 45000 : 25000 }
            );

            // Wait a bit to ensure subscription is established
            const setupWait = process.env.CI ? 3000 : 1000;
            await new Promise(resolve => setTimeout(resolve, setupWait));

            // Have client2 send a message
            const testMessage = "Hello from E2E test!";
            const sendResult = await runCommand(['rooms', 'messages', 'send', testRoomId, testMessage, '--client-id', client2Id], {
              timeoutMs: process.env.CI ? 30000 : 20000
            });

            // Check for success - either exit code 0 or successful output (even if process was killed after success)
            const isSuccessful = sendResult.exitCode === 0 || sendResult.stdout.includes("Message sent successfully");
            expect(isSuccessful, `Message should be sent successfully. Exit code: ${sendResult.exitCode}, stdout: ${sendResult.stdout}, stderr: ${sendResult.stderr}`).to.be.true;
            expect(sendResult.stdout).to.contain("Message sent successfully");

            // Wait for the message to be received by the subscriber
            await waitForOutput(subscribeRunner, testMessage, process.env.CI ? 10000 : 6000);

            await waitForOutput(subscribeRunner, client2Id, process.env.CI ? 5000 : 3000);

            // Send a second message with metadata
            const secondMessage = "Second test message with metadata";
            const metadata = { timestamp: Date.now(), type: "test" };
            const sendResult2 = await runCommand([
              'rooms', 'messages', 'send', testRoomId, secondMessage, 
              '--metadata', JSON.stringify(metadata), '--client-id', client2Id
            ], {
              timeoutMs: process.env.CI ? 15000 : 10000
            });

            // Check for success - either exit code 0 or successful output (even if process was killed after success)
            const isSecondSuccessful = sendResult2.exitCode === 0 || sendResult2.stdout.includes("Message sent successfully");
            expect(isSecondSuccessful, `Second message should be sent successfully. Exit code: ${sendResult2.exitCode}, stdout: ${sendResult2.stdout}, stderr: ${sendResult2.stderr}`).to.be.true;

            // Wait for the second message to be received
            try {
              await waitForOutput(subscribeRunner, secondMessage, process.env.CI ? 10000 : 6000);
            } catch (waitError) {
              // If waitForOutput fails, check if the message is actually in the output
              const subscriberOutput = subscribeRunner.combined();
              if (subscriberOutput.includes(secondMessage)) {
                // Message was received, the process just exited before waitForOutput finished
                // This is acceptable - the test goal is achieved
              } else {
                throw waitError;
              }
            }

          } catch (error) {
            throw error;
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