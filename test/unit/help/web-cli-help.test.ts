import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import stripAnsi from "strip-ansi";

import CustomHelp from "../../../src/help.js";
import { ConfigManager } from "../../../src/services/config-manager.js";

describe("CLI Help", function() {
  describe("Web CLI Help", function() {
    let sandbox: sinon.SinonSandbox;
    let originalEnv: NodeJS.ProcessEnv;
    let consoleLogStub: sinon.SinonStub;
    let _processExitStub: sinon.SinonStub;
    let configManagerStub: sinon.SinonStubbedInstance<ConfigManager>;

    beforeEach(function() {
      sandbox = sinon.createSandbox();
      originalEnv = { ...process.env };

      // Stub console.log to capture output
      consoleLogStub = sandbox.stub(console, "log");

      // Stub process.exit to prevent test runner from exiting
      _processExitStub = sandbox.stub(process, "exit");

      // Stub ConfigManager
      configManagerStub = sandbox.createStubInstance(ConfigManager);
      configManagerStub.getAccessToken.returns(undefined as any);

      // Enable Web CLI mode
      process.env.ABLY_WEB_CLI_MODE = "true";
    });

    afterEach(function() {
      sandbox.restore();
      process.env = originalEnv;
    });

    function createMockConfig(commands: any[] = [], topics: any[] = []): Config {
      return {
        bin: "ably",
        root: "",
        dataDir: "",
        configDir: "",
        cacheDir: "",
        name: "@ably/cli",
        version: "0.8.1",
        pjson: {} as any,
        channel: "stable",
        commands: commands,
        topics: topics,
        findCommand: sandbox.stub().returns(null),
        findTopic: sandbox.stub().returns(null),
        runHook: sandbox.stub(),
        runCommand: sandbox.stub(),
        s3Url: "",
        s3Key: sandbox.stub(),
        valid: true,
        plugins: [],
        binPath: "",
        userAgent: "",
        shellEnabled: false,
        topicSeparator: " ",
        versionAdd: sandbox.stub(),
        scopedEnvVar: sandbox.stub(),
        scopedEnvVarTrue: sandbox.stub(),
        scopedEnvVarKey: sandbox.stub(),
      } as unknown as Config;
    }

    describe("formatRoot in Web CLI mode", function() {
      it("should show simplified help when no --help flag is provided", async function() {
        const mockConfig = createMockConfig();
        const help = new CustomHelp(mockConfig);

        // Stub the configManager property
        (help as any).configManager = configManagerStub;

        // Simulate no --help flag in argv
        process.argv = ["node", "ably"];

        await help.showRootHelp();

        expect(consoleLogStub.calledOnce).to.be.true;
        const output = stripAnsi(consoleLogStub.firstCall.args[0]);

        // Should show QUICK START section
        expect(output).to.include("QUICK START");
        expect(output).to.include("View all available commands: ably --help");
        expect(output).to.include("Publish a message: ably channels publish [channel] [message]");
        expect(output).to.include("Subscribe to a channel: ably channels subscribe [channel]");

        // Should show channels:logs command for authenticated users
        expect(output).to.include("View live channel events: ably channels logs");

        // Should NOT show COMMANDS section
        expect(output).to.not.include("COMMANDS\n");
      });

      it("should show full command list when --help flag is provided", async function() {
        const mockCommands: any[] = [];
        const mockTopics = [
          { name: "channels", description: "Interact with channels", hidden: false },
          { name: "rooms", description: "Interact with rooms", hidden: false },
          { name: "spaces", description: "Interact with spaces", hidden: false },
          // Restricted topics that should be filtered out
          { name: "accounts", description: "Manage accounts", hidden: false },
          { name: "config", description: "Manage config", hidden: false },
        ];

        const mockConfig = createMockConfig(mockCommands, mockTopics);
        const help = new CustomHelp(mockConfig);

        // Stub the configManager property
        (help as any).configManager = configManagerStub;

        // Simulate --help flag in argv
        process.argv = ["node", "ably", "--help"];

        await help.showRootHelp();

        expect(consoleLogStub.calledOnce).to.be.true;
        const output = stripAnsi(consoleLogStub.firstCall.args[0]);

        // Should show browser-based CLI title
        expect(output).to.include("ably.com browser-based CLI for Pub/Sub, Chat, Spaces and the Control API");

        // Should show COMMANDS section
        expect(output).to.include("COMMANDS");

        // Should show allowed commands
        expect(output).to.include("channels");
        expect(output).to.include("rooms");
        expect(output).to.include("spaces");

        // Should show accounts topic (only specific subcommands are restricted in authenticated mode)
        expect(output).to.include("accounts");

        // Should NOT show config (wildcard restriction)
        expect(output).to.not.include("config");

        // Should NOT show QUICK START section
        expect(output).to.not.include("QUICK START");
      });

      it("should show full command list when -h flag is provided", async function() {
        const mockCommands = [
          { id: "channels", description: "Interact with channels", hidden: false },
          { id: "help", description: "Get help", hidden: false },
        ];

        const mockConfig = createMockConfig(mockCommands);
        const help = new CustomHelp(mockConfig);

        // Stub the configManager property
        (help as any).configManager = configManagerStub;

        // Simulate -h flag in argv
        process.argv = ["node", "ably", "-h"];

        await help.showRootHelp();

        expect(consoleLogStub.calledOnce).to.be.true;
        const output = stripAnsi(consoleLogStub.firstCall.args[0]);

        // Should show COMMANDS section
        expect(output).to.include("COMMANDS");
        expect(output).to.include("channels");
        expect(output).to.include("help");
      });

      it("should filter out wildcard restricted commands", async function() {
        const mockCommands: any[] = [];
        const mockTopics = [
          { name: "channels", description: "Interact with channels", hidden: false },
          { name: "config", description: "Config command", hidden: false },
          { name: "mcp", description: "MCP command", hidden: false },
        ];

        const mockConfig = createMockConfig(mockCommands, mockTopics);
        const help = new CustomHelp(mockConfig);

        // Stub the configManager property
        (help as any).configManager = configManagerStub;

        // Simulate --help flag
        process.argv = ["node", "ably", "--help"];

        await help.showRootHelp();

        expect(consoleLogStub.calledOnce).to.be.true;
        const output = stripAnsi(consoleLogStub.firstCall.args[0]);

        // Should show allowed command
        expect(output).to.include("channels");

        // Should NOT show commands matching wildcard patterns (config*, mcp*)
        expect(output).to.not.include("config");
        expect(output).to.not.include("mcp");
      });

      it("should hide channels:logs in anonymous mode", async function() {
        const mockConfig = createMockConfig();
        const help = new CustomHelp(mockConfig);

        // Stub the configManager property
        (help as any).configManager = configManagerStub;

        // Enable anonymous/restricted mode
        process.env.ABLY_RESTRICTED_MODE = "true";

        // Simulate no --help flag in argv
        process.argv = ["node", "ably"];

        await help.showRootHelp();

        expect(consoleLogStub.calledOnce).to.be.true;
        const output = stripAnsi(consoleLogStub.firstCall.args[0]);

        // Should show QUICK START section
        expect(output).to.include("QUICK START");
        expect(output).to.include("Publish a message: ably channels publish [channel] [message]");
        expect(output).to.include("Subscribe to a channel: ably channels subscribe [channel]");

        // Should NOT show channels:logs command for anonymous users
        expect(output).to.not.include("View live channel events: ably channels logs");

        // Clean up
        delete process.env.ABLY_RESTRICTED_MODE;
      });

      it("should show login prompt in simplified view when not authenticated", async function() {
        const mockConfig = createMockConfig();
        const help = new CustomHelp(mockConfig);

        // Stub the configManager property
        (help as any).configManager = configManagerStub;

        // Ensure no auth tokens
        process.env.ABLY_ACCESS_TOKEN = undefined;
        process.env.ABLY_API_KEY = undefined;
        configManagerStub.getAccessToken.returns(undefined as any);

        // No --help flag
        process.argv = ["node", "ably"];

        await help.showRootHelp();

        expect(consoleLogStub.calledOnce).to.be.true;
        const output = stripAnsi(consoleLogStub.firstCall.args[0]);

        // Should show login prompt
        expect(output).to.include("You are not logged in");
        expect(output).to.include("$ ably login");
      });
    });

    describe("formatCommand in Web CLI mode", function() {
      it("should show restriction message for restricted commands", function() {
        const mockConfig = createMockConfig();
        const help = new CustomHelp(mockConfig);

        // Stub the configManager property
        (help as any).configManager = configManagerStub;

        // Stub super.formatCommand to return a dummy help text
        sandbox.stub(Object.getPrototypeOf(Object.getPrototypeOf(help)), "formatCommand")
          .returns("USAGE\n  $ ably accounts login\n\nDESCRIPTION\n  Login to your account");

        const restrictedCommand = {
          id: "accounts:login",
          description: "Login to account",
          hidden: false,
        };

        const output = stripAnsi(help.formatCommand(restrictedCommand as any));

        expect(output).to.include("This command is not available in the web CLI mode");
        expect(output).to.include("Please use the standalone CLI installation instead");
      });

      it("should show normal help for allowed commands", function() {
        const mockConfig = createMockConfig();
        const help = new CustomHelp(mockConfig);

        // Stub the configManager property
        (help as any).configManager = configManagerStub;

        const allowedCommand = {
          id: "channels:publish",
          description: "Publish a message",
          hidden: false,
        };

        // Stub super.formatCommand for this specific test
        const superStub = sandbox.stub(Object.getPrototypeOf(Object.getPrototypeOf(help)), "formatCommand")
          .returns("Normal command help");

        const output = help.formatCommand(allowedCommand as any);

        expect(output).to.equal("Normal command help");
        expect(output).to.not.include("not available in the web CLI mode");

        // Restore the stub
        superStub.restore();
      });
    });

    describe("shouldDisplay in Web CLI mode", function() {
      it("should filter out restricted commands", function() {
        const mockConfig = createMockConfig();
        const help = new CustomHelp(mockConfig);

        // Stub the configManager property
        (help as any).configManager = configManagerStub;

        // Test restricted commands
        expect(help.shouldDisplay({ id: "accounts:login" } as any)).to.be.false;
        expect(help.shouldDisplay({ id: "config" } as any)).to.be.false;
        expect(help.shouldDisplay({ id: "mcp:start" } as any)).to.be.false;

        // Test allowed commands
        expect(help.shouldDisplay({ id: "channels:publish" } as any)).to.be.true;
        expect(help.shouldDisplay({ id: "channels:subscribe" } as any)).to.be.true;
        expect(help.shouldDisplay({ id: "channels:logs" } as any)).to.be.true; // Now allowed for authenticated users
        expect(help.shouldDisplay({ id: "rooms:get" } as any)).to.be.true;
        expect(help.shouldDisplay({ id: "help" } as any)).to.be.true;
      });
    });
  });

  describe("Standard CLI Help (non-Web mode)", function() {
    let sandbox: sinon.SinonSandbox;
    let originalEnv: NodeJS.ProcessEnv;
    let consoleLogStub: sinon.SinonStub;
    let _processExitStub: sinon.SinonStub;

    function createMockConfig(commands: any[] = [], topics: any[] = []): Config {
      return {
        bin: "ably",
        root: "",
        dataDir: "",
        configDir: "",
        cacheDir: "",
        name: "@ably/cli",
        version: "0.8.1",
        pjson: {} as any,
        channel: "stable",
        commands: commands,
        topics: topics,
        findCommand: sandbox.stub().returns(null),
        findTopic: sandbox.stub().returns(null),
        runHook: sandbox.stub(),
        runCommand: sandbox.stub(),
        s3Url: "",
        s3Key: sandbox.stub(),
        valid: true,
        plugins: [],
        binPath: "",
        userAgent: "",
        shellEnabled: false,
        topicSeparator: " ",
        versionAdd: sandbox.stub(),
        scopedEnvVar: sandbox.stub(),
        scopedEnvVarTrue: sandbox.stub(),
        scopedEnvVarKey: sandbox.stub(),
      } as unknown as Config;
    }

    beforeEach(function() {
      sandbox = sinon.createSandbox();
      originalEnv = { ...process.env };

      consoleLogStub = sandbox.stub(console, "log");
      _processExitStub = sandbox.stub(process, "exit");

      // Disable Web CLI mode
      process.env.ABLY_WEB_CLI_MODE = "false";
    });

    afterEach(function() {
      sandbox.restore();
      process.env = originalEnv;
    });

    it("should show standard help with all commands", async function() {
      const mockCommands = [
        { id: "channels", description: "Interact with channels", hidden: false },
        { id: "accounts", description: "Manage accounts", hidden: false },
        { id: "config", description: "Manage config", hidden: false },
      ];

      const mockConfig = createMockConfig(mockCommands);

      const help = new CustomHelp(mockConfig);

      // Stub the configManager property
      const standardConfigManagerStub = sandbox.createStubInstance(ConfigManager);
      standardConfigManagerStub.getAccessToken.returns(undefined as any);
      (help as any).configManager = standardConfigManagerStub;

      await help.showRootHelp();

      expect(consoleLogStub.calledOnce).to.be.true;
      const output = stripAnsi(consoleLogStub.firstCall.args[0]);

      // Should show standard CLI title
      expect(output).to.include("ably.com CLI for Pub/Sub, Chat, Spaces and the Control API");

      // Should show all commands (no filtering)
      expect(output).to.include("channels");
      expect(output).to.include("accounts");
      expect(output).to.include("config");
    });
  });
});