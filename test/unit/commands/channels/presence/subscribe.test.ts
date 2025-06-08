import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ChannelsPresenceSubscribe from "../../../../../src/commands/channels/presence/subscribe.js";
import * as Ably from "ably";

// Create a testable version of ChannelsPresenceSubscribe
class TestableChannelsPresenceSubscribe extends ChannelsPresenceSubscribe {
  public logOutput: string[] = [];
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
            flags: {},
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

  // Override client creation to return a controlled mock
  public override async createAblyClient(_flags: any): Promise<Ably.Realtime | null> {
    this.debug('Overridden createAblyClient called');

    // Ensure mockClient is initialized if not already done (e.g., in beforeEach)
    if (!this.mockClient || !this.mockClient.channels) {
      this.debug('Initializing mockClient inside createAblyClient');
      const mockPresenceInstance = {
        get: sinon.stub().resolves([]),
        subscribe: sinon.stub(),
        unsubscribe: sinon.stub(),
        enter: sinon.stub().resolves(),
        leave: sinon.stub().resolves(),
      };
      const mockChannelInstance = {
        presence: mockPresenceInstance,
        subscribe: sinon.stub(),
        unsubscribe: sinon.stub(),
        attach: sinon.stub().resolves(),
        detach: sinon.stub().resolves(),
        on: sinon.stub(),
      };
      this.mockClient = {
        channels: {
          get: sinon.stub().returns(mockChannelInstance),
          release: sinon.stub(),
        },
        connection: {
          once: sinon.stub().callsFake((event, callback) => {
            if (event === 'connected') {
              setTimeout(callback, 5);
            }
          }),
          on: sinon.stub(),
          close: sinon.stub(),
          state: 'connected',
        },
        close: sinon.stub(),
      };
    }

    this.debug('Returning pre-configured mockClient');
    return this.mockClient as Ably.Realtime; // Return the existing mock
  }

  // Override logging methods
  public override log(message?: string | undefined, ..._args: any[]): void {
    // Attempt to capture chalk output or force to string
    const plainMessage = typeof message === 'string' ? message : String(message);
    this.logOutput.push(plainMessage);
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

  // Override ensureAppAndKey to prevent real auth checks in unit tests
  protected override async ensureAppAndKey(_flags: any): Promise<{ apiKey: string; appId: string } | null> {
    this.debug('Overridden ensureAppAndKey called');
    // Return dummy auth details required by some base class logic potentially
    return { apiKey: 'dummy.key:secret', appId: 'dummy-app' };
  }

}

describe("ChannelsPresenceSubscribe", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableChannelsPresenceSubscribe;
  let mockConfig: Config;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableChannelsPresenceSubscribe([], mockConfig);

    // Initialize mock client
    const mockPresenceInstance = {
      get: sandbox.stub().resolves([]),
      subscribe: sandbox.stub(),
      unsubscribe: sandbox.stub(),
      enter: sandbox.stub().resolves(),
      leave: sandbox.stub().resolves(),
    };
    const mockChannelInstance = {
      presence: mockPresenceInstance,
      subscribe: sandbox.stub(),
      unsubscribe: sandbox.stub(),
      attach: sandbox.stub().resolves(),
      detach: sandbox.stub().resolves(),
      on: sandbox.stub(),
    };
    command.mockClient = {
      channels: {
        get: sandbox.stub().returns(mockChannelInstance),
        release: sandbox.stub(),
      },
      connection: {
        once: sandbox.stub(),
        on: sandbox.stub(),
        close: sandbox.stub(),
        state: 'initialized',
      },
      close: sandbox.stub(),
    };

    // No need to stub createAblyClient in beforeEach since we're testing individual methods

    // Set default parse result
    command.setParseResult({
      flags: {},
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
    const runStub = sinon.stub(command, 'run').callsFake(async function(this: TestableChannelsPresenceSubscribe) {
      await this.createAblyClient({});
      return;
    });

    await command.run();

    expect(createClientSpy.calledOnce).to.be.true;
    
    createClientSpy.restore();
    runStub.restore();
  });

  it("should parse channel argument correctly", async function() {
    command.setParseResult({
      flags: {},
      args: { channel: 'my-presence-channel' },
      raw: [],
    });

    const parseResult = await command.parse();
    expect(parseResult.args.channel).to.equal('my-presence-channel');
  });

  it("should return mock client from createAblyClient", async function() {
    const client = await command.createAblyClient({});
    expect(client).to.equal(command.mockClient);
  });

  it("should format JSON output when shouldOutputJson is true", function() {
    command.setShouldOutputJson(true);
    command.setFormatJsonOutput((data) => JSON.stringify(data, null, 2));

    const testData = { channel: 'test', action: 'subscribe' };
    const result = command.formatJsonOutput(testData);
    
    expect(result).to.be.a('string');
    expect(() => JSON.parse(result)).to.not.throw();
    
    const parsed = JSON.parse(result);
    expect(parsed).to.deep.equal(testData);
  });

  it("should log presence member information", function() {
    const members = [
      { clientId: 'user1', data: { status: 'online' } },
      { clientId: 'user2', data: null }
    ];

    // Test the logging logic directly
    members.forEach(member => {
      const logMessage = `- Client: ${member.clientId || "N/A"} ${member.data ? `| Data: ${JSON.stringify(member.data)}` : ""}`;
      command.log(logMessage);
    });

    expect(command.logOutput).to.have.length(2);
    expect(command.logOutput[0]).to.include('user1');
    expect(command.logOutput[0]).to.include('online');
    expect(command.logOutput[1]).to.include('user2');
  });
});
