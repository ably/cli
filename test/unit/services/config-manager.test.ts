import { expect } from "chai";
import fs from "node:fs";
import _path from "node:path";
import sinon from "sinon";
import { ConfigManager } from "../../../src/services/config-manager.js";

describe("ConfigManager", function() {
  let configManager: ConfigManager;
  let _fsMock: sinon.SinonMock;
  let fsExistsStub: sinon.SinonStub;
  let fsMkdirStub: sinon.SinonStub;
  let fsReadFileStub: sinon.SinonStub;
  let fsWriteFileStub: sinon.SinonStub;

  beforeEach(function() {
    // Create stubs for filesystem operations
    fsExistsStub = sinon.stub(fs, "existsSync");
    fsMkdirStub = sinon.stub(fs, "mkdirSync");
    fsReadFileStub = sinon.stub(fs, "readFileSync");
    fsWriteFileStub = sinon.stub(fs, "writeFileSync");

    // Mock existence of config directory
    fsExistsStub.returns(true);

    // Mock empty config file content
    fsReadFileStub.returns(`
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
`);

    // Create new instance for each test
    configManager = new ConfigManager();
  });

  afterEach(function() {
    sinon.restore();
  });

  describe("#constructor", function() {
    it("should create config directory if it doesn't exist", function() {
      // Reset stubs
      sinon.restore();
      fsExistsStub = sinon.stub(fs, "existsSync");
      fsMkdirStub = sinon.stub(fs, "mkdirSync");
      fsReadFileStub = sinon.stub(fs, "readFileSync");

      // Make config dir not exist
      fsExistsStub.returns(false);
      fsReadFileStub.returns("");

      // Create instance which should create dir
      const _manager = new ConfigManager();

      expect(fsMkdirStub.calledOnce).to.be.true;
    });

    it("should load existing config file", function() {
      expect(fsReadFileStub.calledOnce).to.be.true;
    });
  });

  describe("#getCurrentAccountAlias", function() {
    it("should return the current account alias", function() {
      expect(configManager.getCurrentAccountAlias()).to.equal("default");
    });

    it("should return undefined if no current account", function() {
      // Reset stubs and load empty config
      sinon.restore();
      fsExistsStub = sinon.stub(fs, "existsSync");
      fsReadFileStub = sinon.stub(fs, "readFileSync");

      fsExistsStub.returns(true);
      fsReadFileStub.returns(""); // Empty config

      const manager = new ConfigManager();

      expect(manager.getCurrentAccountAlias()).to.be.undefined;
    });
  });

  describe("#getCurrentAccount", function() {
    it("should return the current account", function() {
      const account = configManager.getCurrentAccount();

      expect(account).to.not.be.undefined;
      expect(account?.accessToken).to.equal("testaccesstoken");
      expect(account?.accountId).to.equal("testaccountid");
      expect(account?.accountName).to.equal("Test Account");
    });

    it("should return undefined if no current account alias", function() {
      // Reset stubs and load config without current account
      sinon.restore();
      fsExistsStub = sinon.stub(fs, "existsSync");
      fsReadFileStub = sinon.stub(fs, "readFileSync");

      fsExistsStub.returns(true);
      fsReadFileStub.returns(`
[accounts.default]
accessToken = "testaccesstoken"
`);

      const manager = new ConfigManager();

      expect(manager.getCurrentAccount()).to.be.undefined;
    });
  });

  describe("#getCurrentAppId", function() {
    it("should return the current app ID", function() {
      expect(configManager.getCurrentAppId()).to.equal("testappid");
    });

    it("should return undefined if no current account", function() {
      // Reset stubs and load config without current account
      sinon.restore();
      fsExistsStub = sinon.stub(fs, "existsSync");
      fsReadFileStub = sinon.stub(fs, "readFileSync");

      fsExistsStub.returns(true);
      fsReadFileStub.returns(""); // Empty config

      const manager = new ConfigManager();

      expect(manager.getCurrentAppId()).to.be.undefined;
    });
  });

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

  describe("#getAppName", function() {
    it("should return the app name for a specific app", function() {
      expect(configManager.getAppName("testappid")).to.equal("Test App");
    });

    it("should return undefined if app doesn't exist", function() {
      expect(configManager.getAppName("nonexistentappid")).to.be.undefined;
    });
  });

  describe("#storeAccount", function() {
    it("should store a new account", function() {
      configManager.storeAccount("newaccesstoken", "newaccount", {
        accountId: "newaccountid",
        accountName: "New Account"
      });

      expect(fsWriteFileStub.calledOnce).to.be.true;

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
      sinon.restore();
      fsExistsStub = sinon.stub(fs, "existsSync");
      fsReadFileStub = sinon.stub(fs, "readFileSync");
      fsWriteFileStub = sinon.stub(fs, "writeFileSync");

      fsExistsStub.returns(true);
      fsReadFileStub.returns(""); // Empty config

      const manager = new ConfigManager();

      manager.storeAccount("firstaccesstoken", "firstaccount");

      expect(fsWriteFileStub.calledOnce).to.be.true;
      expect(manager.getCurrentAccountAlias()).to.equal("firstaccount");
    });
  });

  describe("#storeAppKey", function() {
    it("should store an API key for an app", function() {
      configManager.storeAppKey("newappid", "newappid.keyid:keysecret", {
        appName: "New App",
        keyName: "New Key"
      });

      expect(fsWriteFileStub.calledOnce).to.be.true;

      // Check that the key was stored
      expect(configManager.getApiKey("newappid")).to.equal("newappid.keyid:keysecret");
      expect(configManager.getAppName("newappid")).to.equal("New App");
      expect(configManager.getKeyName("newappid")).to.equal("New Key");
    });

    it("should store an API key for an app with a specific account", function() {
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
    });

    it("should throw error if account doesn't exist", function() {
      expect(() => {
        configManager.storeAppKey("appid", "apikey", {}, "nonexistentaccount");
      }).to.throw();
    });
  });

  describe("#removeAccount", function() {
    it("should remove an account and return true", function() {
      expect(configManager.removeAccount("default")).to.be.true;
      expect(fsWriteFileStub.calledOnce).to.be.true;

      // The account should be gone from the list
      expect(configManager.listAccounts().some(a => a.alias === "default")).to.be.false;
    });

    it("should return false if account doesn't exist", function() {
      expect(configManager.removeAccount("nonexistentaccount")).to.be.false;
    });

    it("should clear current account if removing current account", function() {
      // First confirm default is the current account
      expect(configManager.getCurrentAccountAlias()).to.equal("default");

      // Remove it
      configManager.removeAccount("default");

      // Current account should now be undefined
      expect(configManager.getCurrentAccountAlias()).to.be.undefined;
    });
  });

  describe("#switchAccount", function() {
    it("should switch to another account and return true", function() {
      // First create another account
      configManager.storeAccount("anotheraccesstoken", "anotheraccount");

      expect(configManager.switchAccount("anotheraccount")).to.be.true;
      expect(fsWriteFileStub.callCount).to.be.greaterThan(0);

      // Current account should be the new one
      expect(configManager.getCurrentAccountAlias()).to.equal("anotheraccount");
    });

    it("should return false if account doesn't exist", function() {
      expect(configManager.switchAccount("nonexistentaccount")).to.be.false;
    });
  });
});
