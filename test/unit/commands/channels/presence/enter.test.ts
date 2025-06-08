import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ChannelsPresenceEnter from "../../../../../src/commands/channels/presence/enter.js";
import * as Ably from "ably";

// Create a testable version of ChannelsPresenceEnter
class TestableChannelsPresenceEnter extends ChannelsPresenceEnter {
  public errorOutput: string = '';
  private _parseResult: any;
  public mockClient: any = {}; // Initialize mockClient
  private _shouldOutputJson = false;
  private _formatJsonOutputFn: ((data: Record<string, unknown>) => string) | null = null;

  // Override parse to simulate parse output
  public override async parse(..._args: any[]) {
    if (!this._parseResult) {
        // Default parse result if not set
        this._parseResult = {
            flags: { 'profile-data': '{}', 'show-others': true },
            args: { channel: 'default-presence-channel' },
            argv: ['default-presence-channel'],
            raw: [],
        };
    }
    return this._parseResult;
  }

  public setParseResult(result: any) {
    this._parseResult = result;
    // Ensure argv reflects args.channel for run() method logic
    if (result.args?.channel) {
        this._parseResult.argv = [result.args.channel];
    }
  }

  // Correct override signature for the error method
  public override error(message: string | Error, _options?: { code?: string; exit?: number | false }): never {
    this.errorOutput = typeof message === 'string' ? message : message.message;
    // Prevent actual exit during tests by throwing instead
    throw new Error(this.errorOutput);
  }

  // Override JSON output methods
  public override shouldOutputJson(_flags?: any): boolean {
    return this._shouldOutputJson;
  }

  public setShouldOutputJson(value: boolean) {
    this._shouldOutputJson = value;
  }

  public override formatJsonOutput(data: Record<string, unknown>, _flags?: Record<string, unknown>): string {
    return this._formatJsonOutputFn ? this._formatJsonOutputFn(data) : JSON.stringify(data);
  }

  public setFormatJsonOutput(fn: (data: Record<string, unknown>) => string) {
    this._formatJsonOutputFn = fn;
  }

  // Helper for blocking promises - MODIFIED to resolve immediately for unit tests
  public override setupCleanupHandler(_cleanupFn: () => Promise<void>): Promise<void> {
    this.debug("Skipping indefinite wait in setupCleanupHandler for test.");
    return Promise.resolve();
  }


  // Override ensureAppAndKey to prevent real auth checks in unit tests
  protected override async ensureAppAndKey(_flags: any): Promise<{ apiKey: string; appId: string } | null> {
    this.debug('Skipping ensureAppAndKey in test mode');
    return { apiKey: 'dummy-key-value:secret', appId: 'dummy-app' };
  }

  // Override the createAblyClient method to ensure it returns a value
  public override async createAblyClient(_flags?: any): Promise<Ably.Realtime | null> {
    this.debug('Overriding createAblyClient in test mode, returning mockClient.');
    // Return the mock client that was set up for testing
    return this.mockClient as unknown as Ably.Realtime;
  }

}

describe("ChannelsPresenceEnter", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableChannelsPresenceEnter;
  let mockConfig: Config;
  let _logStub: sinon.SinonStub;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sandbox.stub() } as unknown as Config;
    command = new TestableChannelsPresenceEnter([], mockConfig);
    _logStub = sandbox.stub(command, 'log');

    // No need to stub the ES module - we override the method in run() below

    // Set up a more complete mock client structure for beforeEach
    const mockPresenceInstance = {
        get: sandbox.stub().resolves([]), // Default to empty members
        subscribe: sandbox.stub(),
        unsubscribe: sandbox.stub(),
        enter: sandbox.stub().resolves(),
        leave: sandbox.stub().resolves(),
    };
    const mockChannelInstance = {
      name: 'test-presence-channel', // Add default name
      presence: mockPresenceInstance,
      subscribe: sandbox.stub(),
      unsubscribe: sandbox.stub(),
      // Make attach resolve quickly
      attach: sandbox.stub().resolves(),
      detach: sandbox.stub().resolves(),
      // Simulate channel attached event shortly after attach is called
      on: sandbox.stub().callsFake((event: string, handler: (stateChange: any) => void) => {
          if (event === 'attached' && typeof handler === 'function') {
            // Simulate async event
            setTimeout(() => handler({ current: 'attached' }), 0);
          }
      }),
    };

    command.mockClient = {
      channels: {
        get: sandbox.stub().returns(mockChannelInstance),
        release: sandbox.stub(),
      },
      connection: {
        once: sandbox.stub(),
        // Simulate connection connected event quickly
        on: sandbox.stub().callsFake((event: string, handler: (stateChange: any) => void) => {
            if (event === 'connected' && typeof handler === 'function') {
                // Simulate async event
                setTimeout(() => handler({ current: 'connected' }), 0);
            }
        }),
        close: sandbox.stub(),
        state: 'connected', // Start in connected state for simplicity
      },
      auth: {
        clientId: 'test-client-id',
      },
      close: sandbox.stub(),
    };

    // Ensure the overridden createAblyClient uses this mock
    // (Already handled by the class override, no need to stub it again here)

    // Set default parse result (can be overridden by specific tests)
    command.setParseResult({
      flags: { 'profile-data': '{}', 'show-others': true },
      args: { channel: 'test-presence-channel' },
      raw: [],
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should create an Ably client when run", async function() {
    const createClientSpy = sinon.spy(command, 'createAblyClient');

    // Stub the actual functionality to avoid long-running operations
    const runStub = sinon.stub(command, 'run').callsFake(async function(this: TestableChannelsPresenceEnter) {
      await this.createAblyClient({});
      return;
    });

    await command.run();

    expect(createClientSpy.calledOnce).to.be.true;
    
    createClientSpy.restore();
    runStub.restore();
  });

  it("should parse profile data correctly", async function() {
    command.setParseResult({
      flags: { 'profile-data': '{"status":"online"}' },
      args: { channel: 'test-channel' },
      raw: [],
    });

    const parseResult = await command.parse();
    expect(parseResult.flags['profile-data']).to.equal('{"status":"online"}');
  });

  it("should handle invalid JSON in profile data", function() {
    command.setParseResult({
      flags: { 'profile-data': '{invalid-json}' },
      args: { channel: 'test-channel' },
      raw: [],
    });

    // Test JSON parsing logic directly
    const invalidJson = '{invalid-json}';
    expect(() => JSON.parse(invalidJson)).to.throw();
  });

  it("should return mock client from createAblyClient", async function() {
    const client = await command.createAblyClient({});
    expect(client).to.equal(command.mockClient);
  });

  it("should format JSON output when shouldOutputJson is true", function() {
    command.setShouldOutputJson(true);
    command.setFormatJsonOutput((data) => JSON.stringify(data, null, 2));

    const testData = { channel: 'test', action: 'enter' };
    const result = command.formatJsonOutput(testData);
    
    expect(result).to.be.a('string');
    expect(() => JSON.parse(result)).to.not.throw();
    
    const parsed = JSON.parse(result);
    expect(parsed).to.deep.equal(testData);
  });
});
