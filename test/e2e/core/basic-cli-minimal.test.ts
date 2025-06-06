import { expect } from "chai";
import { runCommand } from "../../helpers/command-helpers.js";
import { applyE2ETestSetup } from "../../helpers/e2e-test-helper.js";

// Options for runCommand to prevent Node debugger attachment/output
const commandOptions = {
  env: { NODE_OPTIONS: "--no-inspect" }, // Clear NODE_OPTIONS to prevent debugger attachment
  timeoutMs: 5000 // 5 second timeout for commands
};

// Skip tests if we're in CI without API keys
const SHOULD_SKIP_TESTS = process.env.SKIP_E2E_TESTS === 'true';

if (SHOULD_SKIP_TESTS) {
  // If tests should be skipped, create a simple describe with a skip
  describe("Minimal CLI E2E Tests (skipped)", function() {
    it("tests skipped due to missing API key", function() {
      this.skip();
    });
  });
} else {
// Very simple tests to see if the CLI works at all
describe("Minimal CLI E2E Tests", function() {
  // Apply E2E test setup for debug output on failures
  applyE2ETestSetup();
  
  // Set a short timeout
  this.timeout(15000);

  it("should output the version", async function() {
    const result = await runCommand(["--version"], commandOptions);

    // Basic check for successful command
    expect(result.exitCode).to.equal(0);
    expect(result.stdout).to.match(/^@ably\/cli\/[0-9]+\.[0-9]+\.[0-9]+/);
  });

  it("should output JSON version info", async function() {
    const result = await runCommand(["--version", "--json"], commandOptions);

    // Basic JSON check
    expect(result.exitCode).to.equal(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).to.have.property("version");
  });

  it("should show help text", async function() {
    const result = await runCommand(["help"], commandOptions);

    // Basic help check
    expect(result.exitCode).to.equal(0);
    expect(result.stdout).to.include("Ably help commands");
    expect(result.stdout).to.include("ably help");
  });
});
}
