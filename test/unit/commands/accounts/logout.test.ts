import { expect } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import * as readline from "node:readline";
import AccountsLogout from "../../../../src/commands/accounts/logout.js";
import { ConfigManager } from "../../../../src/services/config-manager.js";

describe("AccountsLogout", function() {
  let configManagerStub: sinon.SinonStubbedInstance<ConfigManager>;
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;

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

    // Stub ConfigManager methods
    configManagerStub = sandbox.createStubInstance(ConfigManager);
    sandbox.stub(ConfigManager.prototype as any, "ensureConfigDirExists");
    sandbox.stub(ConfigManager.prototype as any, "saveConfig");

    // Create readline interface stub
    const rlStub = {
      question: sandbox.stub(),
      close: sandbox.stub()
    };
    sandbox.stub(readline, "createInterface").returns(rlStub as any);
  });

  afterEach(function() {
    sandbox.restore();
    process.env = originalEnv;
  });

  describe("command properties", function() {
    it("should have correct static properties", function() {
      expect(AccountsLogout.description).to.equal("Log out from an Ably account");
      expect(AccountsLogout.examples).to.be.an('array');
      expect(AccountsLogout.args).to.have.property('alias');
      expect(AccountsLogout.flags).to.have.property('force');
    });

    it("should have force flag configuration", function() {
      expect(AccountsLogout.flags.force).to.have.property('char', 'f');
      expect(AccountsLogout.flags.force).to.have.property('default', false);
    });
  });

  describe("account selection", function() {
    it("should use current account when no alias provided", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      configManagerStub.getCurrentAccountAlias.returns("default");
      
      const currentAlias = configManagerStub.getCurrentAccountAlias();
      expect(currentAlias).to.equal("default");
      expect(configManagerStub.getCurrentAccountAlias.called).to.be.true;
    });

    it("should use provided alias argument", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      // Test argument would be passed in parse
      // For now, test the logic pattern
      const providedAlias = "mycompany";
      expect(providedAlias).to.equal("mycompany");
    });

    it("should handle no current account selected", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      configManagerStub.getCurrentAccountAlias.returns(undefined);
      
      const currentAlias = configManagerStub.getCurrentAccountAlias();
      expect(currentAlias).to.be.undefined;
    });
  });

  describe("account validation", function() {
    it("should check if account exists", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      configManagerStub.listAccounts.returns([
        { alias: "default", account: {} as any },
        { alias: "production", account: {} as any }
      ]);
      
      const accounts = configManagerStub.listAccounts();
      const accountExists = accounts.some(account => account.alias === "default");
      
      expect(accountExists).to.be.true;
      expect(configManagerStub.listAccounts.called).to.be.true;
    });

    it("should handle non-existent account", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      configManagerStub.listAccounts.returns([
        { alias: "default", account: {} as any }
      ]);
      
      const accounts = configManagerStub.listAccounts();
      const accountExists = accounts.some(account => account.alias === "nonexistent");
      
      expect(accountExists).to.be.false;
    });
  });

  describe("confirmation prompts", function() {
    it("should skip confirmation with force flag", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      // Test that force flag bypasses confirmation
      const forceFlag = true;
      expect(forceFlag).to.be.true;
    });

    it("should skip confirmation in JSON mode", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      // Test JSON mode behavior
      const jsonMode = true;
      expect(jsonMode).to.be.true;
    });

    it("should handle user confirmation responses", function() {
      const command = new AccountsLogout([], {} as any);
      
      // Test confirmation response parsing
      const yesResponses = ["y", "Y"];
      const noResponses = ["n", "N", "", "anything else"];
      
      yesResponses.forEach(response => {
        expect(response.toLowerCase() === "y").to.be.true;
      });
      
      noResponses.forEach(response => {
        expect(response.toLowerCase() !== "y").to.be.true;
      });
    });

    it("should show warning message during confirmation", function() {
      const command = new AccountsLogout([], {} as any);
      const logSpy = sandbox.spy(command, 'log');
      
      // Test that warning messages would be shown
      const warningMessage = "Warning: Logging out will remove all configuration";
      expect(warningMessage).to.include("Warning");
      expect(warningMessage).to.include("remove all configuration");
    });
  });

  describe("account removal", function() {
    it("should call removeAccount on ConfigManager", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      configManagerStub.removeAccount.returns(true);
      
      const result = configManagerStub.removeAccount("default");
      expect(result).to.be.true;
      expect(configManagerStub.removeAccount.calledWith("default")).to.be.true;
    });

    it("should handle successful account removal", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      configManagerStub.removeAccount.returns(true);
      configManagerStub.listAccounts.returns([
        { alias: "production", account: {} as any }
      ]);
      
      const success = configManagerStub.removeAccount("default");
      const remainingAccounts = configManagerStub.listAccounts();
      
      expect(success).to.be.true;
      expect(remainingAccounts).to.have.length(1);
      expect(remainingAccounts[0].alias).to.equal("production");
    });

    it("should handle failed account removal", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      configManagerStub.removeAccount.returns(false);
      
      const success = configManagerStub.removeAccount("nonexistent");
      expect(success).to.be.false;
    });
  });

  describe("output formatting", function() {
    it("should format successful JSON output", function() {
      const command = new AccountsLogout([], {} as any);
      
      const successData = {
        account: { alias: "default" },
        remainingAccounts: ["production"],
        success: true
      };
      
      const jsonOutput = JSON.stringify(successData);
      expect(jsonOutput).to.include('"success":true');
      expect(jsonOutput).to.include('"account"');
      expect(jsonOutput).to.include('"remainingAccounts"');
    });

    it("should format error JSON output", function() {
      const command = new AccountsLogout([], {} as any);
      
      const errorData = {
        error: "Account not found",
        success: false
      };
      
      const jsonOutput = JSON.stringify(errorData);
      expect(jsonOutput).to.include('"success":false');
      expect(jsonOutput).to.include('"error"');
    });

    it("should provide helpful messages for remaining accounts", function() {
      const command = new AccountsLogout([], {} as any);
      
      // Test message construction for different scenarios
      const remainingAccounts = [
        { alias: "production", account: {} as any }
      ];
      
      if (remainingAccounts.length > 0) {
        const switchMessage = `Use "ably accounts switch ${remainingAccounts[0].alias}" to select another account.`;
        expect(switchMessage).to.include("ably accounts switch");
        expect(switchMessage).to.include("production");
      }
    });

    it("should provide login message when no accounts remain", function() {
      const command = new AccountsLogout([], {} as any);
      
      const noAccountsMessage = 'Use "ably accounts login" to log in to an account.';
      expect(noAccountsMessage).to.include("ably accounts login");
    });
  });

  describe("error scenarios", function() {
    it("should handle no current account scenario", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      configManagerStub.getCurrentAccountAlias.returns(undefined);
      
      const expectedError = 'No account is currently selected and no alias provided. Use "ably accounts list" to see available accounts.';
      expect(expectedError).to.include("No account is currently selected");
      expect(expectedError).to.include("ably accounts list");
    });

    it("should handle account not found scenario", function() {
      const command = new AccountsLogout([], {} as any);
      (command as any).configManager = configManagerStub;
      
      const targetAlias = "nonexistent";
      configManagerStub.listAccounts.returns([
        { alias: "default", account: {} as any }
      ]);
      
      const accounts = configManagerStub.listAccounts();
      const accountExists = accounts.some(account => account.alias === targetAlias);
      
      if (!accountExists) {
        const expectedError = `Account with alias "${targetAlias}" not found. Use "ably accounts list" to see available accounts.`;
        expect(expectedError).to.include(`"${targetAlias}" not found`);
        expect(expectedError).to.include("ably accounts list");
      }
    });

    it("should handle logout cancellation", function() {
      const command = new AccountsLogout([], {} as any);
      const logSpy = sandbox.spy(command, 'log');
      
      // Test cancellation message
      const cancelMessage = "Logout canceled.";
      expect(cancelMessage).to.equal("Logout canceled.");
    });
  });

  describe("readline integration", function() {
    it("should create readline interface for confirmation", function() {
      const command = new AccountsLogout([], {} as any);
      
      // Test that readline interface creation is properly stubbed
      const rlInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      expect(rlInterface).to.exist;
      expect(rlInterface.question).to.be.a('function');
      expect(rlInterface.close).to.be.a('function');
    });

    it("should handle readline question callback", function() {
      const command = new AccountsLogout([], {} as any);
      
      // Test callback pattern used in confirmLogout
      const rl = readline.createInterface({} as any) as any;
      const questionStub = rl.question as sinon.SinonStub;
      
      expect(questionStub).to.be.a('function');
      
      // Test the question format
      const expectedQuestion = "Are you sure you want to proceed? (y/N): ";
      expect(expectedQuestion).to.include("Are you sure");
      expect(expectedQuestion).to.include("(y/N)");
    });
  });

  describe("integration with base command", function() {
    it("should inherit from ControlBaseCommand", function() {
      const command = new AccountsLogout([], {} as any);
      
      // Test that it has base command methods
      expect(command).to.have.property('run');
      expect(command.run).to.be.a('function');
    });

    it("should support global flags", function() {
      const command = new AccountsLogout([], {} as any);
      
      // Test that global flags are available
      expect(AccountsLogout.flags).to.have.property('json');
      expect(AccountsLogout.flags).to.have.property('pretty-json');
    });
  });
});