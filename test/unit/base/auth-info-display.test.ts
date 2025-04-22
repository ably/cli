import { expect } from "chai";
import sinon from "sinon";

import { AblyBaseCommand } from "../../../src/base-command.js";
import { ConfigManager } from "../../../src/services/config-manager.js";

// Test implementation of AblyBaseCommand for testing protected methods
class TestCommand extends AblyBaseCommand {
  // Implement the abstract run method required by oclif
  async run(): Promise<void> {
    // No-op for testing
  }

  // For direct testing of shouldHideAccountInfo
  public testShouldHideAccountInfo(flags: any = {}): boolean {
    return this.shouldHideAccountInfo(flags);
  }

  // For direct testing of showAuthInfoIfNeeded
  public testShowAuthInfoIfNeeded(flags: any = {}): void {
    return this.showAuthInfoIfNeeded(flags);
  }

  // For direct testing of displayAuthInfo
  public testDisplayAuthInfo(flags: any = {}, showAppInfo: boolean = true): void {
    return this.displayAuthInfo(flags, showAppInfo);
  }

  // Expose other protected methods for testing
  public testShouldShowAuthInfo(): boolean {
    return this.shouldShowAuthInfo();
  }

  public testShouldOutputJson(flags: any = {}): boolean {
    return this.shouldOutputJson(flags);
  }

  public testShouldSuppressOutput(flags: any = {}): boolean {
    return this.shouldSuppressOutput(flags);
  }

  public testDisplayDataPlaneInfo(flags: any = {}): void {
    this.displayDataPlaneInfo(flags);
  }

  public testDisplayControlPlaneInfo(flags: any = {}): void {
    this.displayControlPlaneInfo(flags);
  }
}

describe("Auth Info Display", function() {
  let command: TestCommand;
  let configManagerStub: sinon.SinonStubbedInstance<ConfigManager>;
  let logStub: sinon.SinonStub;
  let debugStub: sinon.SinonStub;

  beforeEach(function() {
    // Create stubs
    configManagerStub = sinon.createStubInstance(ConfigManager);

    // Initialize command with stubs
    command = new TestCommand([], {} as any);

    // Replace the command's configManager with our stub
    (command as any).configManager = configManagerStub;

    // Set up common stub behaviors - will be overridden in specific tests
    configManagerStub.getCurrentAccount.returns({
      accountId: "test-account-id",
      accountName: "Test Account",
      accessToken: "test-token",
    });

    // Stub log and debug methods
    logStub = sinon.stub(command as any, 'log');
    debugStub = sinon.stub(command as any, 'debug');

    // Make sure environment variables are clean
    delete process.env.ABLY_API_KEY;
    delete process.env.ABLY_ACCESS_TOKEN;
  });

  afterEach(function() {
    sinon.restore();
    delete process.env.ABLY_API_KEY;
    delete process.env.ABLY_ACCESS_TOKEN;
  });

  describe("shouldHideAccountInfo", function() {
    it("should return true when no account is configured", function() {
      configManagerStub.getCurrentAccount.returns(undefined as any);
      expect(command.testShouldHideAccountInfo({})).to.be.true;
    });

    it("should return true when API key is provided explicitly", function() {
      expect(command.testShouldHideAccountInfo({ "api-key": "app-id.key:secret" })).to.be.true;
    });

    it("should return true when token is provided explicitly", function() {
      expect(command.testShouldHideAccountInfo({ token: "some-token" })).to.be.true;
    });

    it("should return true when access token is provided explicitly", function() {
      expect(command.testShouldHideAccountInfo({ "access-token": "some-access-token" })).to.be.true;
    });

    it("should return true when ABLY_API_KEY environment variable is set", function() {
      process.env.ABLY_API_KEY = "app-id.key:secret";
      expect(command.testShouldHideAccountInfo({})).to.be.true;
    });

    it("should return true when ABLY_ACCESS_TOKEN environment variable is set", function() {
      process.env.ABLY_ACCESS_TOKEN = "some-access-token";
      expect(command.testShouldHideAccountInfo({})).to.be.true;
    });

    it("should return false when account is configured and no auth overrides", function() {
      expect(command.testShouldHideAccountInfo({})).to.be.false;
    });
  });

  describe("displayAuthInfo", function() {
    let shouldHideAccountInfoStub: sinon.SinonStub;

    beforeEach(function() {
      shouldHideAccountInfoStub = sinon.stub(command as any, 'shouldHideAccountInfo');

      // Set up stubs for app info
      configManagerStub.getCurrentAppId.returns('test-app-id');
      configManagerStub.getAppName.returns('Test App');
      configManagerStub.getApiKey.returns('test-app-id.key:secret');
      configManagerStub.getKeyName.returns('Test Key');
    });

    it("should not include account info when shouldHideAccountInfo returns true", function() {
      // Setup
      shouldHideAccountInfoStub.returns(true);

      // Execute
      command.testDisplayAuthInfo({});

      // Verify that the log output doesn't contain account info
      expect(logStub.called).to.be.true;
      const outputCalls = logStub.getCalls().map(call => call.args[0]);
      const outputWithUsingPrefix = outputCalls.find(output => typeof output === 'string' && output.includes('Using:'));
      expect(outputWithUsingPrefix).to.not.include('Account=');
      expect(outputWithUsingPrefix).to.include('App=');
    });

    it("should include account info when shouldHideAccountInfo returns false", function() {
      // Setup
      shouldHideAccountInfoStub.returns(false);

      // Execute
      command.testDisplayAuthInfo({});

      // Verify that the log output contains account info
      expect(logStub.called).to.be.true;
      const outputCalls = logStub.getCalls().map(call => call.args[0]);
      const outputWithUsingPrefix = outputCalls.find(output => typeof output === 'string' && output.includes('Using:'));
      expect(outputWithUsingPrefix).to.include('Account=');
    });

    it("should not display anything when there are no parts to show", function() {
      // Setup - hide account and don't show app info
      shouldHideAccountInfoStub.returns(true);

      // Execute - setting showAppInfo to false means no app info is included
      command.testDisplayAuthInfo({}, false);

      // Verify that nothing was logged
      expect(logStub.called).to.be.false;
    });

    it("should display app and auth info when token is provided", function() {
      // Setup
      shouldHideAccountInfoStub.returns(true);

      // Execute with token - also need to ensure the command has a token that's reflected in output
      const flags = { token: "test-token" };
      command.testDisplayAuthInfo(flags);

      // Verify output includes token info but not account info
      expect(logStub.called).to.be.true;
      const outputCalls = logStub.getCalls().map(call => call.args[0]);
      const outputWithUsingPrefix = outputCalls.find(output => typeof output === 'string' && output.includes('Using:'));
      expect(outputWithUsingPrefix).to.not.include('Account=');
      expect(outputWithUsingPrefix).to.include('App=');
      // The token is shown in a special format that may include ANSI color codes
      expect(outputWithUsingPrefix).to.include('Token');
    });

    it("should display app and key info when API key is provided", function() {
      // Setup
      shouldHideAccountInfoStub.returns(true);

      // Execute with API key
      command.testDisplayAuthInfo({ "api-key": "test-app-id.key:secret" });

      // Verify output includes key info but not account info
      expect(logStub.called).to.be.true;
      const outputCalls = logStub.getCalls().map(call => call.args[0]);
      const outputWithUsingPrefix = outputCalls.find(output => typeof output === 'string' && output.includes('Using:'));
      expect(outputWithUsingPrefix).to.not.include('Account=');
      expect(outputWithUsingPrefix).to.include('App=');
      expect(outputWithUsingPrefix).to.include('Key=');
    });
  });

  describe("showAuthInfoIfNeeded", function() {
    let displayDataPlaneInfoStub: sinon.SinonStub;
    let displayControlPlaneInfoStub: sinon.SinonStub;
    let shouldShowAuthInfoStub: sinon.SinonStub;
    let shouldOutputJsonStub: sinon.SinonStub;
    let shouldSuppressOutputStub: sinon.SinonStub;

    beforeEach(function() {
      // Create stubs for all the methods called by showAuthInfoIfNeeded
      displayDataPlaneInfoStub = sinon.stub(command as any, 'displayDataPlaneInfo');
      displayControlPlaneInfoStub = sinon.stub(command as any, 'displayControlPlaneInfo');
      shouldShowAuthInfoStub = sinon.stub(command as any, 'shouldShowAuthInfo');
      shouldOutputJsonStub = sinon.stub(command as any, 'shouldOutputJson');
      shouldSuppressOutputStub = sinon.stub(command as any, 'shouldSuppressOutput');

      // Default behavior - will be overridden in specific tests
      shouldShowAuthInfoStub.returns(true);
      shouldOutputJsonStub.returns(false);
      shouldSuppressOutputStub.returns(false);

      // Default to non-web CLI mode
      (command as any).isWebCliMode = false;
    });

    it("should skip display when shouldShowAuthInfo returns false", function() {
      shouldShowAuthInfoStub.returns(false);

      command.testShowAuthInfoIfNeeded({});

      expect(debugStub.calledOnce).to.be.true;
      expect(displayDataPlaneInfoStub.called).to.be.false;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should skip display when quiet flag is true", function() {
      command.testShowAuthInfoIfNeeded({ quiet: true });

      expect(displayDataPlaneInfoStub.called).to.be.false;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should skip display when in JSON output mode", function() {
      shouldOutputJsonStub.returns(true);

      command.testShowAuthInfoIfNeeded({});

      expect(displayDataPlaneInfoStub.called).to.be.false;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should skip display when token-only flag is true", function() {
      command.testShowAuthInfoIfNeeded({ "token-only": true });

      expect(displayDataPlaneInfoStub.called).to.be.false;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should skip display when shouldSuppressOutput returns true", function() {
      shouldSuppressOutputStub.returns(true);

      command.testShowAuthInfoIfNeeded({});

      expect(displayDataPlaneInfoStub.called).to.be.false;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should skip display in Web CLI mode", function() {
      (command as any).isWebCliMode = true;

      command.testShowAuthInfoIfNeeded({});

      expect(debugStub.calledOnce).to.be.true;
      expect(displayDataPlaneInfoStub.called).to.be.false;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should call displayDataPlaneInfo for apps: commands", function() {
      Object.defineProperty(command, 'id', { value: 'apps:list' });

      command.testShowAuthInfoIfNeeded({});

      expect(displayDataPlaneInfoStub.calledOnce).to.be.true;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should call displayDataPlaneInfo for channels: commands", function() {
      Object.defineProperty(command, 'id', { value: 'channels:publish' });

      command.testShowAuthInfoIfNeeded({});

      expect(displayDataPlaneInfoStub.calledOnce).to.be.true;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should call displayDataPlaneInfo for auth: commands", function() {
      Object.defineProperty(command, 'id', { value: 'auth:issue-ably-token' });

      command.testShowAuthInfoIfNeeded({});

      expect(displayDataPlaneInfoStub.calledOnce).to.be.true;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should call displayDataPlaneInfo for rooms: commands", function() {
      Object.defineProperty(command, 'id', { value: 'rooms:list' });

      command.testShowAuthInfoIfNeeded({});

      expect(displayDataPlaneInfoStub.calledOnce).to.be.true;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should call displayControlPlaneInfo for accounts: commands", function() {
      Object.defineProperty(command, 'id', { value: 'accounts:list' });

      command.testShowAuthInfoIfNeeded({});

      expect(displayDataPlaneInfoStub.called).to.be.false;
      expect(displayControlPlaneInfoStub.calledOnce).to.be.true;
    });

    it("should call displayControlPlaneInfo for integrations: commands", function() {
      Object.defineProperty(command, 'id', { value: 'integrations:list' });

      command.testShowAuthInfoIfNeeded({});

      expect(displayDataPlaneInfoStub.called).to.be.false;
      expect(displayControlPlaneInfoStub.calledOnce).to.be.true;
    });

    it("should not call any display method for other commands", function() {
      Object.defineProperty(command, 'id', { value: 'help' });

      command.testShowAuthInfoIfNeeded({});

      expect(displayDataPlaneInfoStub.called).to.be.false;
      expect(displayControlPlaneInfoStub.called).to.be.false;
    });

    it("should pass flags to display methods", function() {
      Object.defineProperty(command, 'id', { value: 'apps:list' });
      const flags = { app: 'test-app', verbose: true };

      command.testShowAuthInfoIfNeeded(flags);

      expect(displayDataPlaneInfoStub.calledOnceWith(flags)).to.be.true;
    });
  });
});
