import { expect } from "chai";
import { execa } from "execa";

// Options for execa to prevent Node debugger attachment/output
const execaOptions = {
  env: { NODE_OPTIONS: "--no-inspect" }, // Clear NODE_OPTIONS to prevent debugger attachment
  reject: false, // Don't reject promise on non-zero exit code
  timeout: 5000 // 5 second timeout for commands
};

// Very simple tests to see if the CLI works at all
describe("Minimal CLI E2E Tests", function() {
  // Set a short timeout
  this.timeout(15000);

  it("should output the version", async function() {
    const result = await execa("node", ["bin/run.js", "--version"], execaOptions);

    // Basic check for successful command
    expect(result.failed).to.be.false;
    expect(result.stdout).to.match(/^@ably\/cli\/[0-9]+\.[0-9]+\.[0-9]+/);
  });

  it("should output JSON version info", async function() {
    const result = await execa("node", ["bin/run.js", "--version", "--json"], execaOptions);

    // Basic JSON check
    expect(result.failed).to.be.false;
    const parsed = JSON.parse(result.stdout);
    expect(parsed).to.have.property("version");
  });

  it("should show help text", async function() {
    const result = await execa("node", ["bin/run.js", "help"], execaOptions);

    // Basic help check
    expect(result.failed).to.be.false;
    expect(result.stdout).to.include("Ably help commands");
    expect(result.stdout).to.include("ably help");
  });
});
