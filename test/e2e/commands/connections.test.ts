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
});