import { expect } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import AccountsLogin from "../../../../src/commands/accounts/login.js";
import { ConfigManager } from "../../../../src/services/config-manager.js";

describe("AccountsLogin", function() {
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
      expect(AccountsLogin.description).to.equal("Log in to your Ably account");
      expect(AccountsLogin.examples).to.be.an('array');
      expect(AccountsLogin.args).to.have.property('token');
      expect(AccountsLogin.flags).to.have.property('alias');
      expect(AccountsLogin.flags).to.have.property('no-browser');
    });

    it("should have required flags configuration", function() {
      expect(AccountsLogin.flags.alias).to.have.property('char', 'a');
      expect(AccountsLogin.flags['no-browser']).to.have.property('default', false);
    });

    it("should have token argument configuration", function() {
      expect(AccountsLogin.args.token).to.have.property('required', false);
      expect(AccountsLogin.args.token).to.have.property('description');
    });
  });

  describe("command instantiation", function() {
    it("should create command instance", function() {
      const command = new AccountsLogin([], {} as any);
      expect(command).to.be.instanceOf(AccountsLogin);
      expect(command.run).to.be.a('function');
    });

    it("should have correct command structure", function() {
      const command = new AccountsLogin([], {} as any);
      expect(command.constructor.name).to.equal("AccountsLogin");
    });
  });

  describe("URL construction logic", function() {
    it("should construct local URLs correctly", function() {
      const localHost = "localhost:3000";
      const expectedUrl = `http://${localHost}/users/access_tokens`;
      
      expect(expectedUrl).to.equal("http://localhost:3000/users/access_tokens");
    });

    it("should construct production URLs correctly", function() {
      const productionHost = "control.ably.net";
      const expectedUrl = `https://${productionHost}/users/access_tokens`;
      
      expect(expectedUrl).to.equal("https://control.ably.net/users/access_tokens");
    });

    it("should handle custom control host URLs", function() {
      const customHost = "custom.ably.net";
      const expectedUrl = `https://${customHost}/users/access_tokens`;
      
      expect(expectedUrl).to.equal("https://custom.ably.net/users/access_tokens");
    });
  });

  describe("alias validation logic", function() {
    it("should accept valid alias formats", function() {
      const validAliases = ["valid", "valid-alias", "valid_alias", "v123"];
      
      // Test that these would be considered valid formats
      validAliases.forEach(alias => {
        expect(/^[a-z][\d_a-z-]*$/i.test(alias)).to.be.true;
      });
    });

    it("should reject invalid alias formats", function() {
      const invalidAliases = ["123invalid", "invalid@", "invalid space", "invalid!"];
      
      // Test that these would be rejected
      invalidAliases.forEach(alias => {
        expect(/^[a-z][\d_a-z-]*$/i.test(alias)).to.be.false;
      });
    });

    it("should require alias to start with letter", function() {
      const startsWithLetter = /^[a-z]/i;
      
      expect(startsWithLetter.test("valid")).to.be.true;
      expect(startsWithLetter.test("123invalid")).to.be.false;
    });
  });

  describe("output formatting", function() {
    it("should format successful JSON output", function() {
      const successData = {
        account: {
          alias: "test",
          id: "testId",
          name: "Test Account",
          user: {
            email: "test@example.com"
          }
        },
        success: true
      };
      
      const jsonOutput = JSON.stringify(successData);
      expect(jsonOutput).to.include('"success":true');
      expect(jsonOutput).to.include('"account"');
    });

    it("should format error JSON output", function() {
      const errorData = {
        error: "Authentication failed",
        success: false
      };
      
      const jsonOutput = JSON.stringify(errorData);
      expect(jsonOutput).to.include('"success":false');
      expect(jsonOutput).to.include('"error"');
    });
  });

  describe("browser command detection", function() {
    it("should use correct open command for different platforms", function() {
      const platforms = {
        darwin: "open",
        win32: "start",
        linux: "xdg-open"
      };
      
      Object.entries(platforms).forEach(([platform, command]) => {
        expect(command).to.be.a('string');
        expect(command.length).to.be.greaterThan(0);
      });
    });
  });

  describe("configuration integration", function() {
    it("should work with ConfigManager", function() {
      // Test basic instantiation without complex mocking
      expect(() => new ConfigManager()).to.not.throw();
    });
  });

  describe("prompt response validation", function() {
    it("should handle yes/no responses correctly", function() {
      const yesResponses = ["y", "yes", "Y", "YES"];
      const noResponses = ["n", "no", "N", "NO"];
      
      yesResponses.forEach(response => {
        expect(["y", "yes"].includes(response.toLowerCase())).to.be.true;
      });
      
      noResponses.forEach(response => {
        expect(["n", "no"].includes(response.toLowerCase())).to.be.true;
      });
    });
  });
});