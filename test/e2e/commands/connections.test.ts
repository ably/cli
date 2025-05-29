import { expect } from "chai";
import { execa } from "execa";
import { join } from "node:path";

// Helper function to run CLI commands
async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cliPath = join(process.cwd(), "bin", "run.js");
  
  try {
    const result = await execa("node", [cliPath, ...args], {
      timeout: 30000, // 30 second timeout
      env: {
        ...process.env,
        ABLY_CLI_TEST_MODE: "false", // Use real Ably operations for E2E
      },
    });
    
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode || 0,
    };
  } catch (error: any) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      exitCode: error.exitCode || 1,
    };
  }
}

describe("Connections E2E Tests", function() {
  // Skip E2E tests if no API key is available
  before(function() {
    if (!process.env.ABLY_API_KEY && !process.env.ABLY_ACCESS_TOKEN) {
      this.skip();
    }
  });

  describe("Connection Stats E2E", function() {
    it("should retrieve real connection stats successfully", async function() {
      this.timeout(60000); // 60 second timeout for real API calls
      
      const result = await runCli(["connections", "stats", "--limit", "5"]);
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include("Connections:");
      expect(result.stdout).to.include("Channels:");
      expect(result.stdout).to.include("Messages:");
    });

    it("should output connection stats in JSON format", async function() {
      this.timeout(60000);
      
      const result = await runCli(["connections", "stats", "--json", "--limit", "3"]);
      
      expect(result.exitCode).to.equal(0);
      
      // Verify it's valid JSON
      let jsonOutput;
      try {
        jsonOutput = JSON.parse(result.stdout);
      } catch (error) {
        throw new Error(`Invalid JSON output: ${result.stdout}`);
      }
      
      // Check for expected stats structure
      expect(jsonOutput).to.have.property("intervalId");
    });

    it("should handle different time units correctly", async function() {
      this.timeout(60000);
      
      const result = await runCli(["connections", "stats", "--unit", "hour", "--limit", "2"]);
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include("Stats for");
    });

    it("should handle custom time ranges", async function() {
      this.timeout(60000);
      
      const endTime = Date.now();
      const startTime = endTime - (60 * 60 * 1000); // 1 hour ago
      
      const result = await runCli([
        "connections", "stats", 
        "--start", startTime.toString(),
        "--end", endTime.toString(),
        "--limit", "2"
      ]);
      
      expect(result.exitCode).to.equal(0);
    });

    it("should handle empty stats gracefully", async function() {
      this.timeout(60000);
      
      // Use a very recent time range that's unlikely to have stats
      const endTime = Date.now();
      const startTime = endTime - 1000; // 1 second ago
      
      const result = await runCli([
        "connections", "stats",
        "--start", startTime.toString(),
        "--end", endTime.toString()
      ]);
      
      // Should exit successfully even with no stats
      expect(result.exitCode).to.equal(0);
    });
  });

  describe("Connection Test E2E", function() {
    it("should test WebSocket connection successfully", async function() {
      this.timeout(90000); // 90 second timeout for connection testing
      
      const result = await runCli(["connections", "test", "--transport", "ws"]);
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include("WebSocket connection");
    });

    it("should test HTTP connection successfully", async function() {
      this.timeout(90000);
      
      const result = await runCli(["connections", "test", "--transport", "xhr"]);
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include("HTTP connection");
    });

    it("should test all connection types", async function() {
      this.timeout(120000); // 2 minute timeout for testing all connections
      
      const result = await runCli(["connections", "test", "--transport", "all"]);
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include("Connection Test Summary");
    });

    it("should output connection test results in JSON format", async function() {
      this.timeout(90000);
      
      const result = await runCli(["connections", "test", "--transport", "ws", "--json"]);
      
      expect(result.exitCode).to.equal(0);
      
      // Verify it's valid JSON
      let jsonOutput;
      try {
        jsonOutput = JSON.parse(result.stdout);
      } catch (error) {
        throw new Error(`Invalid JSON output: ${result.stdout}`);
      }
      
      // Check for expected test result structure
      expect(jsonOutput).to.have.property("ws");
      expect(jsonOutput.ws).to.have.property("success");
    });
  });

  describe("Error Handling E2E", function() {
    it("should handle invalid time units gracefully", async function() {
      this.timeout(30000);
      
      const result = await runCli(["connections", "stats", "--unit", "invalid"]);
      
      expect(result.exitCode).to.not.equal(0);
      expect(result.stderr).to.include("Expected --unit=");
    });

    it("should handle invalid transport types gracefully", async function() {
      this.timeout(30000);
      
      const result = await runCli(["connections", "test", "--transport", "invalid"]);
      
      expect(result.exitCode).to.not.equal(0);
      expect(result.stderr).to.include("Expected --transport=");
    });

    it("should handle invalid timestamp formats gracefully", async function() {
      this.timeout(30000);
      
      const result = await runCli(["connections", "stats", "--start", "not-a-timestamp"]);
      
      expect(result.exitCode).to.not.equal(0);
    });
  });

  describe("Performance and Reliability E2E", function() {
    it("should complete stats retrieval within reasonable time", async function() {
      this.timeout(45000); // 45 second timeout
      
      const startTime = Date.now();
      const result = await runCli(["connections", "stats", "--limit", "10"]);
      const endTime = Date.now();
      
      expect(result.exitCode).to.equal(0);
      expect(endTime - startTime).to.be.lessThan(30000); // Should complete within 30 seconds
    });

    it("should handle multiple consecutive stats requests", async function() {
      this.timeout(120000); // 2 minute timeout
      
      // Run multiple stats requests in sequence
      for (let i = 0; i < 3; i++) {
        const result = await runCli(["connections", "stats", "--limit", "2"]);
        expect(result.exitCode).to.equal(0);
      }
    });

    it("should maintain consistent output format across requests", async function() {
      this.timeout(90000);
      
      // Run the same command twice and verify consistent output structure
      const result1 = await runCli(["connections", "stats", "--json", "--limit", "2"]);
      const result2 = await runCli(["connections", "stats", "--json", "--limit", "2"]);
      
      expect(result1.exitCode).to.equal(0);
      expect(result2.exitCode).to.equal(0);
      
      // Both should be valid JSON with similar structure
      let json1, json2;
      try {
        json1 = JSON.parse(result1.stdout);
        json2 = JSON.parse(result2.stdout);
      } catch (error) {
        throw new Error("Invalid JSON output in consecutive requests");
      }
      
      // Both should have the same structure
      expect(Object.keys(json1)).to.deep.equal(Object.keys(json2));
    });
  });

  describe("Live Connection Monitoring E2E", function() {
    it("should monitor live connections with real client lifecycle", async function() {
      this.timeout(180000); // 3 minute timeout for comprehensive test
      
      const cliPath = join(process.cwd(), "bin", "run.js");
      const testChannelName = `test-live-connections-${Date.now()}`;
      const testClientId = `test-client-${Date.now()}`;
      
      // Step 1: Start live connection log monitoring
      const connectionsMonitor = execa("node", [cliPath, "logs", "connection", "subscribe", "--json"], {
        env: {
          ...process.env,
          ABLY_CLI_TEST_MODE: "false", // Use real Ably operations
        },
      });
      
      let monitorOutput = "";
      const connectionEvents: Array<{ 
        timestamp: number; 
        eventType: string; 
        clientId: string | null; 
        connectionId: string | null;
      }> = [];
      
      // Collect output from the live connection monitor
      connectionsMonitor.stdout?.on("data", (data) => {
        const output = data.toString();
        monitorOutput += output;
        
        // Parse JSON output to look for connection events
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const logEvent = JSON.parse(line);
              
              // Look for connection events with our client ID
              if (logEvent.transport && logEvent.transport.requestParams) {
                const clientIdArray = logEvent.transport.requestParams.clientId;
                const clientId = Array.isArray(clientIdArray) ? clientIdArray[0] : clientIdArray;
                const connectionId = logEvent.connectionId;
                
                if (clientId === testClientId) {
                  connectionEvents.push({
                    timestamp: Date.now(),
                    eventType: logEvent.eventType || 'connection',
                    clientId: clientId,
                    connectionId: connectionId
                  });
                  
                  console.log(`Detected connection event for ${testClientId}: ${logEvent.eventType || 'connection'} (${connectionId})`);
                }
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
      });
      
      // Wait for initial connection monitoring to start
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Step 2: Start a channel subscriber with specific client ID (this will create a new connection)
      console.log(`Starting channel subscriber with clientId: ${testClientId}...`);
      const channelSubscriber = execa("node", [cliPath, "channels", "subscribe", testChannelName, "--client-id", testClientId], {
        env: {
          ...process.env,
          ABLY_CLI_TEST_MODE: "false",
        },
        timeout: 45000, // Increased timeout for connection establishment
      });
      
      // Wait for the subscriber to establish connection and appear in monitoring
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // Step 3: Close the channel subscriber
      console.log("Closing channel subscriber...");
      channelSubscriber.kill("SIGTERM");
      
      // Wait for the subscriber to fully disconnect
      try {
        await channelSubscriber;
      } catch {
        // Expected - we killed the process
      }
      
      // Step 4: Wait up to 15 seconds for the disconnection event to appear
      console.log("Waiting for disconnection event to appear in monitoring...");
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // Stop the connections monitor
      connectionsMonitor.kill("SIGTERM");
      
      try {
        await connectionsMonitor;
      } catch {
        // Expected - we killed the process
      }
      
      // Verify we captured connection lifecycle for our specific client
      expect(connectionEvents.length).to.be.greaterThan(0, `Should have seen connection events for clientId: ${testClientId}`);
      
      // Log captured events for debugging
      console.log(`Captured ${connectionEvents.length} connection events for ${testClientId}:`);
      connectionEvents.forEach(event => {
        console.log(`  - ${event.eventType} at ${new Date(event.timestamp).toISOString()} (${event.connectionId})`);
      });
      
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
      const connectionsMonitor = execa("node", [cliPath, "logs", "connection", "subscribe"], {
        env: {
          ...process.env,
          ABLY_CLI_TEST_MODE: "false",
        },
      });
      
      let outputReceived = false;
      connectionsMonitor.stdout?.on("data", (data) => {
        const output = data.toString();
        if (output.includes("connectionId") || output.includes("transport")) {
          outputReceived = true;
        }
      });
      
      // Wait for some output
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Gracefully terminate
      connectionsMonitor.kill("SIGTERM");
      
      try {
        await connectionsMonitor;
      } catch (error: any) {
        // Should exit cleanly with SIGTERM
        expect(error.signal).to.equal("SIGTERM");
      }
      
      expect(outputReceived).to.be.true;
    });
  });
});