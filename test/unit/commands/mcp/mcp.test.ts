import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";

import McpStartServer from "../../../../src/commands/mcp/start-server.js";
import { AblyMcpServer } from "../../../../src/mcp/mcp-server.js";
import { ConfigManager } from "../../../../src/services/config-manager.js";

// Testable subclass for MCP start server command
class TestableMcpStartServer extends McpStartServer {
  private _parseResult: any;
  public mockMcpServer: any;
  public mockConfigManager: any;

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  public override async parse() {
    return this._parseResult;
  }

  // Override to inject mock dependencies
  protected createMcpServer(_configManager: any, _options: any) {
    return this.mockMcpServer;
  }

  protected createConfigManager() {
    return this.mockConfigManager;
  }

  protected override checkWebCliRestrictions() {
    // Skip web CLI restrictions for testing
  }

  protected override interactiveHelper = {
    confirm: sinon.stub().resolves(true),
    promptForText: sinon.stub().resolves("fake-input"),
    promptToSelect: sinon.stub().resolves("fake-selection"),
  } as any;
}

describe("mcp commands", function () {
  let sandbox: sinon.SinonSandbox;
  let mockConfig: Config;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("mcp start-server", function () {
    let command: TestableMcpStartServer;
    let startStub: sinon.SinonStub;
    let mockMcpServer: any;
    let mockConfigManager: any;

    beforeEach(function () {
      command = new TestableMcpStartServer([], mockConfig);
      
      startStub = sandbox.stub().resolves();
      mockMcpServer = {
        start: startStub,
      };

      mockConfigManager = {
        getConfig: sandbox.stub().returns({
          defaultAccount: { alias: "test-account" },
          accounts: { "test-account": { accessToken: "test-token" } },
        }),
        saveConfig: sandbox.stub().resolves(),
      };

      command.mockMcpServer = mockMcpServer;
      command.mockConfigManager = mockConfigManager;

      command.setParseResult({
        flags: {},
        args: {},
        argv: [],
        raw: [],
      });
    });

    it("should start MCP server successfully", async function () {
      await command.run();

      expect(startStub.calledOnce).to.be.true;
    });

    it("should pass control host option to MCP server", async function () {
      command.setParseResult({
        flags: { "control-host": "custom.ably.io" },
        args: {},
        argv: [],
        raw: [],
      });

      // Mock the actual constructor call
      const mcpServerConstructorSpy = sandbox.spy();
      const originalAblyMcpServer = AblyMcpServer;
      
      // Temporarily replace the constructor
      (globalThis as any).AblyMcpServer = function (configManager: any, options: any) {
        mcpServerConstructorSpy(configManager, options);
        return mockMcpServer;
      };

      try {
        await command.run();

        expect(mcpServerConstructorSpy.calledOnce).to.be.true;
        const constructorArgs = mcpServerConstructorSpy.getCall(0).args;
        expect(constructorArgs[1]).to.deep.include({
          controlHost: "custom.ably.io",
        });
      } finally {
        // Restore the original constructor
        (globalThis as any).AblyMcpServer = originalAblyMcpServer;
      }
    });

    it("should handle MCP server startup errors", async function () {
      startStub.rejects(new Error("Failed to bind to port"));

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect((error as Error).message).to.include("Failed to start MCP server");
      }
    });
  });

  describe("AblyMcpServer", function () {
    let mockConfigManager: any;
    let server: AblyMcpServer;

    beforeEach(function () {
      mockConfigManager = {
        getConfig: sandbox.stub().returns({
          defaultAccount: { alias: "test-account" },
          accounts: { "test-account": { accessToken: "test-token" } },
        }),
        saveConfig: sandbox.stub().resolves(),
      };
    });

    afterEach(function () {
      // Clean up server if it was created
      server = null as any;
    });

    it("should initialize with default options", function () {
      server = new AblyMcpServer(mockConfigManager);
      
      expect(server).to.be.instanceOf(AblyMcpServer);
    });

    it("should initialize with custom control host", function () {
      const options = { controlHost: "custom.ably.io" };
      server = new AblyMcpServer(mockConfigManager, options);
      
      expect(server).to.be.instanceOf(AblyMcpServer);
    });

    it("should handle missing configuration gracefully", function () {
      mockConfigManager.getConfig.returns({});
      
      expect(() => {
        server = new AblyMcpServer(mockConfigManager);
      }).to.not.throw();
    });

    describe("MCP protocol operations", function () {
      beforeEach(function () {
        server = new AblyMcpServer(mockConfigManager);
      });

      it("should expose available start method", function () {
        // Since AblyMcpServer is a complex class, we'll test the basic structure
        // In a real implementation, you'd test the MCP protocol methods
        expect(server).to.have.property("start");
        expect(typeof server.start).to.equal("function");
      });

      it("should handle basic server lifecycle", async function () {
        // Mock process.exit to prevent actual exit
        const _originalExit = process.exit;
        const exitSpy = sandbox.stub(process, "exit");
        
        try {
          // Start the server in the background
          const _startPromise = server.start();
          
          // Give it a moment to start
          await new Promise(resolve => setTimeout(resolve, 10));
          
          // Simulate SIGINT signal for graceful shutdown
          process.emit("SIGINT", "SIGINT");
          
          // Give it a moment to shutdown
          await new Promise(resolve => setTimeout(resolve, 10));
          
          // Verify that process.exit was called
          expect(exitSpy.calledWith(0)).to.be.true;
        } finally {
          // Restore process.exit
          exitSpy.restore();
        }
      });
    });

    describe("error handling", function () {
      it("should handle server startup with invalid configuration", function () {
        // Test with null configuration
        mockConfigManager.getConfig.returns(null);
        
        server = new AblyMcpServer(mockConfigManager);
        
        // Server should still be created, errors would occur on start()
        expect(server).to.be.instanceOf(AblyMcpServer);
      });

      it("should handle empty configuration", function () {
        mockConfigManager.getConfig.returns({});
        
        server = new AblyMcpServer(mockConfigManager);
        
        expect(server).to.be.instanceOf(AblyMcpServer);
      });

      it("should handle missing config manager methods", function () {
        const incompleteConfigManager = {
          getConfig: sandbox.stub().returns({}),
          // Missing other methods
        };
        
        server = new AblyMcpServer(incompleteConfigManager as any);
        
        expect(server).to.be.instanceOf(AblyMcpServer);
      });
    });
  });
});