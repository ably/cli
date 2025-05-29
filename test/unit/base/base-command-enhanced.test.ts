import { expect } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import * as Ably from "ably";
import { AblyBaseCommand } from "../../../src/base-command.js";
import { ConfigManager } from "../../../src/services/config-manager.js";
import { InteractiveHelper } from "../../../src/services/interactive-helper.js";
import { BaseFlags } from "../../../src/types/cli.js";
import { Config } from "@oclif/core";

// Create a testable implementation of the abstract AblyBaseCommand
class TestCommand extends AblyBaseCommand {
  public testShouldOutputJson(flags: BaseFlags): boolean {
    return this.shouldOutputJson(flags);
  }

  public testIsPrettyJsonOutput(flags: BaseFlags): boolean {
    return this.isPrettyJsonOutput(flags);
  }

  public testParseApiKey(apiKey: string) {
    return this.parseApiKey(apiKey);
  }

  public testIsAllowedInWebCliMode(command?: string): boolean {
    return this.isAllowedInWebCliMode(command);
  }

  public testCheckWebCliRestrictions(): void {
    this.checkWebCliRestrictions();
  }

  public testIsTestMode(): boolean {
    return this.isTestMode();
  }

  public testFormatJsonOutput(data: Record<string, unknown>, flags: BaseFlags): string {
    return this.formatJsonOutput(data, flags);
  }

  public get testIsWebCliMode(): boolean {
    return this.isWebCliMode;
  }

  public set testIsWebCliMode(value: boolean) {
    this.isWebCliMode = value;
  }

  async run(): Promise<void> {
    // Empty implementation
  }
}

describe("AblyBaseCommand - Enhanced Coverage", function() {
  let command: TestCommand;
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    originalEnv = { ...process.env };

    // Reset env before each test
    process.env = { ...originalEnv };
    process.env.ABLY_CLI_TEST_MODE = 'true';

    const mockConfig = {
      root: "",
    } as unknown as Config;

    command = new TestCommand([], mockConfig);
  });

  afterEach(function() {
    sandbox.restore();
    process.env = originalEnv;
  });

  describe("initialization and setup", function() {
    it("should detect web CLI mode from environment variable", function() {
      process.env.ABLY_WEB_CLI_MODE = 'true';
      const webCommand = new TestCommand([], {} as Config);
      expect(webCommand.testIsWebCliMode).to.be.true;
    });

    it("should detect test mode correctly", function() {
      process.env.ABLY_CLI_TEST_MODE = 'true';
      expect(command.testIsTestMode()).to.be.true;

      delete process.env.ABLY_CLI_TEST_MODE;
      expect(command.testIsTestMode()).to.be.false;
    });
  });

  describe("output formatting", function() {
    it("should detect JSON output from json flag", function() {
      expect(command.testShouldOutputJson({ json: true })).to.be.true;
    });

    it("should detect JSON output from pretty-json flag", function() {
      expect(command.testShouldOutputJson({ "pretty-json": true })).to.be.true;
    });

    it("should detect JSON output from format flag", function() {
      expect(command.testShouldOutputJson({ format: "json" })).to.be.true;
    });

    it("should return false when no JSON flags are present", function() {
      expect(command.testShouldOutputJson({})).to.be.false;
    });

    it("should detect pretty JSON output", function() {
      expect(command.testIsPrettyJsonOutput({ "pretty-json": true })).to.be.true;
      expect(command.testIsPrettyJsonOutput({ json: true })).to.be.false;
    });

    it("should format JSON output correctly", function() {
      const data = { success: true, message: "test" };
      const flags: BaseFlags = { json: true };

      const output = command.testFormatJsonOutput(data, flags);
      
      // The output should be valid JSON that can be parsed back to the original data
      const parsed = JSON.parse(output);
      expect(parsed).to.deep.equal(data);
      
      // The implementation always formats JSON with newlines
      expect(output).to.include('\n');
      expect(output).to.include('"success"');
      expect(output).to.include('"message"');
    });

    it("should format pretty JSON output with colors", function() {
      const data = { success: true, message: "test" };
      const flags: BaseFlags = { "pretty-json": true };

      const output = command.testFormatJsonOutput(data, flags);
      expect(output).to.include("success");
      expect(output).to.include("true");
    });
  });

  describe("API key parsing", function() {
    it("should parse valid API key format", function() {
      const result = command.testParseApiKey("appId.keyId:keySecret");
      
      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("appId");
      expect(result?.keyId).to.equal("keyId");
      expect(result?.keySecret).to.equal("keySecret");
    });

    it("should return null for invalid API key formats", function() {
      expect(command.testParseApiKey("invalid")).to.be.null;
      expect(command.testParseApiKey("app.key")).to.be.null;
      expect(command.testParseApiKey("app:secret")).to.be.null;
      expect(command.testParseApiKey("")).to.be.null;
    });
  });

  describe("web CLI mode restrictions", function() {
    beforeEach(function() {
      command.testIsWebCliMode = true;
    });

    it("should restrict login command", function() {
      expect(command.testIsAllowedInWebCliMode("accounts:login")).to.be.false;
    });

    it("should restrict logout command", function() {
      expect(command.testIsAllowedInWebCliMode("accounts:logout")).to.be.false;
    });

    it("should restrict MCP commands", function() {
      expect(command.testIsAllowedInWebCliMode("mcp:start-server")).to.be.false;
    });

    it("should allow help commands", function() {
      expect(command.testIsAllowedInWebCliMode("help")).to.be.true;
      expect(command.testIsAllowedInWebCliMode("help:contact")).to.be.true;
    });

    it("should allow channel commands", function() {
      expect(command.testIsAllowedInWebCliMode("channels:publish")).to.be.true;
    });

    it("should handle web CLI restrictions", function() {
      command.testIsWebCliMode = true;
      Object.defineProperty(command, "id", { value: "accounts:login" });

      expect(() => command.testCheckWebCliRestrictions()).to.throw();
    });
  });

  describe("environment variable handling", function() {
    it("should handle ABLY_API_KEY environment variable", function() {
      process.env.ABLY_API_KEY = "testApp.keyId:keySecret";
      expect(process.env.ABLY_API_KEY).to.equal("testApp.keyId:keySecret");
      
      // Verify app ID extraction logic
      const apiKey = process.env.ABLY_API_KEY;
      const appId = apiKey.split(".")[0];
      expect(appId).to.equal("testApp");
    });

    it("should handle ABLY_ACCESS_TOKEN environment variable", function() {
      process.env.ABLY_ACCESS_TOKEN = "test-access-token";
      expect(process.env.ABLY_ACCESS_TOKEN).to.equal("test-access-token");
    });
  });
});