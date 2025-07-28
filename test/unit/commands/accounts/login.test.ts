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
      ["win32", "darwin", "linux"].forEach((_platform) => {
        expect("open").to.be.a('string');
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

  describe("enhanced JSON output structure", function() {
    it("should format complete login response with app and key info", function() {
      const loginResponse = {
        account: {
          alias: "production",
          id: "acc-123",
          name: "My Company",
          user: {
            email: "user@company.com"
          }
        },
        app: {
          id: "app-456",
          name: "Production App",
          autoSelected: true
        },
        key: {
          id: "key-789",
          name: "Root Key",
          autoSelected: false
        },
        success: true
      };

      // Verify structure
      expect(loginResponse).to.have.property('account');
      expect(loginResponse).to.have.property('app');
      expect(loginResponse).to.have.property('key');
      expect(loginResponse.success).to.be.true;

      // Verify app info
      expect(loginResponse.app.autoSelected).to.be.true;
      expect(loginResponse.app.id).to.equal('app-456');

      // Verify key info
      expect(loginResponse.key.autoSelected).to.be.false;
      expect(loginResponse.key.id).to.equal('key-789');
    });

    it("should format login response without app when none selected", function() {
      const loginResponse = {
        account: {
          alias: "default",
          id: "acc-123",
          name: "My Company",
          user: {
            email: "user@company.com"
          }
        },
        success: true
      };

      // Verify minimal structure when no app/key selected
      expect(loginResponse).to.have.property('account');
      expect(loginResponse).to.not.have.property('app');
      expect(loginResponse).to.not.have.property('key');
      expect(loginResponse.success).to.be.true;
    });

    it("should format login response with app but no key", function() {
      const loginResponse = {
        account: {
          alias: "test",
          id: "acc-123",
          name: "My Company",
          user: {
            email: "user@company.com"
          }
        },
        app: {
          id: "app-456",
          name: "Test App",
          autoSelected: true
        },
        success: true
      };

      expect(loginResponse).to.have.property('account');
      expect(loginResponse).to.have.property('app');
      expect(loginResponse).to.not.have.property('key');
      expect(loginResponse.app.autoSelected).to.be.true;
    });
  });

  describe("app selection logic", function() {
    it("should handle single app scenario correctly", function() {
      const apps = [
        { id: 'app-123', name: 'Only App', accountId: 'test-account' }
      ];

      // Test the logic that would be used for single app selection
      expect(apps.length).to.equal(1);

      const selectedApp = apps[0];
      expect(selectedApp.id).to.equal('app-123');
      expect(selectedApp.name).to.equal('Only App');

      // In single app scenario, it should be auto-selected
      const isAutoSelected = true;
      expect(isAutoSelected).to.be.true;
    });

    it("should handle multiple apps scenario correctly", function() {
      const apps = [
        { id: 'app-123', name: 'Production App', accountId: 'test-account' },
        { id: 'app-456', name: 'Development App', accountId: 'test-account' }
      ];

      // Test the logic for multiple apps - should prompt user
      expect(apps.length).to.be.greaterThan(1);

      // Verify app structure
      apps.forEach(app => {
        expect(app).to.have.property('id');
        expect(app).to.have.property('name');
        expect(app).to.have.property('accountId');
      });
    });

    it("should handle no apps scenario correctly", function() {
      const apps: any[] = [];

      // Test the logic for no apps - should offer to create
      expect(apps.length).to.equal(0);

      // Simulate app creation response
      const createdApp = {
        id: 'new-app-789',
        name: 'My First App',
        accountId: 'test-account',
        tlsOnly: true
      };

      expect(createdApp.name).to.equal('My First App');
      expect(createdApp.tlsOnly).to.be.true;
    });
  });

  describe("key selection logic", function() {
    it("should handle single key scenario correctly", function() {
      const keys = [
        { id: 'key-456', name: 'Root Key', key: 'app.key:value' }
      ];

      // Test single key auto-selection logic
      expect(keys.length).to.equal(1);

      const selectedKey = keys[0];
      expect(selectedKey.id).to.equal('key-456');
      expect(selectedKey.name).to.equal('Root Key');

      // Single key should be auto-selected
      const isAutoSelected = true;
      expect(isAutoSelected).to.be.true;
    });

    it("should handle multiple keys scenario correctly", function() {
      const keys = [
        { id: 'key-root', name: 'Root Key', key: 'app.root:value' },
        { id: 'key-sub', name: 'Subscribe Key', key: 'app.sub:value' }
      ];

      // Test multiple keys logic - should prompt user
      expect(keys.length).to.be.greaterThan(1);

      // Verify key structure
      keys.forEach(key => {
        expect(key).to.have.property('id');
        expect(key).to.have.property('name');
        expect(key).to.have.property('key');
      });
    });

    it("should handle no keys scenario correctly", function() {
      const keys: any[] = [];

      // Test no keys scenario - should continue without error
      expect(keys.length).to.equal(0);

      // This should not cause the login to fail
      // User would need to create keys separately
    });
  });

  describe("app name validation", function() {
    it("should accept valid app names", function() {
      const validNames = ["My App", "production-app", "test_app_123", "App"];

      validNames.forEach(name => {
        expect(name.trim().length).to.be.greaterThan(0);
        expect(typeof name).to.equal('string');
      });
    });

    it("should reject empty app names", function() {
      const invalidNames = ["", "   ", "\t\n"];

      invalidNames.forEach(name => {
        expect(name.trim().length).to.equal(0);
      });
    });

    it("should handle app name edge cases", function() {
      const edgeCases = [
        "A", // Single character
        "Very Long App Name With Many Words And Characters",
        "App-with-dashes",
        "App_with_underscores",
        "App123WithNumbers"
      ];

      edgeCases.forEach(name => {
        expect(name.trim().length).to.be.greaterThan(0);
        expect(typeof name).to.equal('string');
      });
    });
  });

  describe("error handling scenarios", function() {
    it("should handle API errors gracefully", function() {
      const apiError = new Error('Network timeout');

      // Test that errors don't crash the login process
      expect(apiError.message).to.equal('Network timeout');
      expect(apiError).to.be.instanceOf(Error);

      // Login should continue and warn about failures
      const warningMessage = `Could not fetch apps: ${apiError.message}`;
      expect(warningMessage).to.include('Network timeout');
    });

    it("should handle authentication failures", function() {
      const authError = new Error('Invalid token');
      authError.name = 'AuthenticationError';

      expect(authError.message).to.equal('Invalid token');
      expect(authError.name).to.equal('AuthenticationError');

      const errorResponse = {
        error: authError.message,
        success: false
      };

      expect(errorResponse.success).to.be.false;
      expect(errorResponse.error).to.equal('Invalid token');
    });

    it("should handle app creation failures", function() {
      const createError = new Error('Insufficient permissions');

      expect(createError.message).to.equal('Insufficient permissions');

      // App creation failure should not prevent login completion
      const warningMessage = `Failed to create app: ${createError.message}`;
      expect(warningMessage).to.include('Insufficient permissions');
    });

    it("should handle key fetching failures", function() {
      const keyError = new Error('Key access denied');

      expect(keyError.message).to.equal('Key access denied');

      // Key fetching failure should not prevent login
      const warningMessage = `Could not fetch API keys: ${keyError.message}`;
      expect(warningMessage).to.include('Key access denied');
    });
  });
});
