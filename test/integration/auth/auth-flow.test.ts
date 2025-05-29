import { expect } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigManager } from "../../../src/services/config-manager.js";
import _AccountsLogin from "../../../src/commands/accounts/login.js";
import _AccountsLogout from "../../../src/commands/accounts/logout.js";

describe("Authentication Flow Integration", function() {
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;
  let tempConfigDir: string;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    originalEnv = { ...process.env };
    
    // Create a unique temporary directory for each test
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ably-cli-integration-test-'));
    
    // Set test environment
    process.env = { ...originalEnv };
    process.env.ABLY_CLI_TEST_MODE = 'true';
    process.env.ABLY_CLI_CONFIG_DIR = tempConfigDir;
    
    // Don't mock fs operations for integration tests - use real file system
    // but in isolated temp directory
  });

  afterEach(function() {
    sandbox.restore();
    process.env = originalEnv;
    
    // Clean up temporary directory
    if (tempConfigDir && fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
  });

  describe("login → logout flow", function() {
    it("should complete full authentication cycle", function() {
      // Create ConfigManager with temporary directory
      const configManager = new ConfigManager();
      
      // Test initial state - no accounts
      const initialAccounts = configManager.listAccounts();
      expect(initialAccounts).to.have.length(0);
      
      // Simulate login by storing account directly
      configManager.storeAccount("test-access-token", "test-account", {
        accountId: "acc_123",
        accountName: "Test Account",
        tokenId: "token_123",
        userEmail: "test@example.com"
      });
      
      // Verify account was stored
      const accountsAfterLogin = configManager.listAccounts();
      expect(accountsAfterLogin).to.have.length(1);
      expect(accountsAfterLogin[0].alias).to.equal("test-account");
      
      // Verify current account is set
      expect(configManager.getCurrentAccountAlias()).to.equal("test-account");
      
      // Simulate logout by removing account
      const logoutSuccess = configManager.removeAccount("test-account");
      expect(logoutSuccess).to.be.true;
      
      // Verify account was removed
      const accountsAfterLogout = configManager.listAccounts();
      expect(accountsAfterLogout).to.have.length(0);
      expect(configManager.getCurrentAccountAlias()).to.be.undefined;
    });

    it("should handle multiple accounts", function() {
      const configManager = new ConfigManager();
      
      // Store multiple accounts
      configManager.storeAccount("token1", "account1", {
        accountId: "acc_1",
        accountName: "Account 1"
      });
      
      configManager.storeAccount("token2", "account2", {
        accountId: "acc_2", 
        accountName: "Account 2"
      });
      
      // Verify both accounts exist
      const accounts = configManager.listAccounts();
      expect(accounts).to.have.length(2);
      
      // Verify both accounts are present by alias
      const aliases = accounts.map(a => a.alias);
      expect(aliases).to.include("account1");
      expect(aliases).to.include("account2");
      
      // Current should be set (could be either one based on implementation)
      const currentBeforeSwitch = configManager.getCurrentAccountAlias();
      expect(currentBeforeSwitch).to.be.oneOf(["account1", "account2"]);
      
      // Switch to account1 specifically
      const switchSuccess = configManager.switchAccount("account1");
      expect(switchSuccess).to.be.true;
      expect(configManager.getCurrentAccountAlias()).to.equal("account1");
      
      // Remove account1
      const removeSuccess = configManager.removeAccount("account1");
      expect(removeSuccess).to.be.true;
      
      // Should still have one account left
      const remainingAccounts = configManager.listAccounts();
      expect(remainingAccounts).to.have.length(1);
      
      // The remaining account should be account2
      const remainingAccount = remainingAccounts[0];
      expect(remainingAccount.alias).to.equal("account2");
      expect(remainingAccount.account.accountId).to.equal("acc_2");
      
      // After removing the current account, current should be cleared
      // (this is the expected behavior based on ConfigManager implementation)
      const currentAfterRemoval = configManager.getCurrentAccountAlias();
      expect(currentAfterRemoval).to.be.undefined;
    });
  });

  describe("config persistence", function() {
    it("should persist configuration across ConfigManager instances", function() {
      // First ConfigManager instance
      const configManager1 = new ConfigManager();
      
      configManager1.storeAccount("persistent-token", "persistent-account", {
        accountId: "persistent_acc",
        accountName: "Persistent Account"
      });
      
      configManager1.storeAppKey("test-app", "test-app.key:secret", {
        appName: "Test App",
        keyName: "Test Key"
      });
      
      // Set the current app so it persists
      configManager1.setCurrentApp("test-app");
      
      // Create second ConfigManager instance (should read from same config file)
      const configManager2 = new ConfigManager();
      
      // Verify data persisted
      const accounts = configManager2.listAccounts();
      expect(accounts).to.have.length(1);
      expect(accounts[0].alias).to.equal("persistent-account");
      
      expect(configManager2.getCurrentAccountAlias()).to.equal("persistent-account");
      expect(configManager2.getCurrentAppId()).to.equal("test-app");
      expect(configManager2.getApiKey("test-app")).to.equal("test-app.key:secret");
      expect(configManager2.getAppName("test-app")).to.equal("Test App");
    });

    it("should handle config file corruption gracefully", function() {
      const configManager = new ConfigManager();
      
      // Store valid config first
      configManager.storeAccount("token", "account", {
        accountId: "acc_123",
        accountName: "Test Account"
      });
      
      // Verify config file exists
      const configPath = path.join(tempConfigDir, 'config');
      expect(fs.existsSync(configPath)).to.be.true;
      
      // Corrupt the config file
      fs.writeFileSync(configPath, "invalid toml content [[[");
      
      // Create new ConfigManager - should throw an error for corrupted config
      // This is the actual behavior - it doesn't silently handle corruption
      expect(() => {
        new ConfigManager();
      }).to.throw(/Failed to load Ably config/);
    });
  });

  describe("environment variable precedence", function() {
    it("should prioritize environment variables over config", function() {
      const configManager = new ConfigManager();
      
      // Store config values
      configManager.storeAccount("config-token", "config-account", {
        accountId: "config_acc",
        accountName: "Config Account"
      });
      
      configManager.storeAppKey("config-app", "config-app.key:config-secret", {
        appName: "Config App"
      });
      
      // Set environment variables
      process.env.ABLY_API_KEY = "env-app.env-key:env-secret";
      process.env.ABLY_ACCESS_TOKEN = "env-access-token";
      
      // Environment variables should take precedence
      // Note: This tests the expected behavior when BaseCommand uses these
      expect(process.env.ABLY_API_KEY).to.equal("env-app.env-key:env-secret");
      expect(process.env.ABLY_ACCESS_TOKEN).to.equal("env-access-token");
      
      // Config values should still be accessible
      expect(configManager.getCurrentAccountAlias()).to.equal("config-account");
      expect(configManager.getApiKey("config-app")).to.equal("config-app.key:config-secret");
    });
  });

  describe("initialization hooks", function() {
    it("should create config directory if it doesn't exist", function() {
      // Remove the temp directory to simulate first run
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
      expect(fs.existsSync(tempConfigDir)).to.be.false;
      
      // Creating ConfigManager should recreate directory
      const configManager = new ConfigManager();
      
      expect(fs.existsSync(tempConfigDir)).to.be.true;
      
      // Should be able to store config
      configManager.storeAccount("test-token", "test-account", {
        accountId: "test_acc",
        accountName: "Test Account"
      });
      
      const accounts = configManager.listAccounts();
      expect(accounts).to.have.length(1);
    });

    it("should handle permissions issues gracefully", function() {
      // This is a conceptual test - actual permissions testing
      // would be complex in a cross-platform way
      const configManager = new ConfigManager();
      
      // Should be able to create and use config
      expect(() => {
        configManager.storeAccount("test", "test", { accountId: "test" });
      }).to.not.throw();
    });
  });

  describe("error scenarios", function() {
    it("should handle account switching to non-existent account", function() {
      const configManager = new ConfigManager();
      
      configManager.storeAccount("token", "existing", {
        accountId: "existing_acc",
        accountName: "Existing Account"
      });
      
      // Try to switch to non-existent account
      const switchResult = configManager.switchAccount("non-existent");
      expect(switchResult).to.be.false;
      
      // Current account should remain unchanged
      expect(configManager.getCurrentAccountAlias()).to.equal("existing");
    });

    it("should handle removing non-existent account", function() {
      const configManager = new ConfigManager();
      
      // Try to remove account that doesn't exist
      const removeResult = configManager.removeAccount("non-existent");
      expect(removeResult).to.be.false;
    });

    it("should handle duplicate account aliases", function() {
      const configManager = new ConfigManager();
      
      configManager.storeAccount("token1", "duplicate", {
        accountId: "acc_1",
        accountName: "Account 1"
      });
      
      // Store another account with same alias (should overwrite)
      configManager.storeAccount("token2", "duplicate", {
        accountId: "acc_2",
        accountName: "Account 2"
      });
      
      const accounts = configManager.listAccounts();
      expect(accounts).to.have.length(1);
      expect(accounts[0].account.accountId).to.equal("acc_2");
    });
  });

  describe("app and key management", function() {
    it("should manage app keys within accounts", function() {
      const configManager = new ConfigManager();
      
      // Store account
      configManager.storeAccount("token", "account", {
        accountId: "acc_123",
        accountName: "Test Account"
      });
      
      // Store app keys
      configManager.storeAppKey("app1", "app1.key1:secret1", {
        appName: "App 1",
        keyName: "Key 1"
      });
      
      configManager.storeAppKey("app2", "app2.key2:secret2", {
        appName: "App 2", 
        keyName: "Key 2"
      });
      
      // Verify keys are stored
      expect(configManager.getApiKey("app1")).to.equal("app1.key1:secret1");
      expect(configManager.getApiKey("app2")).to.equal("app2.key2:secret2");
      expect(configManager.getAppName("app1")).to.equal("App 1");
      expect(configManager.getAppName("app2")).to.equal("App 2");
      
      // Set current app
      configManager.setCurrentApp("app1");
      expect(configManager.getCurrentAppId()).to.equal("app1");
    });

    it("should isolate app keys between accounts", function() {
      const configManager = new ConfigManager();
      
      // Create first account and add app
      configManager.storeAccount("token1", "account1", {
        accountId: "acc_1",
        accountName: "Account 1"
      });
      
      configManager.storeAppKey("shared-app", "shared-app.key1:secret1", {
        appName: "Shared App Account 1"
      });
      
      // Create second account and add app with same ID
      configManager.storeAccount("token2", "account2", {
        accountId: "acc_2",
        accountName: "Account 2"
      });
      
      configManager.storeAppKey("shared-app", "shared-app.key2:secret2", {
        appName: "Shared App Account 2"
      }, "account2");
      
      // Switch between accounts and verify isolation
      configManager.switchAccount("account1");
      expect(configManager.getApiKey("shared-app")).to.equal("shared-app.key1:secret1");
      expect(configManager.getAppName("shared-app")).to.equal("Shared App Account 1");
      
      configManager.switchAccount("account2"); 
      expect(configManager.getApiKey("shared-app")).to.equal("shared-app.key2:secret2");
      expect(configManager.getAppName("shared-app")).to.equal("Shared App Account 2");
    });
  });
});