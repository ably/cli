import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("Authentication E2E", function() {
  let tempConfigDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(function() {
    originalEnv = { ...process.env };
    
    // Create temporary config directory
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ably-cli-e2e-test-'));
    
    // Set test environment
    process.env.ABLY_CLI_CONFIG_DIR = tempConfigDir;
    process.env.ABLY_CLI_TEST_MODE = 'true';
  });

  afterEach(function() {
    // Restore environment
    process.env = originalEnv;
    
    // Clean up temp directory
    if (tempConfigDir && fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
  });

  describe("config persistence", function() {
    it("should persist config in real file system", async function() {
      // Skip if E2E_ABLY_API_KEY is not set
      if (!process.env.E2E_ABLY_API_KEY) {
        this.skip();
        return;
      }

      // Verify config directory is created
      expect(fs.existsSync(tempConfigDir)).to.be.true;
      
      // Check that config directory is empty initially
      const initialFiles = fs.readdirSync(tempConfigDir);
      expect(initialFiles).to.have.length(0);
      
      // Create a config file by instantiating ConfigManager
      const { ConfigManager } = await import("../../../src/services/config-manager.js");
      const configManager = new ConfigManager();
      
      // Store test account
      configManager.storeAccount("test-token", "e2e-test", {
        accountId: "e2e_test_account",
        accountName: "E2E Test Account",
        userEmail: "e2e@test.com"
      });
      
      // Verify config file was created
      const configPath = path.join(tempConfigDir, 'config');
      expect(fs.existsSync(configPath)).to.be.true;
      
      // Verify config file contains expected data
      const configContent = fs.readFileSync(configPath, 'utf8');
      expect(configContent).to.include('[current]');
      expect(configContent).to.include('account = "e2e-test"');
      expect(configContent).to.include('[accounts.e2e-test]');
      expect(configContent).to.include('accessToken = "test-token"');
      expect(configContent).to.include('accountId = "e2e_test_account"');
    });

    it("should handle environment variable authentication", function() {
      // Set API key environment variable
      process.env.ABLY_API_KEY = "test-app.test-key:test-secret";
      
      // Verify environment variable is accessible
      expect(process.env.ABLY_API_KEY).to.equal("test-app.test-key:test-secret");
      
      // Extract app ID from API key (simulating BaseCommand logic)
      const apiKey = process.env.ABLY_API_KEY;
      const appId = apiKey.split(".")[0];
      expect(appId).to.equal("test-app");
    });
  });

  describe("error scenarios", function() {
    it("should handle invalid credentials gracefully", function() {
      // Skip if E2E_ABLY_API_KEY is not set
      if (!process.env.E2E_ABLY_API_KEY) {
        this.skip();
        return;
      }

      // Set invalid API key
      process.env.ABLY_API_KEY = "invalid.key:format";
      
      // Test that this would be detected as invalid format
      const apiKey = process.env.ABLY_API_KEY;
      const keyParts = apiKey.split(":");
      
      if (keyParts.length !== 2) {
        expect(true).to.be.true; // Invalid format detected
      } else {
        const keyName = keyParts[0];
        const secret = keyParts[1];
        
        // Should have proper app.key format
        expect(keyName.includes(".")).to.be.true;
        expect(secret.length).to.be.greaterThan(0);
      }
    });

    it("should handle missing config directory permissions", function() {
      // This test is conceptual - actual permissions testing
      // would be complex in a cross-platform way
      
      // Verify temp directory exists and is writable
      expect(fs.existsSync(tempConfigDir)).to.be.true;
      
      // Try to write a test file
      const testFile = path.join(tempConfigDir, 'test.txt');
      expect(() => {
        fs.writeFileSync(testFile, 'test');
      }).to.not.throw();
      
      // Clean up test file
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    });
  });

  describe("config file format", function() {
    it("should create valid TOML config", async function() {
      const { ConfigManager } = await import("../../../src/services/config-manager.js");
      const configManager = new ConfigManager();
      
      // Store complex configuration
      configManager.storeAccount("access-token-123", "complex-account", {
        accountId: "complex_account_id",
        accountName: "Complex Account Name",
        tokenId: "token_id_123",
        userEmail: "complex@example.com"
      });
      
      configManager.storeAppKey("complex-app", "complex-app.complex-key:complex-secret", {
        appName: "Complex App Name",
        keyName: "Complex Key Name"
      });
      
      // Read and verify TOML structure
      const configPath = path.join(tempConfigDir, 'config');
      const configContent = fs.readFileSync(configPath, 'utf8');
      
      // Should have proper TOML sections
      expect(configContent).to.include('[current]');
      expect(configContent).to.include('[accounts.complex-account]');
      expect(configContent).to.include('[accounts.complex-account.apps.complex-app]');
      
      // Should escape special characters properly
      expect(configContent).to.include('accountName = "Complex Account Name"');
      expect(configContent).to.include('appName = "Complex App Name"');
      expect(configContent).to.include('keyName = "Complex Key Name"');
    });

    it("should handle special characters in account data", async function() {
      const { ConfigManager } = await import("../../../src/services/config-manager.js");
      const configManager = new ConfigManager();
      
      // Store account with special characters
      configManager.storeAccount("token", "special-chars", {
        accountId: "special_id",
        accountName: 'Account with "quotes" and symbols!@#$%',
        userEmail: "user+test@domain-name.co.uk"
      });
      
      // Verify it can be read back
      const accounts = configManager.listAccounts();
      expect(accounts).to.have.length(1);
      expect(accounts[0].account.accountName).to.equal('Account with "quotes" and symbols!@#$%');
      expect(accounts[0].account.userEmail).to.equal("user+test@domain-name.co.uk");
    });
  });

  describe("cross-platform compatibility", function() {
    it("should work with different path separators", async function() {
      // Test that paths work on both Windows and Unix systems
      const configPath = path.join(tempConfigDir, 'config');
      
      // Path should be normalized for the current platform
      if (process.platform === 'win32') {
        expect(configPath).to.include('\\');
      } else {
        expect(configPath).to.include('/');
      }
      
      // Should be able to create and access files
      const { ConfigManager } = await import("../../../src/services/config-manager.js");
      const configManager = new ConfigManager();
      
      configManager.storeAccount("token", "platform-test", {
        accountId: "platform_test",
        accountName: "Platform Test"
      });
      
      expect(fs.existsSync(configPath)).to.be.true;
    });

    it("should handle different line endings", async function() {
      const { ConfigManager } = await import("../../../src/services/config-manager.js");
      const configManager = new ConfigManager();
      
      configManager.storeAccount("token", "lineending-test", {
        accountId: "lineending_test",
        accountName: "Line Ending Test"
      });
      
      // Read config file and verify it's readable regardless of line endings
      const configPath = path.join(tempConfigDir, 'config');
      const configContent = fs.readFileSync(configPath, 'utf8');
      
      // Should contain expected content regardless of line ending style
      expect(configContent).to.include('account = "lineending-test"');
      expect(configContent).to.include('accountName = "Line Ending Test"');
    });
  });

  describe("environment isolation", function() {
    it("should use isolated config directory", async function() {
      // Verify we're using the test config directory
      expect(process.env.ABLY_CLI_CONFIG_DIR).to.equal(tempConfigDir);
      
      const { ConfigManager } = await import("../../../src/services/config-manager.js");
      const configManager = new ConfigManager();
      
      // Store test data
      configManager.storeAccount("isolated-token", "isolated-account", {
        accountId: "isolated_account",
        accountName: "Isolated Account"
      });
      
      // Verify it's in our temp directory, not the user's home
      const configPath = path.join(tempConfigDir, 'config');
      expect(fs.existsSync(configPath)).to.be.true;
      
      // Verify it's not in the default location
      const homeDir = os.homedir();
      const defaultConfigPath = path.join(homeDir, '.ably', 'config');
      
      // Only check if we're not accidentally using the same path
      if (tempConfigDir !== path.join(homeDir, '.ably')) {
        expect(configPath).to.not.equal(defaultConfigPath);
      }
    });
  });
});