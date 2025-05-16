/**
 * ConfigManager unit tests
 *
 * Explicitly sets NODE_TEST_CONTEXT to isolate this test file
 * from other tests that might be using Ably connections.
 */

// Set test isolation marker to prevent Ably connection conflicts
process.env.NODE_TEST_CONTEXT = 'config-manager-only';

import { expect } from "chai";
import * as chai from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";
import sinonChai from "sinon-chai";
import { ConfigManager } from "../../../src/services/config-manager.js";

chai.use(sinonChai);

// Simple mock config content
const DEFAULT_CONFIG = `
[current]
account = "default"

[accounts.default]
accessToken = "testaccesstoken"
accountId = "testaccountid"
accountName = "Test Account"
currentAppId = "testappid"

[accounts.default.apps.testappid]
apiKey = "testappid.keyid:keysecret"
appName = "Test App"
keyId = "testappid.keyid"
keyName = "Test Key"
`;

// Completely isolated test suite
describe("ConfigManager", function() {
  // Variables declared at top level for test scope
  let configManager: ConfigManager;
  let envBackup: Record<string, string | undefined>;
  let sandbox: sinon.SinonSandbox;

  // Backup original env vars that might interfere with tests
  let originalConfigDirEnvVar: string | undefined;

  // Store a unique temporary directory for test config for this file
  let uniqueTestConfigDir: string;

  // Setup unique temp directory for this test file
  before(function() {
    // Create a unique temporary directory for this test suite
    uniqueTestConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ably-cli-config-test-'));
  });

  // Setup test environment for each test
  beforeEach(function() {
    // Backup potentially interfering env vars
    envBackup = {
      ABLY_CLI_TEST_MODE: process.env.ABLY_CLI_TEST_MODE,
      ABLY_API_KEY: process.env.ABLY_API_KEY,
      ABLY_ACCESS_TOKEN: process.env.ABLY_ACCESS_TOKEN
    };
    originalConfigDirEnvVar = process.env.ABLY_CLI_CONFIG_DIR;

    // Override config dir to use the unique temp dir
    process.env.ABLY_CLI_CONFIG_DIR = uniqueTestConfigDir;
    process.env.ABLY_CLI_TEST_MODE = 'true';
    delete process.env.ABLY_API_KEY;
    delete process.env.ABLY_ACCESS_TOKEN;

    // Create a sandbox for stubs
    sandbox = sinon.createSandbox();

    // Stub filesystem operations within the sandbox
    sandbox.stub(fs, "existsSync").returns(true);
    sandbox.stub(fs, "mkdirSync"); // Allow mkdirSync to be called
    sandbox.stub(fs, "readFileSync").returns(DEFAULT_CONFIG);
    sandbox.stub(fs, "writeFileSync");

    // Create new ConfigManager instance for each test
    // It will now use the uniqueTestConfigDir via the env var
    configManager = new ConfigManager();
  });

  // Clean up after each test
  afterEach(function() {
    // Restore all sinon stubs
    sandbox.restore();

    // Restore environment variables
    if (envBackup.ABLY_CLI_TEST_MODE) {
      process.env.ABLY_CLI_TEST_MODE = envBackup.ABLY_CLI_TEST_MODE;
    } else {
      delete process.env.ABLY_CLI_TEST_MODE;
    }
    if (envBackup.ABLY_API_KEY) {
      process.env.ABLY_API_KEY = envBackup.ABLY_API_KEY;
    } else {
      delete process.env.ABLY_API_KEY;
    }
    if (envBackup.ABLY_ACCESS_TOKEN) {
      process.env.ABLY_ACCESS_TOKEN = envBackup.ABLY_ACCESS_TOKEN;
    } else {
      delete process.env.ABLY_ACCESS_TOKEN;
    }
    // Restore the original config dir env var
    if (originalConfigDirEnvVar === undefined) {
      delete process.env.ABLY_CLI_CONFIG_DIR;
    } else {
      process.env.ABLY_CLI_CONFIG_DIR = originalConfigDirEnvVar;
    }
  });

  // Clean up the unique temporary directory after all tests in this file
  after(function() {
    if (uniqueTestConfigDir) {
      fs.rmSync(uniqueTestConfigDir, { recursive: true, force: true });
    }
    // Restore any other env vars if needed (currently handled in afterEach)
  });

  // Tests for constructor
  describe("#constructor", function() {
    it("should attempt to create config directory if it doesn't exist", function() {
      // Need to reset the sandbox stubs for this specific test case
      sandbox.restore();
      sandbox = sinon.createSandbox();
      const mkdirStub = sandbox.stub(fs, "mkdirSync");
      const existsStub = sandbox.stub(fs, "existsSync");
      sandbox.stub(fs, "readFileSync").returns(""); // Simulate no existing config

      // Make config dir not exist initially
      existsStub.returns(false);

      // Create instance which should trigger directory creation attempt
      const _manager = new ConfigManager();

      // ConfigManager constructor now uses getConfigDirPath() which relies on ABLY_CLI_CONFIG_DIR
      // We expect mkdirSync to be called with the uniqueTestConfigDir
      expect(mkdirStub.calledOnceWith(uniqueTestConfigDir)).to.be.true;
    });

    it("should load existing config file", function() {
      // The beforeEach setup already stubs readFileSync
      // ConfigManager constructor calls loadConfig, which calls readFileSync
      const readFileStub = fs.readFileSync as sinon.SinonStub;
      expect(readFileStub?.calledOnce).to.be.true;
      // Verify it tries to read the correct file within the temp dir
      const expectedConfigPath = path.join(uniqueTestConfigDir, 'config');
      expect(readFileStub?.calledOnceWith(expectedConfigPath)).to.be.true;
    });
  });

  // Tests for getCurrentAccountAlias
  describe("#getCurrentAccountAlias", function() {
    it("should return the current account alias", function() {
      expect(configManager.getCurrentAccountAlias()).to.equal("default");
    });

    it("should return undefined if no current account", function() {
      // Reset stubs and load empty config
      sandbox.restore(); // Restore stubs from beforeEach
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns("[accounts]\n"); // Empty accounts section
      sandbox.stub(fs, "writeFileSync"); // Stub writeFileSync if needed

      const manager = new ConfigManager(); // Create new instance with empty config

      expect(manager.getCurrentAccountAlias()).to.be.undefined;
    });
  });

  // Tests for getCurrentAccount
  describe("#getCurrentAccount", function() {
    it("should return the current account", function() {
      const account = configManager.getCurrentAccount();

      expect(account).to.not.be.undefined;
      expect(account?.accessToken).to.equal("testaccesstoken");
      expect(account?.accountId).to.equal("testaccountid");
      expect(account?.accountName).to.equal("Test Account");
    });

    it("should return undefined if no current account alias", function() {
      // Reset stubs and load config without current section
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(`
[accounts.default]
accessToken = "testaccesstoken"
`); // No [current] section
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();

      expect(manager.getCurrentAccount()).to.be.undefined;
    });
  });

  // Tests for getCurrentAppId
  describe("#getCurrentAppId", function() {
    it("should return the current app ID", function() {
      expect(configManager.getCurrentAppId()).to.equal("testappid");
    });

    it("should return undefined if no current account", function() {
       // Reset stubs and load config without current section
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(`[accounts]`); // No [current] section or account details
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      expect(manager.getCurrentAppId()).to.be.undefined;
    });
  });

  // Tests for getApiKey
  describe("#getApiKey", function() {
    it("should return the API key for the current app", function() {
      expect(configManager.getApiKey()).to.equal("testappid.keyid:keysecret");
    });

    it("should return the API key for a specific app", function() {
      expect(configManager.getApiKey("testappid")).to.equal("testappid.keyid:keysecret");
    });

    it("should return undefined if app doesn't exist", function() {
      expect(configManager.getApiKey("nonexistentappid")).to.be.undefined;
    });
  });

  // Tests for getAppName
  describe("#getAppName", function() {
    it("should return the app name for a specific app", function() {
      expect(configManager.getAppName("testappid")).to.equal("Test App");
    });

    it("should return undefined if app doesn't exist", function() {
      expect(configManager.getAppName("nonexistentappid")).to.be.undefined;
    });
  });

  // Tests for storeAccount
  describe("#storeAccount", function() {
    it("should store a new account", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      configManager.storeAccount("newaccesstoken", "newaccount", {
        accountId: "newaccountid",
        accountName: "New Account"
      });

      expect(writeFileStub?.calledOnce).to.be.true;

      // Test that the internal state is updated
      const accounts = configManager.listAccounts();
      expect(accounts.some(a => a.alias === "newaccount")).to.be.true;

      const account = accounts.find(a => a.alias === "newaccount")?.account;
      expect(account?.accessToken).to.equal("newaccesstoken");
      expect(account?.accountId).to.equal("newaccountid");
      expect(account?.accountName).to.equal("New Account");
    });

    it("should set as current if it's the first account", function() {
      // Reset stubs and load empty config
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(""); // Empty config
      const writeFileStub = sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      manager.storeAccount("firstaccesstoken", "firstaccount");

      expect(writeFileStub.calledOnce).to.be.true;
      expect(manager.getCurrentAccountAlias()).to.equal("firstaccount");
    });
  });

  // Tests for storeAppKey
  describe("#storeAppKey", function() {
    it("should store an API key for an app", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      configManager.storeAppKey("newappid", "newappid.keyid:keysecret", {
        appName: "New App",
        keyName: "New Key"
      });

      expect(writeFileStub?.calledOnce).to.be.true;

      // Check that the key was stored
      expect(configManager.getApiKey("newappid")).to.equal("newappid.keyid:keysecret");
      expect(configManager.getAppName("newappid")).to.equal("New App");
      expect(configManager.getKeyName("newappid")).to.equal("New Key");
    });

    it("should store an API key for an app with a specific account", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      // First create a new account
      configManager.storeAccount("anotheraccesstoken", "anotheraccount");

      configManager.storeAppKey("anotherappid", "anotherappid.keyid:keysecret", {
        appName: "Another App",
        keyName: "Another Key"
      }, "anotheraccount");

      // Switch to the other account
      configManager.switchAccount("anotheraccount");

      // Check that the key was stored properly
      expect(configManager.getApiKey("anotherappid")).to.equal("anotherappid.keyid:keysecret");
      expect(configManager.getAppName("anotherappid")).to.equal("Another App");
      expect(configManager.getKeyName("anotherappid")).to.equal("Another Key");

      // Expect writeFileSync to have been called multiple times (storeAccount, storeAppKey, switchAccount)
      expect(writeFileStub?.callCount).to.be.greaterThan(2);
    });

    it("should throw error if account doesn't exist", function() {
      expect(() => {
        configManager.storeAppKey("appid", "apikey", {}, "nonexistentaccount");
      }).to.throw();
    });
  });

  // Tests for removeAccount
  describe("#removeAccount", function() {
    it("should remove an account and return true", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      expect(configManager.removeAccount("default")).to.be.true;
      expect(writeFileStub?.calledOnce).to.be.true;

      // The account should be gone from the list
      expect(configManager.listAccounts().some(a => a.alias === "default")).to.be.false;
    });

    it("should return false if account doesn't exist", function() {
      expect(configManager.removeAccount("nonexistentaccount")).to.be.false;
    });

    it("should clear current account if removing current account", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      // First confirm default is the current account
      expect(configManager.getCurrentAccountAlias()).to.equal("default");

      // Remove it
      configManager.removeAccount("default");

      // Current account should now be undefined
      expect(configManager.getCurrentAccountAlias()).to.be.undefined;
      expect(writeFileStub?.calledOnce).to.be.true;
    });
  });

  // Tests for switchAccount
  describe("#switchAccount", function() {
    it("should switch to another account and return true", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      // First create another account
      configManager.storeAccount("anotheraccesstoken", "anotheraccount");

      expect(configManager.switchAccount("anotheraccount")).to.be.true;
      // writeFileSync called for storeAccount and switchAccount
      expect(writeFileStub?.callCount).to.equal(2);

      // Current account should be the new one
      expect(configManager.getCurrentAccountAlias()).to.equal("anotheraccount");
    });

    it("should return false if account doesn't exist", function() {
      expect(configManager.switchAccount("nonexistentaccount")).to.be.false;
    });
  });
});
