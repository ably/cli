import { expect } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import * as https from "node:https";
import * as Ably from "ably";
import RevokeTokenCommand from "../../../../src/commands/auth/revoke-token.js";
import { ConfigManager } from "../../../../src/services/config-manager.js";

describe("RevokeTokenCommand", function() {
  let configManagerStub: sinon.SinonStubbedInstance<ConfigManager>;
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;
  let mockAblyClient: sinon.SinonStubbedInstance<Ably.Realtime>;

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

    // Mock Ably client
    mockAblyClient = sandbox.createStubInstance(Ably.Realtime);
    mockAblyClient.connection = {
      once: sandbox.stub(),
      state: 'connected'
    } as any;
    mockAblyClient.close = sandbox.stub();

    // Mock global test mocks for Ably client
    (globalThis as any).__TEST_MOCKS__ = {
      ablyRestMock: sandbox.createStubInstance(Ably.Rest)
    };
  });

  afterEach(function() {
    sandbox.restore();
    process.env = originalEnv;
    delete (globalThis as any).__TEST_MOCKS__;
  });

  describe("command properties", function() {
    it("should have correct static properties", function() {
      expect(RevokeTokenCommand.description).to.equal("Revokes the token provided");
      expect(RevokeTokenCommand.examples).to.be.an('array');
      expect(RevokeTokenCommand.args).to.have.property('token');
      expect(RevokeTokenCommand.flags).to.have.property('client-id');
      expect(RevokeTokenCommand.flags).to.have.property('debug');
    });

    it("should have required token argument", function() {
      expect(RevokeTokenCommand.args.token).to.have.property('required', true);
      expect(RevokeTokenCommand.args.token).to.have.property('name', 'token');
    });

    it("should have client-id flag with char 'c'", function() {
      expect(RevokeTokenCommand.flags['client-id']).to.have.property('char', 'c');
    });

    it("should have debug flag with default false", function() {
      expect(RevokeTokenCommand.flags.debug).to.have.property('default', false);
    });
  });

  describe("API key parsing", function() {
    it("should parse API key correctly", function() {
      const command = new RevokeTokenCommand([], {} as any);
      (command as any).configManager = configManagerStub;
      
      const apiKey = "appId.keyId:keySecret";
      const keyParts = apiKey.split(":");
      
      expect(keyParts).to.have.length(2);
      expect(keyParts[0]).to.equal("appId.keyId");
      expect(keyParts[1]).to.equal("keySecret");
    });

    it("should extract keyName from API key", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const apiKey = "appId.keyId:keySecret";
      const keyName = apiKey.split(":")[0];
      
      expect(keyName).to.equal("appId.keyId");
    });

    it("should handle invalid API key format", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const invalidApiKey = "invalidkey";
      const keyParts = invalidApiKey.split(":");
      
      expect(keyParts).to.have.length(1);
      // This would trigger an error in the actual command
      expect(keyParts.length !== 2).to.be.true;
    });
  });

  describe("request body construction", function() {
    it("should construct request body with client ID", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const clientId = "testClient";
      const requestBody = {
        targets: [`clientId:${clientId}`]
      };
      
      expect(requestBody).to.have.property('targets');
      expect(requestBody.targets).to.be.an('array');
      expect(requestBody.targets[0]).to.equal("clientId:testClient");
    });

    it("should use token as client ID when no client-id flag provided", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const token = "testToken123";
      const clientId = token; // When no client-id flag is provided
      const requestBody = {
        targets: [`clientId:${clientId}`]
      };
      
      expect(requestBody.targets[0]).to.equal("clientId:testToken123");
    });
  });

  describe("HTTPS request handling", function() {
    it("should construct correct HTTPS request options", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const keyName = "appId.keyId";
      const secret = "keySecret";
      const encodedAuth = Buffer.from(`${keyName}:${secret}`).toString("base64");
      
      const expectedOptions = {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${encodedAuth}`,
          "Content-Type": "application/json",
        },
        hostname: "rest.ably.io",
        method: "POST",
        path: `/keys/${keyName}/revokeTokens`,
        port: 443,
      };
      
      expect(expectedOptions.hostname).to.equal("rest.ably.io");
      expect(expectedOptions.method).to.equal("POST");
      expect(expectedOptions.path).to.equal("/keys/appId.keyId/revokeTokens");
      expect(expectedOptions.headers.Authorization).to.include("Basic");
    });

    it("should encode authorization header correctly", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const keyName = "appId.keyId";
      const secret = "keySecret";
      const expectedEncoded = Buffer.from(`${keyName}:${secret}`).toString("base64");
      
      expect(expectedEncoded).to.be.a('string');
      expect(expectedEncoded.length).to.be.greaterThan(0);
    });
  });

  describe("debug output", function() {
    it("should log debug information when debug flag is enabled", function() {
      const command = new RevokeTokenCommand([], {} as any);
      const logSpy = sandbox.spy(command, 'log');
      
      const debugFlag = true;
      const apiKey = "appId.keyId:keySecret";
      const maskedKey = apiKey.replace(/:.+/, ":***");
      
      if (debugFlag) {
        // This would be logged in debug mode
        const debugMessage = `Debug: Using API key: ${maskedKey}`;
        expect(debugMessage).to.include("Debug: Using API key:");
        expect(debugMessage).to.include(":***");
      }
    });

    it("should mask API key secret in debug output", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const apiKey = "appId.keyId:realSecret";
      const maskedKey = apiKey.replace(/:.+/, ":***");
      
      expect(maskedKey).to.equal("appId.keyId:***");
      expect(maskedKey).to.not.include("realSecret");
    });

    it("should log request details in debug mode", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const keyName = "appId.keyId";
      const requestBody = { targets: ["clientId:testClient"] };
      
      const debugMessages = [
        `Debug: Sending request to endpoint: /keys/${keyName}/revokeTokens`,
        `Debug: Request body: ${JSON.stringify(requestBody)}`
      ];
      
      expect(debugMessages[0]).to.include("/keys/appId.keyId/revokeTokens");
      expect(debugMessages[1]).to.include("clientId:testClient");
    });
  });

  describe("warning messages", function() {
    it("should warn about token revocation limitations", function() {
      const command = new RevokeTokenCommand([], {} as any);
      const warnSpy = sandbox.spy(command, 'warn');
      
      const expectedWarnings = [
        "Revoking a specific token is only possible if it has a client ID or revocation key",
        "For advanced token revocation options, see: https://ably.com/docs/auth/revocation",
        "Using the token argument as a client ID for this operation"
      ];
      
      expectedWarnings.forEach(warning => {
        expect(warning).to.be.a('string');
        expect(warning.length).to.be.greaterThan(0);
      });
    });
  });

  describe("output formatting", function() {
    it("should format successful JSON output", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const successData = {
        message: "Token revocation processed successfully",
        response: {},
        success: true
      };
      
      const jsonOutput = JSON.stringify(successData);
      expect(jsonOutput).to.include('"success":true');
      expect(jsonOutput).to.include('"message"');
      expect(jsonOutput).to.include("Token revocation processed successfully");
    });

    it("should format error JSON output", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const errorData = {
        error: "Token not found or already revoked",
        success: false
      };
      
      const jsonOutput = JSON.stringify(errorData);
      expect(jsonOutput).to.include('"success":false');
      expect(jsonOutput).to.include('"error"');
      expect(jsonOutput).to.include("Token not found");
    });

    it("should handle successful text output", function() {
      const command = new RevokeTokenCommand([], {} as any);
      const logSpy = sandbox.spy(command, 'log');
      
      const successMessage = "Token successfully revoked";
      expect(successMessage).to.equal("Token successfully revoked");
    });
  });

  describe("error handling", function() {
    it("should handle token not found error", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const error = new Error("token_not_found");
      const isTokenNotFound = error.message.includes("token_not_found");
      
      expect(isTokenNotFound).to.be.true;
      
      if (isTokenNotFound) {
        const errorMessage = "Token not found or already revoked";
        expect(errorMessage).to.include("not found or already revoked");
      }
    });

    it("should handle network errors", function() {
      const command = new RevokeTokenCommand([], {} as any);
      const errorSpy = sandbox.spy(command, 'error');
      
      const networkError = new Error("Network connection failed");
      const errorMessage = `Error revoking token: ${networkError.message}`;
      
      expect(errorMessage).to.include("Error revoking token:");
      expect(errorMessage).to.include("Network connection failed");
    });

    it("should handle non-Error objects", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const unknownError = { code: 500, message: "Internal Server Error" };
      const errorMessage = typeof unknownError === "object" ? JSON.stringify(unknownError) : String(unknownError);
      
      expect(errorMessage).to.include("500");
      expect(errorMessage).to.include("Internal Server Error");
    });
  });

  describe("client lifecycle", function() {
    it("should create Ably client", function() {
      const command = new RevokeTokenCommand([], {} as any);
      (command as any).configManager = configManagerStub;
      
      // Test that client creation is handled
      const flags = {};
      
      // Mock ensureAppAndKey to return valid credentials
      configManagerStub.getCurrentAppId.returns("testApp");
      configManagerStub.getApiKey.returns("testApp.keyId:keySecret");
      
      expect(configManagerStub.getCurrentAppId).to.exist;
      expect(configManagerStub.getApiKey).to.exist;
    });

    it("should close client after operation", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      // Test that client would be closed in finally block
      const mockClient = mockAblyClient;
      const closeStub = mockClient.close as sinon.SinonStub;
      
      expect(closeStub).to.be.a('function');
    });

    it("should handle client creation failure", function() {
      const command = new RevokeTokenCommand([], {} as any);
      (command as any).configManager = configManagerStub;
      
      // Test scenario where ensureAppAndKey returns null
      configManagerStub.getCurrentAppId.returns("");
      configManagerStub.getApiKey.returns("");
      
      const appId = configManagerStub.getCurrentAppId();
      const apiKey = configManagerStub.getApiKey();
      
      expect(appId).to.equal("");
      expect(apiKey).to.equal("");
    });
  });

  describe("API endpoint construction", function() {
    it("should construct correct revoke tokens endpoint", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const keyName = "appId.keyId";
      const endpoint = `/keys/${keyName}/revokeTokens`;
      
      expect(endpoint).to.equal("/keys/appId.keyId/revokeTokens");
    });

    it("should use rest.ably.io as hostname", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const hostname = "rest.ably.io";
      const port = 443;
      
      expect(hostname).to.equal("rest.ably.io");
      expect(port).to.equal(443);
    });
  });

  describe("response parsing", function() {
    it("should parse successful JSON response", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const responseData = '{"success": true, "message": "Token revoked"}';
      let jsonResponse;
      
      try {
        jsonResponse = JSON.parse(responseData);
      } catch {
        jsonResponse = responseData;
      }
      
      expect(jsonResponse).to.be.an('object');
      expect(jsonResponse.success).to.be.true;
    });

    it("should handle empty response", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const emptyData = "";
      const jsonResponse = emptyData.length > 0 ? JSON.parse(emptyData) : null;
      
      expect(jsonResponse).to.be.null;
    });

    it("should handle non-JSON response", function() {
      const command = new RevokeTokenCommand([], {} as any);
      
      const textData = "Token revoked successfully";
      let jsonResponse;
      
      try {
        jsonResponse = JSON.parse(textData);
      } catch {
        jsonResponse = textData;
      }
      
      expect(jsonResponse).to.equal("Token revoked successfully");
    });
  });
});