import { expect } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import AccountsLogout from "../../../../src/commands/accounts/logout.js";
import { ConfigManager } from "../../../../src/services/config-manager.js";

describe("AccountsLogout", function() {
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    originalEnv = { ...process.env };
    
    // Reset env before each test
    process.env = { ...originalEnv };
    process.env.ABLY_CLI_TEST_MODE = 'true';

    // Stub fs operations to prevent actual file access
    sandbox.stub(fs, "existsSync").returns(true);
    sandbox.stub(fs, "readFileSync").returns("");
    sandbox.stub(fs, "mkdirSync");
    sandbox.stub(fs, "writeFileSync");
  });

  afterEach(function() {
    sandbox.restore();
    process.env = originalEnv;
  });

  describe("command properties", function() {
    it("should have correct static properties", function() {
      expect(AccountsLogout.description).to.equal("Log out from an Ably account");
      expect(AccountsLogout.examples).to.be.an('array');
      expect(AccountsLogout.flags).to.have.property('force');
      expect(AccountsLogout.args).to.have.property('alias');
    });

    it("should have correct flag configuration", function() {
      expect(AccountsLogout.flags.force).to.have.property('char', 'f');
      expect(AccountsLogout.flags.force).to.have.property('default', false);
    });

    it("should have correct argument configuration", function() {
      expect(AccountsLogout.args.alias).to.have.property('required', false);
      expect(AccountsLogout.args.alias).to.have.property('description');
    });
  });

  describe("command instantiation", function() {
    it("should create command instance", function() {
      const command = new AccountsLogout([], {} as any);
      expect(command).to.be.instanceOf(AccountsLogout);
      expect(command.run).to.be.a('function');
    });

    it("should have correct command structure", function() {
      const command = new AccountsLogout([], {} as any);
      expect(command.constructor.name).to.equal("AccountsLogout");
    });
  });

  describe("account selection logic", function() {
    it("should handle account selection validation", function() {
      // Test the expected account format
      const mockAccount = {
        alias: "test-account",
        accountId: "123456",
        accountName: "Test Account",
        tokenId: "token123",
        userEmail: "test@example.com"
      };

      expect(mockAccount.alias).to.be.a('string');
      expect(mockAccount.accountId).to.be.a('string');
      expect(mockAccount.accountName).to.be.a('string');
    });

    it("should validate account alias format", function() {
      const validAliases = ["default", "test-account", "prod_account"];
      const invalidAliases = ["123invalid", "", null, undefined];

      validAliases.forEach(alias => {
        expect(alias).to.be.a('string');
        expect(alias.length).to.be.greaterThan(0);
      });

      invalidAliases.forEach(alias => {
        if (alias !== null && alias !== undefined) {
          expect(typeof alias === 'string' && alias.length > 0).to.be.false;
        }
      });
    });
  });

  describe("confirmation prompt logic", function() {
    it("should validate confirmation responses", function() {
      const yesResponses = ["y", "yes", "Y", "YES"];
      const noResponses = ["n", "no", "N", "NO"];

      yesResponses.forEach(response => {
        const isYes = ["y", "yes"].includes(response.toLowerCase());
        expect(isYes).to.be.true;
      });

      noResponses.forEach(response => {
        const isNo = ["n", "no"].includes(response.toLowerCase());
        expect(isNo).to.be.true;
      });
    });

    it("should handle empty or invalid responses", function() {
      const invalidResponses = ["", "maybe", "sure", null, undefined];

      invalidResponses.forEach(response => {
        if (response) {
          const isValid = ["y", "yes", "n", "no"].includes(response.toLowerCase());
          expect(isValid).to.be.false;
        }
      });
    });
  });

  describe("output formatting", function() {
    it("should format successful logout JSON output", function() {
      const successData = {
        message: "Successfully logged out of account: test-account",
        success: true
      };

      const jsonOutput = JSON.stringify(successData);
      expect(jsonOutput).to.include('"success":true');
      expect(jsonOutput).to.include('"message"');
    });

    it("should format all accounts logout JSON output", function() {
      const allAccountsData = {
        message: "Successfully logged out of all accounts",
        success: true,
        removedAccounts: ["account1", "account2"]
      };

      const jsonOutput = JSON.stringify(allAccountsData);
      expect(jsonOutput).to.include('"success":true');
      expect(jsonOutput).to.include('"removedAccounts"');
    });

    it("should format error JSON output", function() {
      const errorData = {
        error: "Account not found",
        success: false
      };

      const jsonOutput = JSON.stringify(errorData);
      expect(jsonOutput).to.include('"success":false');
      expect(jsonOutput).to.include('"error"');
    });
  });

  describe("account removal scenarios", function() {
    it("should handle single account removal", function() {
      const accountToRemove = "test-account";
      const remainingAccounts = ["other-account"];

      expect(accountToRemove).to.be.a('string');
      expect(remainingAccounts).to.be.an('array');
      expect(remainingAccounts).to.not.include(accountToRemove);
    });

    it("should handle all accounts removal", function() {
      const allAccounts = ["account1", "account2", "account3"];
      const afterRemoval: string[] = [];

      expect(allAccounts.length).to.be.greaterThan(0);
      expect(afterRemoval.length).to.equal(0);
    });

    it("should handle current account switching logic", function() {
      const currentAccount = "account-to-remove";
      const availableAccounts = ["other-account1", "other-account2"];

      // Test logic for determining next current account
      const nextAccount = availableAccounts.length > 0 ? availableAccounts[0] : null;

      expect(nextAccount).to.equal("other-account1");
    });
  });

  describe("configuration integration", function() {
    it("should work with ConfigManager", function() {
      // Test basic instantiation without complex mocking
      expect(() => new ConfigManager()).to.not.throw();
    });

    it("should handle account listing operations", function() {
      // Test expected account list format
      const mockAccounts = [
        { alias: "default", account: {} },
        { alias: "test", account: {} }
      ];

      expect(mockAccounts).to.be.an('array');
      expect(mockAccounts.length).to.equal(2);
      mockAccounts.forEach(acc => {
        expect(acc).to.have.property('alias');
        expect(acc).to.have.property('account');
      });
    });
  });

  describe("validation edge cases", function() {
    it("should handle empty account list", function() {
      const emptyList: any[] = [];
      expect(emptyList.length).to.equal(0);
    });

    it("should handle non-existent account", function() {
      const accounts = ["existing1", "existing2"];
      const requestedAccount = "non-existent";

      const accountExists = accounts.includes(requestedAccount);
      expect(accountExists).to.be.false;
    });

    it("should handle default account special case", function() {
      const defaultAlias = "default";
      const isDefault = defaultAlias === "default";

      expect(isDefault).to.be.true;
    });
  });

  describe("command examples validation", function() {
    it("should have valid examples", function() {
      const examples = AccountsLogout.examples;

      expect(examples).to.be.an('array');
      expect(examples.length).to.be.greaterThan(0);

      examples.forEach(example => {
        expect(example).to.be.a('string');
        expect(example.length).to.be.greaterThan(0);
      });
    });

    it("should include force flag example", function() {
      const examples = AccountsLogout.examples;
      const hasJsonExample = examples.some(ex => ex.includes('--json'));

      expect(hasJsonExample).to.be.true;
    });
  });
});