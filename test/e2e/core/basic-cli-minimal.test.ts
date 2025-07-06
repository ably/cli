import { expect } from "chai";
import { runCommand } from "../../helpers/command-helpers.js";
import { forceExit, cleanupTrackedResources, testOutputFiles, testCommands, displayTestFailureDebugOutput } from "../../helpers/e2e-test-helper.js";

// Options for runCommand to prevent Node debugger attachment/output
const commandOptions = {
  env: { NODE_OPTIONS: "--no-inspect" }, // Clear NODE_OPTIONS to prevent debugger attachment
  timeoutMs: 5000 // 5 second timeout for commands
};

// Very simple tests to see if the CLI works at all
describe("Minimal CLI E2E Tests", function() {
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
    expect(result.stdout).to.include("help");
    expect(result.stdout).to.include("support");
    expect(result.stdout).to.include("status");
  });
});
