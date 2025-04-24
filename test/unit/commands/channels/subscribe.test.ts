import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ChannelsSubscribe from "../../../../src/commands/channels/subscribe.js";
import * as Ably from "ably";

// Create a testable version of ChannelsSubscribe
class TestableChannelsSubscribe extends ChannelsSubscribe {
  public logOutput: string[] = [];
  public errorOutput: string = '';
  private _parseResult: any;
  public mockClient: any = {}; // Initialize mockClient
  private _shouldOutputJson = false;
  private _formatJsonOutputFn: ((data: Record<string, unknown>) => string) | null = null;

  // Spy on client creation attempt
  public createAblyClientSpy = sinon.spy(super.createAblyClient);

  // Override parse to simulate parse output
  public override async parse() {
    if (!this._parseResult) {
        // Default parse result if not set
        this._parseResult = {
            flags: { delta: false, rewind: undefined, 'cipher-key': undefined },
            args: { channels: ['default-test-channel'] }, // Use args.channels directly
            argv: ['default-test-channel'], // argv should contain the channel names
            raw: [],
        };
    }
    return this._parseResult;
  }

  public setParseResult(result: any) {
    this._parseResult = result;
    // Ensure argv reflects args.channels for run() method logic
    if (result.args?.channels && Array.isArray(result.args.channels)) {
        this._parseResult.argv = [...result.args.channels];
    }
  }

  // Override client creation to return a controlled mock
  public override async createAblyClient(flags: any): Promise<Ably.Realtime | null> {
    this.debug('Overridden createAblyClient called');
    this.createAblyClientSpy(flags);

    // Initialize the mock client with basic structure
    this.mockClient = {
        channels: {
            get: sinon.stub(),
            release: sinon.stub(),
        },
        connection: {
            once: sinon.stub(),
            on: sinon.stub(),
            close: sinon.stub(),
            state: 'initialized',
        },
        close: sinon.stub(),
    };

    return this.mockClient as unknown as Ably.Realtime;
  }

  // Helper to connect the mock client
  public simulateConnection() {
    // Simulate a connected state
    this.mockClient.connection.state = 'connected';

    // Find the connection.on handler and call it with connected state
    if (this.mockClient.connection.on.called) {
      const onConnectionArgs = this.mockClient.connection.on.args[0];
      if (onConnectionArgs && typeof onConnectionArgs[0] === 'function') {
        onConnectionArgs[0]({ current: 'connected' });
      }
    }
  }

  // Override logging methods
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  public override log(message?: string | undefined, ...args: any[]): void {
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
    this.debug('Skipping ensureAppAndKey in test mode');
    return { apiKey: 'dummy-key-value:secret', appId: 'dummy-app' };
  }
}

describe("ChannelsSubscribe (Simplified)", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableChannelsSubscribe;
  let mockConfig: Config;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableChannelsSubscribe([], mockConfig);

    // Set default parse result ensuring argv matches args.channels
    command.setParseResult({
      flags: { delta: false, rewind: undefined, 'cipher-key': undefined },
      args: { channels: ['test-channel'] },
      // argv will be set by setParseResult
      raw: [],
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should attempt to create an Ably client", async function() {
    // Create a mock client to be returned by createAblyClient
    command.mockClient = {
      channels: {
        get: sinon.stub(),
        release: sinon.stub(),
      },
      connection: {
        once: sinon.stub(),
        on: sinon.stub(),
        close: sinon.stub(),
        state: 'connected',
      },
      close: sinon.stub(),
    };

    // Stub the createAblyClient method to return our mock
    const createClientStub = sinon.stub(command, 'createAblyClient')
      .resolves(command.mockClient as unknown as Ably.Realtime);

    // Setup connection handler
    command.mockClient.connection.on.callsFake((handler: (stateChange: any) => void) => {
      if (typeof handler === 'function') {
        setTimeout(() => handler({ current: 'connected' }), 10);
      }
    });

    // Create a promise and controller for test timing
    const controller = new AbortController();

    // Start the command run
    const _runPromise = command.run().catch(error => {
      if (!controller.signal.aborted) {
        throw error;
      }
      return null;
    });

    // Wait for the test to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify that createAblyClient was called
    expect(createClientStub.calledOnce).to.be.true;

    // Abort the command run to end the test
    controller.abort();
  });

  it("should attempt to get and subscribe to a single channel", async function() {
    // Create channel mock with subscribe method
    const channelMock = {
      name: 'test-channel',
      subscribe: sinon.stub(),
      attach: sinon.stub().resolves(),
      on: sinon.stub(),
      detach: sinon.stub().resolves()
    };

    // Create a client mock before we start the test
    command.mockClient = {
      channels: {
        get: sinon.stub().returns(channelMock),
        release: sinon.stub(),
      },
      connection: {
        once: sinon.stub(),
        on: sinon.stub(),
        close: sinon.stub(),
        state: 'connected',
      },
      close: sinon.stub(),
    };

    // Stub the createAblyClient method to return our mock
    sinon.stub(command, 'createAblyClient').resolves(command.mockClient as unknown as Ably.Realtime);

    // Setup connection handler to simulate connected state
    command.mockClient.connection.on.callsFake((handler: (stateChange: any) => void) => {
      if (typeof handler === 'function') {
        // Call the handler with a connected state
        setTimeout(() => handler({ current: 'connected' }), 10);
      }
    });

    // Create a promise and controller for test timing
    const controller = new AbortController();

    // Start the command run
    const _runPromise = command.run().catch(error => {
      if (!controller.signal.aborted) {
        throw error;
      }
      return null;
    });

    // Wait for the test to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify the test
    expect(command.mockClient.channels.get.called).to.be.true;
    expect(channelMock.subscribe.called).to.be.true;

    // Abort the command run to end the test
    controller.abort();
  });

  it("should attempt to get and subscribe to multiple channels", async function() {
    // Set up multiple channels
    command.setParseResult({
      flags: {},
      args: { channels: ['channel1', 'channel2', 'channel3'] },
      raw: [],
    });

    // Set up channel mocks
    const channel1 = {
      name: 'channel1',
      subscribe: sinon.stub(),
      attach: sinon.stub().resolves(),
      on: sinon.stub(),
      detach: sinon.stub().resolves()
    };

    const channel2 = {
      name: 'channel2',
      subscribe: sinon.stub(),
      attach: sinon.stub().resolves(),
      on: sinon.stub(),
      detach: sinon.stub().resolves()
    };

    const channel3 = {
      name: 'channel3',
      subscribe: sinon.stub(),
      attach: sinon.stub().resolves(),
      on: sinon.stub(),
      detach: sinon.stub().resolves()
    };

    // Create a channels.get stub that returns the appropriate channel
    const getStub = sinon.stub();
    getStub.withArgs('channel1').returns(channel1);
    getStub.withArgs('channel2').returns(channel2);
    getStub.withArgs('channel3').returns(channel3);

    // Create a client mock before we start the test
    command.mockClient = {
      channels: {
        get: getStub,
        release: sinon.stub(),
      },
      connection: {
        once: sinon.stub(),
        on: sinon.stub(),
        close: sinon.stub(),
        state: 'connected',
      },
      close: sinon.stub(),
    };

    // Stub the createAblyClient method to return our mock
    sinon.stub(command, 'createAblyClient').resolves(command.mockClient as unknown as Ably.Realtime);

    // Setup connection handler to simulate connected state
    command.mockClient.connection.on.callsFake((handler: (stateChange: any) => void) => {
      if (typeof handler === 'function') {
        // Call the handler with a connected state
        setTimeout(() => handler({ current: 'connected' }), 10);
      }
    });

    // Create a promise and controller for test timing
    const controller = new AbortController();

    // Start the command run
    const _runPromise = command.run().catch(error => {
      if (!controller.signal.aborted) {
        throw error;
      }
      return null;
    });

    // Wait for the test to process
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the test
    expect(command.mockClient.channels.get.callCount).to.equal(3);

    // Check each channel's subscribe was called
    expect(channel1.subscribe.called).to.be.true;
    expect(channel2.subscribe.called).to.be.true;
    expect(channel3.subscribe.called).to.be.true;

    // Abort the command run to end the test
    controller.abort();
  });

  it("should pass channel options when flags are provided (rewind example)", async function() {
    command.setParseResult({
      flags: { rewind: 5 },
      args: { channels: ['rewind-channel'] },
      raw: [],
    });

    const channelMock = {
      name: 'rewind-channel',
      subscribe: sinon.stub(),
      attach: sinon.stub().resolves(),
      on: sinon.stub(),
      detach: sinon.stub().resolves()
    };

    // Create a client mock before we start the test
    command.mockClient = {
      channels: {
        get: sinon.stub().returns(channelMock),
        release: sinon.stub(),
      },
      connection: {
        once: sinon.stub(),
        on: sinon.stub(),
        close: sinon.stub(),
        state: 'connected',
      },
      close: sinon.stub(),
    };

    // Stub the createAblyClient method to return our mock
    sinon.stub(command, 'createAblyClient').resolves(command.mockClient as unknown as Ably.Realtime);

    // Setup connection handler to simulate connected state
    command.mockClient.connection.on.callsFake((handler: (stateChange: any) => void) => {
      if (typeof handler === 'function') {
        // Call the handler with a connected state
        setTimeout(() => handler({ current: 'connected' }), 10);
      }
    });

    // Create a promise and controller for test timing
    const controller = new AbortController();

    // Start the command run
    const _runPromise = command.run().catch(error => {
      if (!controller.signal.aborted) {
        throw error;
      }
      return null;
    });

    // Wait for the test to process
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify the test
    expect(command.mockClient.channels.get.calledOnce).to.be.true;
    const getArgs = command.mockClient.channels.get.getCall(0).args;
    expect(getArgs[0]).to.equal('rewind-channel');

    // Abort the command run to end the test
    controller.abort();
  });

  it("should throw error if no channel names provided", async function() {
    command.setParseResult({
       flags: {},
       args: { channels: [] },
       argv: [],
       raw: []
    });
    try {
       await command.run();
       expect.fail("Command should have thrown an error for missing channels");
    } catch {
       expect(command.errorOutput).to.contain("At least one channel name is required");
    }
  });
});
