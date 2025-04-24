import { expect } from "chai";
import { execa } from "execa";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

// Helper function to get a temporary config directory
const getTestConfigDir = () => path.join(os.tmpdir(), `ably-cli-test-${Date.now()}`)

// Options for execa to prevent Node debugger attachment/output and manage config dir
const createExecaOptions = (configDir: string) => ({
  env: {
    NODE_OPTIONS: "", // Clear NODE_OPTIONS to prevent debugger attachment
    ABLY_CLI_CONFIG_DIR: configDir, // Use a temporary directory for config
  },
  reject: false, // Don't reject promise on non-zero exit code
});


describe("Help commands integration", function() {
  let configDir: string;
  let execaOptions: ReturnType<typeof createExecaOptions>;

  beforeEach(function() {
    // Create a temporary directory for config for each test
    configDir = getTestConfigDir();
    fs.ensureDirSync(configDir);
    execaOptions = createExecaOptions(configDir);
  });

  afterEach(function() {
    // Clean up the temporary config directory
    fs.removeSync(configDir);
  });

  describe("root help command", function() {
    it("should show all high-level topics", async function() {
      const result = await execa("node", ["bin/run.js", "--help"], execaOptions);
      expect(result.failed, `Help command stderr: ${result.stderr}`).to.be.false;
      expect(result.stderr).to.be.empty;
      expect(result.stdout).to.include("USAGE");
      // Check for some core topics
      expect(result.stdout).to.include("ably.com CLI for Pub/Sub");
      expect(result.stdout).to.include("COMMANDS");
    });
  });
});
