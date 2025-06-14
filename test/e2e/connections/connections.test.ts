import { expect } from "chai";
import { runCommand } from "../../helpers/command-helpers.js";
import { forceExit, cleanupTrackedResources, testOutputFiles, testCommands, displayTestFailureDebugOutput } from "../../helpers/e2e-test-helper.js";
import { spawn } from "node:child_process";
import { join } from "node:path";

describe("Connections E2E Tests", function() {
  before(function() {
    process.on('SIGINT', forceExit);
  });

  after(function() {
    process.removeListener('SIGINT', forceExit);
  });

  beforeEach(function() {
    this.timeout(120000); // 2 minutes per individual test
    // Clear tracked output files and commands for this test
    testOutputFiles.clear();
    testCommands.length = 0;
  });

  afterEach(async function() {
    if (this.currentTest?.state === 'failed') {
      await displayTestFailureDebugOutput(this.currentTest?.title);
    }
    await cleanupTrackedResources();
  });

  describe("Connection Stats E2E", function() {
    it("should retrieve real connection stats successfully", async function() {
      this.timeout(60000); // 60 second timeout for real API calls
      
      const result = await runCommand(["connections", "stats", "--limit", "5"], {
        timeoutMs: 30000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include("Connections:");
      expect(result.stdout).to.include("Channels:");
      expect(result.stdout).to.include("Messages:");
    });

    it("should output connection stats in JSON format", async function() {
      this.timeout(60000);
      
      const result = await runCommand(["connections", "stats", "--json", "--limit", "3"], {
        timeoutMs: 30000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.equal(0);
      
      // Verify it's valid JSON
      let jsonOutput;
      try {
        jsonOutput = JSON.parse(result.stdout);
      } catch (_error) {
        throw new Error(`Invalid JSON output: ${result.stdout}`);
      }
      
      // Check for expected stats structure
      expect(jsonOutput).to.have.property("intervalId");
    });

    it("should handle different time units correctly", async function() {
      this.timeout(60000);
      
      const result = await runCommand(["connections", "stats", "--unit", "hour", "--limit", "2"], {
        timeoutMs: 30000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include("Stats for");
    });

    it("should handle custom time ranges", async function() {
      this.timeout(60000);
      
      const endTime = Date.now();
      const startTime = endTime - (60 * 60 * 1000); // 1 hour ago
      
      const result = await runCommand([
        "connections", "stats", 
        "--start", startTime.toString(),
        "--end", endTime.toString(),
        "--limit", "2"
      ], {
        timeoutMs: 30000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.equal(0);
    });

    it("should handle empty stats gracefully", async function() {
      this.timeout(60000);
      
      // Use a very recent time range that's unlikely to have stats
      const endTime = Date.now();
      const startTime = endTime - 1000; // 1 second ago
      
      const result = await runCommand([
        "connections", "stats",
        "--start", startTime.toString(),
        "--end", endTime.toString()
      ], {
        timeoutMs: 30000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      // Should exit successfully even with no stats
      expect(result.exitCode).to.equal(0);
    });
  });

  describe("Connection Test E2E", function() {
    it("should test WebSocket connection successfully", async function() {
      this.timeout(90000); // 90 second timeout for connection testing
      
      const result = await runCommand(["connections", "test", "--transport", "ws"], {
        timeoutMs: 90000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include("WebSocket connection");
    });

    it("should test HTTP connection successfully", async function() {
      this.timeout(90000);
      
      const result = await runCommand(["connections", "test", "--transport", "xhr"], {
        timeoutMs: 90000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include("HTTP connection");
    });

    it("should test all connection types", async function() {
      this.timeout(120000); // 2 minute timeout for testing all connections
      
      const result = await runCommand(["connections", "test", "--transport", "all"], {
        timeoutMs: 120000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include("Connection Test Summary");
    });

    it("should output connection test results in JSON format", async function() {
      this.timeout(90000);
      
      const result = await runCommand(["connections", "test", "--transport", "ws", "--json"], {
        timeoutMs: 90000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.equal(0);
      
      // Verify it's valid JSON
      let jsonOutput;
      try {
        jsonOutput = JSON.parse(result.stdout);
      } catch (_error) {
        throw new Error(`Invalid JSON output: ${result.stdout}`);
      }
      
      // Check for expected test result structure
      expect(jsonOutput).to.have.property("success");
      expect(jsonOutput).to.have.property("transport");
      expect(jsonOutput.transport).to.equal("ws");
    });
  });

  describe("Error Handling E2E", function() {
    it("should handle invalid time units gracefully", async function() {
      this.timeout(30000);
      
      const result = await runCommand(["connections", "stats", "--unit", "invalid"], {
        timeoutMs: 30000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.not.equal(0);
      expect(result.stderr).to.include("Expected --unit=");
    });

    it("should handle invalid transport types gracefully", async function() {
      this.timeout(30000);
      
      const result = await runCommand(["connections", "test", "--transport", "invalid"], {
        timeoutMs: 30000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.not.equal(0);
      expect(result.stderr).to.include("Expected --transport=");
    });

    it("should handle invalid timestamp formats gracefully", async function() {
      this.timeout(30000);
      
      const result = await runCommand(["connections", "stats", "--start", "not-a-timestamp"], {
        timeoutMs: 30000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result.exitCode).to.not.equal(0);
    });
  });

  describe("Performance and Reliability E2E", function() {
    it("should complete stats retrieval within reasonable time", async function() {
      this.timeout(45000); // 45 second timeout
      
      const startTime = Date.now();
      const result = await runCommand(["connections", "stats", "--limit", "10"], {
        timeoutMs: 45000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      const endTime = Date.now();
      
      expect(result.exitCode).to.equal(0);
      expect(endTime - startTime).to.be.lessThan(30000); // Should complete within 30 seconds
    });

    it("should handle multiple consecutive stats requests", async function() {
      this.timeout(120000); // 2 minute timeout
      
      // Run multiple stats requests in sequence
      for (let i = 0; i < 3; i++) {
        const result = await runCommand(["connections", "stats", "--limit", "2"], {
          timeoutMs: 30000,
          env: { ABLY_CLI_TEST_MODE: "false" }
        });
        expect(result.exitCode).to.equal(0);
      }
    });

    it("should maintain consistent output format across requests", async function() {
      this.timeout(90000);
      
      // Run the same command twice and verify consistent output structure
      const result1 = await runCommand(["connections", "stats", "--json", "--limit", "2"], {
        timeoutMs: 45000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      const result2 = await runCommand(["connections", "stats", "--json", "--limit", "2"], {
        timeoutMs: 45000,
        env: { ABLY_CLI_TEST_MODE: "false" }
      });
      
      expect(result1.exitCode).to.equal(0);
      expect(result2.exitCode).to.equal(0);
      
      // Both should be valid JSON with similar structure
      let json1, json2;
      try {
        json1 = JSON.parse(result1.stdout);
        json2 = JSON.parse(result2.stdout);
      } catch (_error) {
        throw new Error("Invalid JSON output in consecutive requests");
      }
      
      // Both should have the same structure
      expect(Object.keys(json1)).to.deep.equal(Object.keys(json2));
    });
  });

  describe("Live Connection Monitoring E2E", function() {
    // TODO: This test is currently skipped because the [meta]log:connection-lifecycle channel
    // doesn't appear to emit events for regular client connections. This might require:
    // 1. Special app configuration to enable connection lifecycle logging
    // 2. Different types of connections (e.g., server-side connections)
    // 3. Additional permissions on the API key
    it.skip("should monitor live connections with real client lifecycle", async function() {
      this.timeout(180000); // 3 minute timeout for comprehensive test
      
      const cliPath = join(process.cwd(), "bin", "run.js");
      const testChannelName = `test-live-connections-${Date.now()}`;
      const testClientId = `test-client-${Date.now()}`;
      
      // Step 1: Start live connection log monitoring
      const monitorEnv = { ...process.env };
      delete monitorEnv.ABLY_CLI_TEST_MODE;
      const apiKey = process.env.E2E_ABLY_API_KEY;
      if (!apiKey) {
        throw new Error("E2E_ABLY_API_KEY environment variable is required");
      }
      
      // Use connection-lifecycle command which uses the correct meta channel
      const connectionsMonitor = spawn("node", [cliPath, "logs", "connection-lifecycle", "subscribe", "--api-key", apiKey, "--json", "--verbose"], {
        env: monitorEnv,
      });
      
      let monitorOutput = "";
      const connectionEvents: Array<{ 
        timestamp: number; 
        eventType: string; 
        clientId: string | null; 
        connectionId: string | null;
      }> = [];
      
      // Collect output from the live connection monitor
      let eventCount = 0;
      connectionsMonitor.stdout?.on("data", (data) => {
        const output = data.toString();
        monitorOutput += output;
        
        // Parse JSON output to look for connection events
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const logEvent = JSON.parse(line);
              eventCount++;
              
              // Debug: log first few events to understand structure
              if (eventCount <= 10 && process.env.ABLY_CLI_TEST_SHOW_OUTPUT) {
                console.log("[TEST] Received log event:", JSON.stringify(logEvent, null, 2));
              }
              
              // Also check if our test client ID appears anywhere in the event
              const eventStr = JSON.stringify(logEvent);
              if (eventStr.includes(testClientId)) {
                console.log(`[TEST] Found event containing test client ID: ${eventStr.slice(0, 200)}...`);
              }
              
              // Check different possible locations for client ID
              let foundClientId: string | null = null;
              
              // Check in data.transport.requestParams
              if (logEvent.data?.transport?.requestParams?.clientId) {
                const clientIdArray = logEvent.data.transport.requestParams.clientId;
                foundClientId = Array.isArray(clientIdArray) ? clientIdArray[0] : clientIdArray;
              }
              // Check in data directly
              else if (logEvent.data?.clientId) {
                foundClientId = logEvent.data.clientId;
              }
              // Check in transport.requestParams (without data wrapper)
              else if (logEvent.transport?.requestParams?.clientId) {
                const clientIdArray = logEvent.transport.requestParams.clientId;
                foundClientId = Array.isArray(clientIdArray) ? clientIdArray[0] : clientIdArray;
              }
              
              if (foundClientId === testClientId) {
                console.log(`[TEST] Found matching client ID event: ${foundClientId}`);
                connectionEvents.push({
                  timestamp: Date.now(),
                  eventType: logEvent.event || logEvent.eventType || 'connection',
                  clientId: foundClientId,
                  connectionId: logEvent.data?.connectionId || logEvent.connectionId || null
                });
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
      });
      
      // Wait for initial connection monitoring to start and begin receiving events
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      console.log(`[TEST] Events received so far: ${eventCount}`);
      
      // Step 2: Start a channel subscriber with specific client ID (this will create a new connection)
      const subEnv = { ...process.env };
      delete subEnv.ABLY_CLI_TEST_MODE;
      console.log(`[TEST] Starting channel subscriber with client ID: ${testClientId}`);
      const channelSubscriber = spawn("node", [cliPath, "channels", "subscribe", testChannelName, "--api-key", apiKey, "--client-id", testClientId], {
        env: subEnv,
      });
      
      // Wait longer for the subscriber to establish connection and appear in monitoring
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Step 3: Close the channel subscriber
      channelSubscriber.kill("SIGTERM");
      
      // Wait for the subscriber to fully disconnect
      try {
        await channelSubscriber;
      } catch (_error) {
        // Expected - we killed the process
      }
      
      // Step 4: Wait up to 15 seconds for the disconnection event to appear
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // Stop the connections monitor
      connectionsMonitor.kill("SIGTERM");
      
      try {
        await connectionsMonitor;
      } catch (_error: any) {
        // Should exit cleanly with SIGTERM
        expect(_error.signal).to.equal("SIGTERM");
      }
      
      // Debug output
      console.log(`[TEST] Total events received: ${eventCount}`);
      console.log(`[TEST] Connection events for ${testClientId}: ${connectionEvents.length}`);
      if (connectionEvents.length === 0 && process.env.ABLY_CLI_TEST_SHOW_OUTPUT) {
        console.log("[TEST] Sample of monitor output:", monitorOutput.slice(0, 1000));
      }
      
      // Verify we captured connection lifecycle for our specific client
      expect(connectionEvents.length).to.be.greaterThan(0, `Should have seen connection events for clientId: ${testClientId}`);
      
      // Log captured events for debugging
      
      // Verify we got valid JSON output throughout
      expect(monitorOutput).to.include("connectionId", "Should have received connection log events");
      
      // The test passes if we detected any connection events for our specific client ID
      // This proves the live connection monitoring is working end-to-end
      expect(connectionEvents.some(e => e.clientId === testClientId)).to.be.true;
    });

    it("should handle live connection monitoring gracefully on cleanup", async function() {
      this.timeout(60000); // 1 minute timeout
      
      const cliPath = join(process.cwd(), "bin", "run.js");
      
      // Start live connection log monitoring
      const connectionsMonitor = spawn("node", [cliPath, "logs", "connection", "subscribe"], {
        env: {
          ...process.env,
          ABLY_CLI_TEST_MODE: "false",
        },
      });
      
      let _outputReceived = false;
      connectionsMonitor.stdout?.on("data", (data) => {
        const output = data.toString();
        if (output.includes("connectionId") || output.includes("transport")) {
          _outputReceived = true;
        }
      });
      
      // Wait for some output
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Gracefully terminate
      connectionsMonitor.kill("SIGTERM");
      
      try {
        await connectionsMonitor;
      } catch (_error: any) {
        // Should exit cleanly with SIGTERM
        expect(_error.signal).to.equal("SIGTERM");
      }
    });
  });
});