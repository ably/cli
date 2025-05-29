import { expect } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import * as Ably from "ably";
import { AblyBaseCommand } from "../../../src/base-command.js";
import { ConfigManager } from "../../../src/services/config-manager.js";
import { InteractiveHelper } from "../../../src/services/interactive-helper.js";
import { ControlApi } from "../../../src/services/control-api.js";
import { BaseFlags } from "../../../src/types/cli.js";
import { Config } from "@oclif/core";
import { trackAblyClient } from "../../setup.js";

// Create a testable implementation of the abstract AblyBaseCommand
class TestCommand extends AblyBaseCommand {
  // Expose protected methods for testing
  public testCheckWebCliRestrictions(): void {
    this.checkWebCliRestrictions();
  }

  public testCreateAblyRestClient(options: Ably.ClientOptions | BaseFlags): Ably.Rest {
    return this.createAblyRestClient(options);
  }

  public async testCreateAblyClient(flags: BaseFlags): Promise<Ably.Realtime | null> {
    return this.createAblyClient(flags);
  }

  public testGetClientOptions(flags: BaseFlags): Ably.ClientOptions {
    return this.getClientOptions(flags);
  }

  public testFormatJsonOutput(data: Record<string, unknown>, flags: BaseFlags): string {
    return this.formatJsonOutput(data, flags);
  }

  public testShouldOutputJson(flags: BaseFlags): boolean {
    return this.shouldOutputJson(flags);
  }

  public testIsPrettyJsonOutput(flags: BaseFlags): boolean {
    return this.isPrettyJsonOutput(flags);
  }

  public testParseApiKey(apiKey: string) {
    return this.parseApiKey(apiKey);
  }

  public testEnsureAppAndKey(flags: BaseFlags): Promise<{ apiKey: string; appId: string } | null> {
    return this.ensureAppAndKey(flags);
  }

  public testIsAllowedInWebCliMode(command?: string): boolean {
    return this.isAllowedInWebCliMode(command);
  }

  public testShouldShowAuthInfo(): boolean {
    return this.shouldShowAuthInfo();
  }

  public testDisplayAuthInfo(flags: BaseFlags, showAppInfo: boolean = true): void {
    this.displayAuthInfo(flags, showAppInfo);
  }

  public testIsTestMode(): boolean {
    return this.isTestMode();
  }

  public testLogCliEvent(flags: BaseFlags, component: string, event: string, message: string, data: Record<string, unknown> = {}): void {
    this.logCliEvent(flags, component, event, message, data);
  }

  public testOutputJsonError(message: string, errorDetails = {}): void {
    this.outputJsonError(message, errorDetails);
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

  async run(): Promise<void> {
    // Empty implementation
  }
}

describe("AblyBaseCommand - Enhanced Coverage", function() {
  let command: TestCommand;
  let configManagerStub: sinon.SinonStubbedInstance<ConfigManager>;
  let interactiveHelperStub: sinon.SinonStubbedInstance<InteractiveHelper>;
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;
  let mockAblyClient: sinon.SinonStubbedInstance<Ably.Realtime>;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    originalEnv = { ...process.env };

    // Reset env before each test
    process.env = { ...originalEnv };
    process.env.ABLY_CLI_TEST_MODE = 'true';

    // Stub fs operations
    sandbox.stub(fs, "existsSync").returns(true);
    sandbox.stub(fs, "readFileSync").returns("");
    sandbox.stub(fs, "mkdirSync");
    sandbox.stub(fs, "writeFileSync");

    // Create stubs for dependencies
    configManagerStub = sandbox.createStubInstance(ConfigManager);
    sandbox.stub(ConfigManager.prototype as any, "ensureConfigDirExists").callsFake(() => {});
    sandbox.stub(ConfigManager.prototype as any, "saveConfig").callsFake(() => {});

    interactiveHelperStub = sandbox.createStubInstance(InteractiveHelper);

    // Mock Ably client
    mockAblyClient = sandbox.createStubInstance(Ably.Realtime);
    mockAblyClient.connection = {
      once: sandbox.stub(),
      state: 'connected'
    } as any;

    const mockConfig = {
      root: "",
    } as unknown as Config;

    command = new TestCommand([], mockConfig);
    command.testConfigManager = configManagerStub;
    command.testInteractiveHelper = interactiveHelperStub;
  });

  afterEach(function() {
    sandbox.restore();
    process.env = originalEnv;
  });

  describe("initialization and setup", function() {
    it("should initialize with correct dependencies", function() {
      expect(command.testConfigManager).to.be.instanceOf(ConfigManager);
      expect(command.testInteractiveHelper).to.be.instanceOf(InteractiveHelper);
    });

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

  describe("authentication and client creation", function() {
    it("should create REST client with API key", function() {
      const options: Ably.ClientOptions = {
        key: "appId.keyId:keySecret"
      };

      // Mock the global test mocks
      const mockRestClient = sandbox.createStubInstance(Ably.Rest);
      (globalThis as any).__TEST_MOCKS__ = {
        ablyRestMock: mockRestClient
      };

      const client = command.testCreateAblyRestClient(options);
      expect(client).to.equal(mockRestClient);
    });

    it("should get client options from flags", function() {
      const flags: BaseFlags = {
        "api-key": "appId.keyId:keySecret",
        "client-id": "testClient",
        host: "test.ably.io",
        env: "sandbox"
      };

      const options = command.testGetClientOptions(flags);
      
      expect(options.key).to.equal("appId.keyId:keySecret");
      expect(options.clientId).to.equal("testClient");
      expect(options.environment).to.equal("sandbox");
    });

    it("should handle token authentication", function() {
      const flags: BaseFlags = {
        token: "testToken123"
      };

      const options = command.testGetClientOptions(flags);
      expect(options.token).to.equal("testToken123");
    });

    it("should handle client ID override with 'none'", function() {
      const flags: BaseFlags = {
        "api-key": "appId.keyId:keySecret",
        "client-id": "none"
      };

      const options = command.testGetClientOptions(flags);
      expect(options.clientId).to.be.null;
    });

    it("should create Ably client in test mode", async function() {
      const flags: BaseFlags = {};
      
      const mockRestClient = sandbox.createStubInstance(Ably.Rest);
      (globalThis as any).__TEST_MOCKS__ = {
        ablyRestMock: mockRestClient
      };

      const client = await command.testCreateAblyClient(flags);
      expect(client).to.equal(mockRestClient);
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

    it("should detect pretty JSON output", function() {
      expect(command.testIsPrettyJsonOutput({ "pretty-json": true })).to.be.true;
      expect(command.testIsPrettyJsonOutput({ json: true })).to.be.false;
    });

    it("should format JSON output correctly", function() {
      const data = { success: true, message: "test" };
      const flags: BaseFlags = { json: true };

      const output = command.testFormatJsonOutput(data, flags);
      expect(output).to.equal(JSON.stringify(data));
    });

    it("should format pretty JSON output with colors", function() {
      const data = { success: true, message: "test" };
      const flags: BaseFlags = { "pretty-json": true };

      const output = command.testFormatJsonOutput(data, flags);
      expect(output).to.include("success");
      expect(output).to.include("true");
    });
  });

  describe("error handling", function() {
    it("should output JSON error correctly", function() {
      const logSpy = sandbox.spy(command, 'log');
      
      command.testOutputJsonError("Test error", { code: 40100 });
      
      expect(logSpy.calledOnce).to.be.true;
      const output = JSON.parse(logSpy.firstCall.args[0]);
      expect(output).to.have.property('error', 'Test error');
      expect(output).to.have.property('success', false);
      expect(output.errorDetails).to.have.property('code', 40100);
    });

    it("should handle web CLI restrictions", function() {
      command.testIsWebCliMode = true;
      Object.defineProperty(command, "id", { value: "accounts:login" });

      expect(() => command.testCheckWebCliRestrictions()).to.throw();
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
  });

  describe("authentication info display", function() {
    it("should show auth info when appropriate", function() {
      Object.defineProperty(command, "id", { value: "channels:publish" });
      expect(command.testShouldShowAuthInfo()).to.be.true;
    });

    it("should hide auth info for login commands", function() {
      Object.defineProperty(command, "id", { value: "accounts:login" });
      expect(command.testShouldShowAuthInfo()).to.be.false;
    });

    it("should display auth info with account and app details", function() {
      const logSpy = sandbox.spy(command, 'log');
      
      configManagerStub.getCurrentAccount.returns({
        accountName: "Test Account",
        accountId: "testAccountId",
        accessToken: "token"
      } as any);
      
      configManagerStub.getCurrentAppId.returns("testApp");
      configManagerStub.getAppName.withArgs("testApp").returns("Test App");
      configManagerStub.getApiKey.withArgs("testApp").returns("testApp.key:secret");
      configManagerStub.getKeyName.withArgs("testApp").returns("Test Key");

      const flags: BaseFlags = {};
      command.testDisplayAuthInfo(flags, true);

      expect(logSpy.called).to.be.true;
      const output = logSpy.getCalls().map(call => call.args[0]).join(' ');
      expect(output).to.include("Test Account");
      expect(output).to.include("Test App");
    });
  });

  describe("logging and events", function() {
    it("should log CLI events when verbose", function() {
      const logSpy = sandbox.spy(command, 'log');
      const flags: BaseFlags = { verbose: true };

      command.testLogCliEvent(flags, "TestComponent", "testEvent", "Test message", { key: "value" });

      expect(logSpy.called).to.be.true;
      const output = logSpy.firstCall.args[0];
      expect(output).to.include("TestComponent");
      expect(output).to.include("testEvent");
      expect(output).to.include("Test message");
    });

    it("should not log CLI events when not verbose", function() {
      const logSpy = sandbox.spy(command, 'log');
      const flags: BaseFlags = { verbose: false };

      command.testLogCliEvent(flags, "TestComponent", "testEvent", "Test message");

      expect(logSpy.called).to.be.false;
    });
  });

  describe("ensureAppAndKey functionality", function() {
    it("should handle web CLI mode with environment API key", async function() {
      command.testIsWebCliMode = true;
      process.env.ABLY_API_KEY = "testApp.keyId:keySecret";

      const result = await command.testEnsureAppAndKey({});

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("testApp");
      expect(result?.apiKey).to.equal("testApp.keyId:keySecret");
    });

    it("should return null when no authentication available", async function() {
      configManagerStub.getCurrentAppId.returns(undefined);
      configManagerStub.getApiKey.returns(undefined);
      configManagerStub.getAccessToken.returns(undefined);
      delete process.env.ABLY_API_KEY;

      const result = await command.testEnsureAppAndKey({});
      expect(result).to.be.null;
    });

    it("should use flags over config values", async function() {
      const flags: BaseFlags = {
        app: "flagApp",
        "api-key": "flagApp.key:secret"
      };

      const result = await command.testEnsureAppAndKey(flags);

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("flagApp");
      expect(result?.apiKey).to.equal("flagApp.key:secret");
    });

    it("should handle token authentication", async function() {
      const flags: BaseFlags = {
        token: "testToken",
        app: "testApp"
      };

      const result = await command.testEnsureAppAndKey(flags);

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("testApp");
      expect(result?.apiKey).to.equal("");
    });

    it("should prompt for app selection when using access token", async function() {
      const flags: BaseFlags = {};
      
      configManagerStub.getCurrentAppId.returns(undefined);
      configManagerStub.getAccessToken.returns("testAccessToken");
      
      const mockApp = { 
        id: "selectedApp", 
        name: "Selected App",
        accountId: "testAccount",
        created: Date.now(),
        modified: Date.now(),
        status: "active",
        tlsOnly: false
      };
      interactiveHelperStub.selectApp.resolves(mockApp);
      
      const mockKey = { 
        id: "keyId", 
        key: "selectedApp.keyId:secret", 
        name: "Selected Key",
        appId: "selectedApp",
        capability: {},
        created: Date.now(),
        modified: Date.now(),
        status: "active",
        revocable: false
      };
      interactiveHelperStub.selectKey.resolves(mockKey);

      const result = await command.testEnsureAppAndKey(flags);

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("selectedApp");
      expect(result?.apiKey).to.equal("selectedApp.keyId:secret");
      expect(interactiveHelperStub.selectApp.calledOnce).to.be.true;
      expect(interactiveHelperStub.selectKey.calledOnce).to.be.true;
    });
  });
});