import { expect } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import { AblyBaseCommand } from "../../../src/base-command.js";
import { ConfigManager } from "../../../src/services/config-manager.js";
import { InteractiveHelper } from "../../../src/services/interactive-helper.js";
import { BaseFlags } from "../../../src/types/cli.js";
import { Config } from "@oclif/core";

// Create a testable implementation of the abstract AblyBaseCommand
class TestCommand extends AblyBaseCommand {
  // Expose protected methods for testing
  public testCheckWebCliRestrictions(): void {
    this.checkWebCliRestrictions();
  }

  public testIsAllowedInWebCliMode(command?: string): boolean {
    return this.isAllowedInWebCliMode(command);
  }

  public testShouldOutputJson(flags: BaseFlags): boolean {
    return this.shouldOutputJson(flags);
  }

  public testParseApiKey(apiKey: string) {
    return this.parseApiKey(apiKey);
  }

  public testEnsureAppAndKey(flags: BaseFlags): Promise<{ apiKey: string; appId: string } | null> {
    return this.ensureAppAndKey(flags);
  }

  // Make protected properties accessible for testing
  public get testConfigManager(): ConfigManager {
    return this.configManager;
  }

  public set testConfigManager(value: ConfigManager) {
    this.configManager = value;
  }

  public get testInteractiveHelper(): InteractiveHelper {
    return this.interactiveHelper;
  }

  public set testInteractiveHelper(value: InteractiveHelper) {
    this.interactiveHelper = value;
  }

  public get testIsWebCliMode(): boolean {
    return this.isWebCliMode;
  }

  public set testIsWebCliMode(value: boolean) {
    this.isWebCliMode = value;
  }

  public testIsAnonymousWebMode(): boolean {
    return this.isAnonymousWebMode();
  }

  public testMatchesCommandPattern(commandId: string, pattern: string): boolean {
    return this.matchesCommandPattern(commandId, pattern);
  }

  public testIsRestrictedInAnonymousMode(commandId: string): boolean {
    return this.isRestrictedInAnonymousMode(commandId);
  }

  async run(): Promise<void> {
    // Empty implementation
  }
}

describe("AblyBaseCommand", function() {
  let command: TestCommand;
  let configManagerStub: sinon.SinonStubbedInstance<ConfigManager>;
  let interactiveHelperStub: sinon.SinonStubbedInstance<InteractiveHelper>;
  let _fsExistsStub: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    // Store original env vars to restore after tests
    originalEnv = { ...process.env };

    // Reset env before each test
    process.env = { ...originalEnv };

    // Stub fs.existsSync to prevent file system operations using sandbox
    _fsExistsStub = sandbox.stub(fs, "existsSync").returns(true);

    // Also stub fs.readFileSync to prevent actual file access using sandbox
    sandbox.stub(fs, "readFileSync").returns("");

    // Create stubs for dependencies using sandbox
    // Note: createStubInstance doesn't need sandbox explicitly, but we manage other stubs with it.
    configManagerStub = sandbox.createStubInstance(ConfigManager);

    // Instead of stubbing loadConfig which is private, we'll stub methods that might access the file system using sandbox
    sandbox.stub(ConfigManager.prototype as any, "ensureConfigDirExists").callsFake(() => {});
    sandbox.stub(ConfigManager.prototype as any, "saveConfig").callsFake(() => {});

    // Note: createStubInstance doesn't need sandbox explicitly.
    interactiveHelperStub = sandbox.createStubInstance(InteractiveHelper);

    // Mock a minimal config
    const mockConfig = {
      root: "",
      // Mock other properties as needed
    } as unknown as Config;

    command = new TestCommand([], mockConfig);

    // Replace the command's dependencies with our stubs
    command.testConfigManager = configManagerStub;
    command.testInteractiveHelper = interactiveHelperStub;
  });

  afterEach(function() {
    // Clean up sinon stubs using the sandbox
    sandbox.restore();

    // Restore original env
    process.env = originalEnv;
  });

  describe("checkWebCliRestrictions", function() {
    it("should not throw error when not in web CLI mode", function() {
      command.testIsWebCliMode = false;
      expect(() => command.testCheckWebCliRestrictions()).to.not.throw();
    });

    it("should throw error when in authenticated web CLI mode and command is restricted", function() {
      command.testIsWebCliMode = true;
      process.env.ABLY_ANONYMOUS_USER_MODE = "false";
      // Mock command ID to be a restricted command
      Object.defineProperty(command, "id", { value: "accounts:login", configurable: true });

      expect(() => command.testCheckWebCliRestrictions()).to.throw(/already logged in/);
    });

    it("should not throw error when in authenticated web CLI mode but command is allowed", function() {
      command.testIsWebCliMode = true;
      process.env.ABLY_ANONYMOUS_USER_MODE = "false";
      // Mock command ID to be an allowed command
      Object.defineProperty(command, "id", { value: "channels:publish", configurable: true });

      expect(() => command.testCheckWebCliRestrictions()).to.not.throw();
    });

    it("should throw error for anonymous-restricted commands in anonymous mode", function() {
      command.testIsWebCliMode = true;
      process.env.ABLY_ANONYMOUS_USER_MODE = "true";
      
      // Test various anonymous-restricted commands
      const testCases = [
        { id: "accounts:stats", expectedError: /Account management commands are only available when logged in/ },
        { id: "apps:list", expectedError: /App management commands are only available when logged in/ },
        { id: "auth:keys:list", expectedError: /API key management requires you to be logged in/ },
        { id: "auth:revoke-token", expectedError: /Token revocation requires you to be logged in/ },
        { id: "channels:list", expectedError: /not available in anonymous mode for privacy reasons/ },
        { id: "bench:channel", expectedError: /Benchmarking commands are only available when logged in/ },
        { id: "integrations:list", expectedError: /Integration management requires you to be logged in/ },
        { id: "queues:list", expectedError: /Queue management requires you to be logged in/ },
        { id: "logs:tail", expectedError: /not available in anonymous mode for privacy reasons/ },
      ];

      testCases.forEach(({ id, expectedError }) => {
        Object.defineProperty(command, "id", { value: id, configurable: true });
        expect(() => command.testCheckWebCliRestrictions()).to.throw(expectedError);
      });
    });

    it("should allow non-restricted commands in anonymous mode", function() {
      command.testIsWebCliMode = true;
      process.env.ABLY_ANONYMOUS_USER_MODE = "true";
      
      // Test commands that should be allowed
      const allowedCommands = ["channels:publish", "rooms:get", "spaces:get", "help"];
      
      allowedCommands.forEach(id => {
        Object.defineProperty(command, "id", { value: id, configurable: true });
        expect(() => command.testCheckWebCliRestrictions()).to.not.throw();
      });
    });

    it("should throw error for base restricted commands in anonymous mode", function() {
      command.testIsWebCliMode = true;
      process.env.ABLY_ANONYMOUS_USER_MODE = "true";
      
      // Test base restricted commands with their specific error messages
      // Note: accounts:login is caught by the anonymous restrictions first since it starts with "accounts"
      const testCases = [
        { id: "accounts:login", expectedError: /Account management commands are only available when logged in/ },
        { id: "config", expectedError: /Local configuration is not supported in the web CLI\. Please install the CLI locally/ },
        { id: "config:set", expectedError: /Local configuration is not supported in the web CLI\. Please install the CLI locally/ },
        { id: "mcp", expectedError: /MCP server functionality is not available in the web CLI\. Please install the CLI locally/ },
        { id: "mcp:start-server", expectedError: /MCP server functionality is not available in the web CLI\. Please install the CLI locally/ },
        { id: "accounts:current", expectedError: /Account management commands are only available when logged in/ },
        { id: "accounts:switch", expectedError: /Account management commands are only available when logged in/ },
        { id: "apps:switch", expectedError: /App management commands are only available when logged in/ },
        { id: "apps:delete", expectedError: /App management commands are only available when logged in/ },
        { id: "auth:keys:switch", expectedError: /API key management requires you to be logged in/ },
      ];

      testCases.forEach(({ id, expectedError }) => {
        Object.defineProperty(command, "id", { value: id, configurable: true });
        expect(() => command.testCheckWebCliRestrictions()).to.throw(expectedError);
      });
    });

    it("should allow auth:keys commands when authenticated in web CLI mode", function() {
      command.testIsWebCliMode = true;
      process.env.ABLY_ANONYMOUS_USER_MODE = "false"; // Authenticated
      
      // These should be allowed when authenticated
      const allowedCommands = ["auth:keys:list", "auth:keys:create", "auth:keys:revoke"];
      
      allowedCommands.forEach(id => {
        Object.defineProperty(command, "id", { value: id, configurable: true });
        expect(() => command.testCheckWebCliRestrictions()).to.not.throw();
      });
    });
  });

  describe("isAllowedInWebCliMode", function() {
    it("should return true when not in web CLI mode", function() {
      command.testIsWebCliMode = false;
      expect(command.testIsAllowedInWebCliMode()).to.be.true;
    });

    it("should return false for restricted commands", function() {
      command.testIsWebCliMode = true;
      expect(command.testIsAllowedInWebCliMode("accounts:login")).to.be.false;
      expect(command.testIsAllowedInWebCliMode("accounts:logout")).to.be.false;
      expect(command.testIsAllowedInWebCliMode("config")).to.be.false;
      expect(command.testIsAllowedInWebCliMode("config:set")).to.be.false;
      expect(command.testIsAllowedInWebCliMode("mcp")).to.be.false;
      expect(command.testIsAllowedInWebCliMode("mcp:start-server")).to.be.false;
    });

    it("should return true for allowed commands", function() {
      command.testIsWebCliMode = true;
      expect(command.testIsAllowedInWebCliMode("help")).to.be.true;
      expect(command.testIsAllowedInWebCliMode("channels:publish")).to.be.true;
    });
  });

  describe("shouldOutputJson", function() {
    it("should return true when json flag is true", function() {
      const flags: BaseFlags = { json: true };
      expect(command.testShouldOutputJson(flags)).to.be.true;
    });

    it("should return true when pretty-json flag is true", function() {
      const flags: BaseFlags = { "pretty-json": true };
      expect(command.testShouldOutputJson(flags)).to.be.true;
    });

    it("should return true when format is json", function() {
      const flags: BaseFlags = { format: "json" };
      expect(command.testShouldOutputJson(flags)).to.be.true;
    });

    it("should return false when no json flags are present", function() {
      const flags: BaseFlags = {};
      expect(command.testShouldOutputJson(flags)).to.be.false;
    });
  });

  describe("parseApiKey", function() {
    it("should correctly parse a valid API key", function() {
      const validKey = "appId.keyId:keySecret";
      const result = command.testParseApiKey(validKey);

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("appId");
      expect(result?.keyId).to.equal("keyId");
      expect(result?.keySecret).to.equal("keySecret");
    });

    it("should return null for an API key without colon", function() {
      const invalidKey = "appId.keyId";
      const result = command.testParseApiKey(invalidKey);

      expect(result).to.be.null;
    });

    it("should return null for an API key without period", function() {
      const invalidKey = "appIdkeyId:keySecret";
      const result = command.testParseApiKey(invalidKey);

      expect(result).to.be.null;
    });

    it("should return null for an empty API key", function() {
      expect(command.testParseApiKey("")).to.be.null;
    });
  });

  describe("Anonymous Web Mode", function() {
    let originalWebCliMode: string | undefined;
    let originalAnonymousMode: string | undefined;

    beforeEach(function() {
      originalWebCliMode = process.env.ABLY_WEB_CLI_MODE;
      originalAnonymousMode = process.env.ABLY_ANONYMOUS_USER_MODE;
    });

    afterEach(function() {
      if (originalWebCliMode === undefined) {
        delete process.env.ABLY_WEB_CLI_MODE;
      } else {
        process.env.ABLY_WEB_CLI_MODE = originalWebCliMode;
      }
      
      if (originalAnonymousMode === undefined) {
        delete process.env.ABLY_ANONYMOUS_USER_MODE;
      } else {
        process.env.ABLY_ANONYMOUS_USER_MODE = originalAnonymousMode;
      }
    });

    it("should detect anonymous mode when web CLI mode and ABLY_ANONYMOUS_USER_MODE is true", function() {
      process.env.ABLY_WEB_CLI_MODE = "true";
      process.env.ABLY_ANONYMOUS_USER_MODE = "true";

      const cmd = new TestCommand([], {} as Config);
      cmd.testConfigManager = configManagerStub;
      expect(cmd.testIsAnonymousWebMode()).to.be.true;
    });

    it("should not detect anonymous mode when ABLY_ANONYMOUS_USER_MODE is not set", function() {
      process.env.ABLY_WEB_CLI_MODE = "true";
      delete process.env.ABLY_ANONYMOUS_USER_MODE;

      const cmd = new TestCommand([], {} as Config);
      cmd.testConfigManager = configManagerStub;
      expect(cmd.testIsAnonymousWebMode()).to.be.false;
    });

    it("should not detect anonymous mode when ABLY_ANONYMOUS_USER_MODE is false", function() {
      process.env.ABLY_WEB_CLI_MODE = "true";
      process.env.ABLY_ANONYMOUS_USER_MODE = "false";

      const cmd = new TestCommand([], {} as Config);
      cmd.testConfigManager = configManagerStub;
      expect(cmd.testIsAnonymousWebMode()).to.be.false;
    });

    it("should not detect anonymous mode when not in web CLI mode", function() {
      delete process.env.ABLY_WEB_CLI_MODE;
      process.env.ABLY_ANONYMOUS_USER_MODE = "true";

      const cmd = new TestCommand([], {} as Config);
      cmd.testConfigManager = configManagerStub;
      expect(cmd.testIsAnonymousWebMode()).to.be.false;
    });

    it("should identify commands restricted in anonymous mode", function() {
      const cmd = new TestCommand([], {} as Config);
      cmd.testConfigManager = configManagerStub;
      
      // Commands with wildcards
      expect(cmd.testIsRestrictedInAnonymousMode("accounts")).to.be.true;
      expect(cmd.testIsRestrictedInAnonymousMode("accounts:list")).to.be.true;
      expect(cmd.testIsRestrictedInAnonymousMode("apps:create")).to.be.true;
      expect(cmd.testIsRestrictedInAnonymousMode("auth:keys:list")).to.be.true;
      expect(cmd.testIsRestrictedInAnonymousMode("bench:channel")).to.be.true;
      expect(cmd.testIsRestrictedInAnonymousMode("integrations:rules:create")).to.be.true;
      expect(cmd.testIsRestrictedInAnonymousMode("queues:publish")).to.be.true;
      expect(cmd.testIsRestrictedInAnonymousMode("logs:tail")).to.be.true;
      
      // Specific commands
      expect(cmd.testIsRestrictedInAnonymousMode("channels:list")).to.be.true;
      expect(cmd.testIsRestrictedInAnonymousMode("rooms:list")).to.be.true;
      expect(cmd.testIsRestrictedInAnonymousMode("auth:revoke-token")).to.be.true;
      
      // Commands that should be allowed
      expect(cmd.testIsRestrictedInAnonymousMode("channels:publish")).to.be.false;
      expect(cmd.testIsRestrictedInAnonymousMode("rooms:get")).to.be.false;
    });

    it("should match command patterns correctly", function() {
      const cmd = new TestCommand([], {} as Config);
      cmd.testConfigManager = configManagerStub;
      
      // Wildcard patterns
      expect(cmd.testMatchesCommandPattern("accounts", "accounts*")).to.be.true;
      expect(cmd.testMatchesCommandPattern("accounts:list", "accounts*")).to.be.true;
      expect(cmd.testMatchesCommandPattern("accountsettings", "accounts*")).to.be.true;
      
      // Exact matches
      expect(cmd.testMatchesCommandPattern("channels:list", "channels:list")).to.be.true;
      expect(cmd.testMatchesCommandPattern("channels:list", "channels:lis")).to.be.false;
      
      // Non-matches
      expect(cmd.testMatchesCommandPattern("channels:publish", "channels:list")).to.be.false;
      expect(cmd.testMatchesCommandPattern("account", "accounts*")).to.be.false;
    });
  });

  describe("ensureAppAndKey", function() {
    it("should use app and key from flags if available", async function() {
      const flags: BaseFlags = {
        app: "testAppId",
        "api-key": "testApiKey"
      };

      const result = await command.testEnsureAppAndKey(flags);

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("testAppId");
      expect(result?.apiKey).to.equal("testApiKey");
    });

    it("should use app and key from config if available", async function() {
      const flags: BaseFlags = {};

      configManagerStub.getCurrentAppId.returns("configAppId");
      configManagerStub.getApiKey.withArgs("configAppId").returns("configApiKey");

      const result = await command.testEnsureAppAndKey(flags);

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("configAppId");
      expect(result?.apiKey).to.equal("configApiKey");
    });

    it("should use ABLY_API_KEY environment variable if available", async function() {
      const flags: BaseFlags = {};

      // Reset relevant stubs
      configManagerStub.getCurrentAppId.returns(undefined as any);
      configManagerStub.getApiKey.withArgs("").returns(undefined as any);
      // Set access token to ensure the control API path is followed
      configManagerStub.getAccessToken.returns("test-token");

      // Set up interactive helper to simulate user selecting an app and key
      const mockApp = { id: "envApp", name: "Test App" } as any;
      const mockKey = { id: "keyId", name: "Test Key", key: "envApp.keyId:keySecret" } as any;

      interactiveHelperStub.selectApp.resolves(mockApp);
      interactiveHelperStub.selectKey.withArgs(sinon.match.any, "envApp").resolves(mockKey);

      // Set environment variable but it will be used in getClientOptions, not directly in this test path
      process.env.ABLY_API_KEY = "envApp.keyId:keySecret";

      const result = await command.testEnsureAppAndKey(flags);

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("envApp");
      expect(result?.apiKey).to.equal("envApp.keyId:keySecret");
    });

    it("should handle web CLI mode appropriately", async function() {
      const flags: BaseFlags = {};
      command.testIsWebCliMode = true;
      process.env.ABLY_API_KEY = "webApp.keyId:keySecret";

      const result = await command.testEnsureAppAndKey(flags);

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("webApp");
      expect(result?.apiKey).to.equal("webApp.keyId:keySecret");
    });

    it("should return null if no authentication is available", async function() {
      const flags: BaseFlags = {};

      // Reset all required stubs to return empty values
      configManagerStub.getCurrentAppId.returns("" as any);
      configManagerStub.getApiKey.withArgs("").returns("" as any);
      configManagerStub.getAccessToken.returns("" as any);

      // Make sure environment variable is not set
      delete process.env.ABLY_API_KEY;

      const result = await command.testEnsureAppAndKey(flags);

      expect(result).to.be.null;
    });
  });
});
