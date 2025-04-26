import { expect } from "chai";
import inquirer from "inquirer";
import sinon from "sinon";
import { InteractiveHelper } from "../../../src/services/interactive-helper.js";
import { ConfigManager } from "../../../src/services/config-manager.js";
import { ControlApi, App, Key } from "../../../src/services/control-api.js";

describe("InteractiveHelper", function() {
  let interactiveHelper: InteractiveHelper;
  let configManagerStub: sinon.SinonStubbedInstance<ConfigManager>;
  let promptStub: sinon.SinonStub;
  let consoleLogSpy: sinon.SinonSpy;
  let sandbox: sinon.SinonSandbox;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    // Create stubs and spies using sandbox
    configManagerStub = sandbox.createStubInstance(ConfigManager);
    promptStub = sandbox.stub(inquirer, "prompt");
    consoleLogSpy = sandbox.spy(console, "log");

    // Create fresh instance for each test
    interactiveHelper = new InteractiveHelper(configManagerStub, { logErrors: false });
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe("#confirm", function() {
    it("should return true when user confirms", async function() {
      promptStub.resolves({ confirmed: true });

      const result = await interactiveHelper.confirm("Confirm this action?");

      expect(result).to.be.true;
      expect(promptStub.calledOnce).to.be.true;
      expect(promptStub.firstCall.args[0][0].message).to.equal("Confirm this action?");
    });

    it("should return false when user denies", async function() {
      promptStub.resolves({ confirmed: false });

      const result = await interactiveHelper.confirm("Confirm this action?");

      expect(result).to.be.false;
      expect(promptStub.calledOnce).to.be.true;
    });
  });

  describe("#selectAccount", function() {
    it("should return selected account", async function() {
      const accounts = [
        {
          alias: "default",
          account: {
            accessToken: "token1",
            accountName: "Account 1",
            userEmail: "user1@example.com"
          }
        },
        {
          alias: "secondary",
          account: {
            accessToken: "token2",
            accountName: "Account 2",
            userEmail: "user2@example.com"
          }
        }
      ];

      configManagerStub.listAccounts.returns(accounts);
      configManagerStub.getCurrentAccountAlias.returns("default");

      const selectedAccount = accounts[1];
      promptStub.resolves({ selectedAccount });

      const result = await interactiveHelper.selectAccount();

      expect(result).to.equal(selectedAccount);
      expect(promptStub.calledOnce).to.be.true;
      expect(configManagerStub.listAccounts.calledOnce).to.be.true;
      expect(configManagerStub.getCurrentAccountAlias.calledOnce).to.be.true;
    });

    it("should handle no configured accounts", async function() {
      configManagerStub.listAccounts.returns([]);

      const result = await interactiveHelper.selectAccount();

      expect(result).to.be.null;
      expect(promptStub.called).to.be.false;
      expect(consoleLogSpy.calledWith(sinon.match(/No accounts configured/))).to.be.true;
    });

    it("should handle errors", async function() {
      configManagerStub.listAccounts.throws(new Error("Test error"));

      const result = await interactiveHelper.selectAccount();

      expect(result).to.be.null;
    });
  });

  describe("#selectApp", function() {
    let controlApiStub: sinon.SinonStubbedInstance<ControlApi>;

    beforeEach(function() {
      controlApiStub = sandbox.createStubInstance(ControlApi);
    });

    it("should return selected app", async function() {
      const apps: App[] = [
        {
          id: "app1",
          name: "App 1",
          accountId: "account1",
          created: 1234567890,
          modified: 1234567890,
          status: "active",
          tlsOnly: false
        },
        {
          id: "app2",
          name: "App 2",
          accountId: "account1",
          created: 1234567890,
          modified: 1234567890,
          status: "active",
          tlsOnly: false
        }
      ];

      controlApiStub.listApps.resolves(apps);

      const selectedApp = apps[1];
      promptStub.resolves({ selectedApp });

      const result = await interactiveHelper.selectApp(controlApiStub);

      expect(result).to.equal(selectedApp);
      expect(promptStub.calledOnce).to.be.true;
      expect(controlApiStub.listApps.calledOnce).to.be.true;
    });

    it("should handle no apps found", async function() {
      controlApiStub.listApps.resolves([]);

      const result = await interactiveHelper.selectApp(controlApiStub);

      expect(result).to.be.null;
      expect(promptStub.called).to.be.false;
      expect(consoleLogSpy.calledWith(sinon.match(/No apps found/))).to.be.true;
    });

    it("should handle errors", async function() {
      controlApiStub.listApps.rejects(new Error("Test error"));

      const result = await interactiveHelper.selectApp(controlApiStub);

      expect(result).to.be.null;
    });
  });

  describe("#selectKey", function() {
    let controlApiStub: sinon.SinonStubbedInstance<ControlApi>;

    beforeEach(function() {
      controlApiStub = sandbox.createStubInstance(ControlApi);
    });

    it("should return selected key", async function() {
      const keys: Key[] = [
        {
          id: "key1",
          name: "Key 1",
          key: "app1.key1:secret1",
          appId: "app1",
          capability: {},
          created: 1234567890,
          modified: 1234567890,
          revocable: true,
          status: "active"
        },
        {
          id: "key2",
          name: "Key 2",
          key: "app1.key2:secret2",
          appId: "app1",
          capability: {},
          created: 1234567890,
          modified: 1234567890,
          revocable: true,
          status: "active"
        }
      ];

      controlApiStub.listKeys.resolves(keys);

      const selectedKey = keys[1];
      promptStub.resolves({ selectedKey });

      const result = await interactiveHelper.selectKey(controlApiStub, "app1");

      expect(result).to.equal(selectedKey);
      expect(promptStub.calledOnce).to.be.true;
      expect(controlApiStub.listKeys.calledOnce).to.be.true;
      expect(controlApiStub.listKeys.calledWith("app1")).to.be.true;
    });

    it("should handle unnamed keys", async function() {
      const keys: Key[] = [
        {
          id: "key1",
          key: "app1.key1:secret1",
          appId: "app1",
          capability: {},
          created: 1234567890,
          modified: 1234567890,
          name: "",
          revocable: true,
          status: "active"
        },
        {
          id: "key2",
          name: "Key 2",
          key: "app1.key2:secret2",
          appId: "app1",
          capability: {},
          created: 1234567890,
          modified: 1234567890,
          revocable: true,
          status: "active"
        }
      ];

      controlApiStub.listKeys.resolves(keys);
      promptStub.resolves({ selectedKey: keys[0] });

      await interactiveHelper.selectKey(controlApiStub, "app1");

      // Check that the prompt choices include "Unnamed key" for the first key
      const choices = promptStub.firstCall.args[0][0].choices;
      expect(choices[0].name).to.include("Unnamed key");
    });

    it("should handle no keys found", async function() {
      controlApiStub.listKeys.resolves([]);

      const result = await interactiveHelper.selectKey(controlApiStub, "app1");

      expect(result).to.be.null;
      expect(promptStub.called).to.be.false;
      expect(consoleLogSpy.calledWith(sinon.match(/No keys found/))).to.be.true;
    });

    it("should handle errors", async function() {
      controlApiStub.listKeys.rejects(new Error("Test error"));

      const result = await interactiveHelper.selectKey(controlApiStub, "app1");

      expect(result).to.be.null;
    });
  });
});
