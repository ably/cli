import { expect } from "chai";
import { execa } from "execa";

// Options for execa to prevent Node debugger attachment/output
const execaOptions = {
  env: { NODE_OPTIONS: "" }, // Clear NODE_OPTIONS to prevent debugger attachment
  reject: false, // Don't reject promise on non-zero exit code, allowing us to inspect error details
};

// Helper function to extract JSON from potentially noisy stdout
// Looks for the last occurrence of { or [ to handle potential prefixes
const parseJsonFromOutput = (output: string): any => {
  console.log("Attempting to parse JSON from:", output); // Log the raw output
  const jsonStart = output.lastIndexOf('{');
  const arrayStart = output.lastIndexOf('[');
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

  const jsonString = output.slice(Math.max(0, startIndex));
  console.log(`Attempting to parse substring (index ${startIndex}):`, jsonString);
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("JSON parsing failed:", error);
    throw new Error(`Failed to parse JSON from output substring.`);
  }
};

// These tests check the basic CLI functionality in a real environment
describe("Basic CLI E2E", function() {
  describe("CLI version", function() {
    it("should output the correct version", async function() {
      const result = await execa("node", ["bin/run.js", "--version"], execaOptions);
      expect(result.failed).to.be.false;
      // Check if stdout starts with the package name and version format
      expect(result.stdout).to.match(/^@ably\/cli\/[0-9]+\.[0-9]+\.[0-9]+/);
    });
  });

  describe("Global flags", function() {
    // TODO: Investigate why oclif help command doesn't output JSON with --json flag
    it.skip("should accept --json flag without error", async function() {
      // Use a simple command that works without auth
      const result = await execa("node", ["bin/run.js", "help", "--json"], execaOptions);
      expect(result.failed).to.be.false;
      expect(result.stderr).to.be.empty; // Ensure no errors

      // Should return valid JSON
      let jsonOutput;
      expect(() => {
        jsonOutput = parseJsonFromOutput(result.stdout); // Call the helper
      }).not.to.throw();

      // JSON structure should include topics
      expect(jsonOutput).to.have.property("topics").that.is.an("array");
    });

    // TODO: Investigate why oclif help command doesn't output JSON with --pretty-json flag
    it.skip("should accept --pretty-json flag without error", async function() {
      const result = await execa("node", ["bin/run.js", "help", "--pretty-json"], execaOptions);
      expect(result.failed).to.be.false;
      expect(result.stderr).to.be.empty; // Ensure no errors

      // Should be valid JSON
      expect(() => parseJsonFromOutput(result.stdout)).not.to.throw(); // Call the helper
    });

    it("should error when both --json and --pretty-json are used", async function() {
      // Using reject: false, we check the result properties instead of using try/catch
      // Test on a base command (`config`) that inherits global flags
      const result = await execa("node", ["bin/run.js", "config", "--json", "--pretty-json"], execaOptions);

      expect(result.failed).to.be.true; // Command should fail due to exclusive flags
      expect(result.exitCode).not.equal(0);
      // Check stderr for the specific error message (oclif v3 style)
      expect(result.stderr).to.include("cannot also be provided");
    });
  });

  describe("CLI help", function() {
    it("should display help for root command", async function() {
      const result = await execa("node", ["bin/run.js", "help"], execaOptions);
      expect(result.failed).to.be.false;
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
      // Use the `--help` flag pattern on a non-existent command
      const result = await execa("node", ["bin/run.js", "help", "doesnotexist"], execaOptions);

      expect(result.failed).to.be.true;
      expect(result.stderr).to.include("doesnotexist not found");
    });
  });

  describe("Command not found handling", function() {
    it("should suggest and run similar command for a typo in test mode", async function() {
      const result = await execa("node", ["bin/run.js", "channls"], execaOptions); // Typo for 'channels'

      // 1. Check stderr for the initial warning
      expect(result.stderr).to.include("channls is not an ably command");

      // 2. Expect success because hook auto-confirms & runs suggested command in test mode
      expect(result.failed, `Command stderr: ${result.stderr}`).to.be.false;
      expect(result.exitCode).to.equal(0);

      // 3. Check stdout for output from the *suggested* command ('ably channels')
      //    which logs its own help info when run without arguments.
      expect(result.stdout).to.include("Ably Pub/Sub channel commands:");
      expect(result.stdout).to.include("ably channels list"); // Example subcommand
      expect(result.stdout).to.include("ably channels publish"); // Example subcommand
    });

    it("should suggest help for completely unknown commands", async function() {
      const result = await execa("node", ["bin/run.js", "completelyunknowncommand"], execaOptions);

      expect(result.failed).to.be.true; // Should fail as no suggestion is found
      expect(result.exitCode).not.equal(0);
      // Check stderr for the 'command not found' and help suggestion
      expect(result.stderr).to.include("completelyunknowncommand not found");
      expect(result.stderr).to.include("Run ably help");
    });
  });
});
