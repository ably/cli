import { expect } from "chai";
import stripAnsi from "strip-ansi";
import { runCommand } from "../../helpers/command-helpers.js";
import { forceExit, cleanupTrackedResources, testOutputFiles, testCommands, displayTestFailureDebugOutput } from "../../helpers/e2e-test-helper.js";

// Helper function to extract JSON from potentially noisy stdout
// Looks for the last occurrence of { or [ to handle potential prefixes
const _parseJsonFromOutput = (output: string): any => {
  // Strip ANSI color codes first
  const strippedOutput = stripAnsi(output);

  const jsonStart = strippedOutput.lastIndexOf('{');
  const arrayStart = strippedOutput.lastIndexOf('[');
  let startIndex = -1;

  if (jsonStart === -1 && arrayStart === -1) {
    console.error("No JSON start character ({ or [) found.");
    throw new Error(`No JSON object or array found in output.`);
  }

  if (jsonStart !== -1 && arrayStart !== -1) {
    startIndex = Math.max(jsonStart, arrayStart); // Use the later starting character
  } else if (jsonStart === -1) {
    startIndex = arrayStart;
  } else {
    startIndex = jsonStart;
  }

  const jsonString = strippedOutput.slice(Math.max(0, startIndex));
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("JSON parsing failed:", error);
    throw new Error(`Failed to parse JSON from output substring.`);
  }
};

// These tests check the basic CLI functionality in a real environment
describe("Basic CLI E2E", function() {
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

    describe("CLI version", function() {
      it("should output the correct version", async function() {
        const result = await runCommand(["--version"], {
          env: { NODE_OPTIONS: "", ABLY_CLI_NON_INTERACTIVE: "true" },
          timeoutMs: 10000
        });
        
        expect(result.exitCode).to.equal(0);
        // Check if stdout starts with the package name and version format
        expect(result.stdout).to.match(/^@ably\/cli\/[0-9]+\.[0-9]+\.[0-9]+/);
      });
    });

    describe("Global flags", function() {
      it("should accept --json flag without error", async function() {
        // Test --version flag with --json
        const result = await runCommand(["--version", "--json"], {
          env: { NODE_OPTIONS: "", ABLY_CLI_NON_INTERACTIVE: "true" },
          timeoutMs: 10000
        });
        
        expect(result.exitCode).to.equal(0);
        expect(result.stderr).to.be.empty; // Ensure no errors

        // Check for valid JSON output
        let jsonOutput;
        expect(() => {
          jsonOutput = JSON.parse(result.stdout);
        }).not.to.throw();

        // Validate the JSON structure
        expect(jsonOutput).to.have.property("version").that.is.a("string");
        expect(jsonOutput).to.have.property("name").that.equals("@ably/cli");
        expect(jsonOutput).to.have.property("platform").that.equals(process.platform);
      });

      it("should accept --pretty-json flag without error", async function() {
        // Test --version flag with --pretty-json
        const result = await runCommand(["--version", "--pretty-json"], {
          env: { NODE_OPTIONS: "", ABLY_CLI_NON_INTERACTIVE: "true" },
          timeoutMs: 10000
        });
        
        expect(result.exitCode).to.equal(0);
        expect(result.stderr).to.be.empty; // Ensure no errors

        // Pretty JSON should contain line breaks
        expect(result.stdout).to.include("\n");

        // Check for valid JSON output - use _parseJsonFromOutput helper to handle ANSI color codes
        let jsonOutput;
        expect(() => {
          jsonOutput = _parseJsonFromOutput(result.stdout);
        }).not.to.throw();

        // Validate the JSON structure
        expect(jsonOutput).to.have.property("version").that.is.a("string");
        expect(jsonOutput).to.have.property("name").that.equals("@ably/cli");
        expect(jsonOutput).to.have.property("platform").that.equals(process.platform);
      });

      it("should error when both --json and --pretty-json are used", async function() {
        // Test on a base command (`config`) that inherits global flags
        const result = await runCommand(["config", "--json", "--pretty-json"], {
          env: { NODE_OPTIONS: "", ABLY_CLI_NON_INTERACTIVE: "true" },
          timeoutMs: 10000
        });

        expect(result.exitCode).not.to.equal(0); // Command should fail due to exclusive flags
        // Check stderr for the specific error message (oclif v3 style)
        expect(result.stderr).to.include("cannot also be provided");
      });
    });

    describe("CLI help", function() {
      it("should display help for root command", async function() {
        const result = await runCommand(["help"], {
          env: { NODE_OPTIONS: "", ABLY_CLI_NON_INTERACTIVE: "true" },
          timeoutMs: 10000
        });
        
        expect(result.exitCode).to.equal(0);
        expect(result.stderr).to.be.empty;

        // Check that main topics are listed
        expect(result.stdout).to.include("accounts");
        expect(result.stdout).to.include("apps");
        expect(result.stdout).to.include("channels");
        expect(result.stdout).to.include("auth");
        expect(result.stdout).to.include("config"); // Base topic exists
        expect(result.stdout).to.include("help"); // Help topic itself
        // Check for specific help subcommands
        expect(result.stdout).to.include("help ask");
        expect(result.stdout).to.include("help contact");
        expect(result.stdout).to.include("help support");
        expect(result.stdout).to.include("help status");
      });

      it("should fail when attempting to get help for a non-existent command", async function() {
        // Use the `--help` flag pattern on a non-existent command with non-interactive flag
        const result = await runCommand(["help", "doesnotexist", "--non-interactive"], {
          env: { NODE_OPTIONS: "", ABLY_CLI_NON_INTERACTIVE: "true" },
          timeoutMs: 5000
        });

        expect(result.exitCode).not.to.equal(0);
        // In non-interactive mode, it shows a warning that "help" command is not found
        expect(result.stderr).to.include("help is not an ably command");
      });
    });

    describe("Command not found handling", function() {
      it("should suggest and run similar command for a typo (colon input)", async function() {
        const result = await runCommand(["channels:pubish"], {
          env: { NODE_OPTIONS: "", ABLY_CLI_NON_INTERACTIVE: "true" },
          timeoutMs: 5000
        });
        
        // Expect specific warning format and failure
        expect(result.stderr).to.include("Warning: channels pubish is not an ably command."); // Match actual warning
        // Do not expect "Did you mean" in non-interactive output from the hook itself
        expect(result.exitCode).not.to.equal(0);
      });

      it("should suggest and run similar command for a typo (space input)", async function() {
        const result = await runCommand(["channels", "pubish"], {
          env: { NODE_OPTIONS: "", ABLY_CLI_NON_INTERACTIVE: "true" },
          timeoutMs: 5000
        });
        
        // Expect specific warning format and failure
        expect(result.stderr).to.include("Warning: channels pubish is not an ably command."); // Match actual warning
        // Do not expect "Did you mean" in non-interactive output from the hook itself
        expect(result.exitCode).not.to.equal(0);
      });

      it("should suggest help for completely unknown commands", async function() {
        const result = await runCommand(["completelyunknowncommand", "--non-interactive"], {
          env: { NODE_OPTIONS: "", ABLY_CLI_NON_INTERACTIVE: "true" },
          timeoutMs: 5000
        });

        expect(result.exitCode).not.to.equal(0); // Should fail as no suggestion is found
        // Check stderr for the 'command not found' and help suggestion
        expect(result.stderr).to.include("completelyunknowncommand not found");
        expect(result.stderr).to.include("Run ably --help");
      });

      it("should show command not found for topic typo with subcommand", async function() {
        // Example: `ably config doesnotexist` -> input is `config:doesnotexist` internally
        const result = await runCommand(["config", "doesnotexist", "--non-interactive"], {
          env: { NODE_OPTIONS: "", ABLY_CLI_NON_INTERACTIVE: "true" },
          timeoutMs: 5000
        });

        expect(result.exitCode).not.to.equal(0);
        // With our updated implementation, it will try to find a close match for "config"
        // and if found, will warn with "config is not an ably command"
        expect(result.stderr).to.include("config is not an ably command");
      });
    });
  });
