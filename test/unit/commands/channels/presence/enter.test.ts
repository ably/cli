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
            flags: { data: '{}', 'show-others': true },
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
  let logStub: sinon.SinonStub;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sandbox.stub() } as unknown as Config;
    command = new TestableChannelsPresenceEnter([], mockConfig);
    logStub = sandbox.stub(command, 'log');

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
      flags: { data: '{}', 'show-others': true },
      args: { channel: 'test-presence-channel' },
      raw: [],
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should attempt to create an Ably client", async function() {
    // Create mock client and presence/channel structure
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

    command.mockClient = {
      channels: {
        get: sinon.stub().returns(mockChannelInstance),
        release: sinon.stub(),
      },
      connection: {
        once: sinon.stub(),
        on: sinon.stub(),
        close: sinon.stub(),
        state: 'connected',
      },
      auth: {
        clientId: 'test-client-id',
      },
      close: sinon.stub(),
    };

    // Stub createAblyClient to return our mock
    const createClientStub = sinon.stub(command, 'createAblyClient' as keyof TestableChannelsPresenceEnter)
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

    // Verify createAblyClient was called
    expect(createClientStub.calledOnce).to.be.true;

    // Abort the command run to end the test
    controller.abort();
  });

  it("should enter presence with specified data", async function() {
    // Set up specific presence data
    command.setParseResult({
      flags: { data: '{"status":"online"}', 'show-others': false },
      args: { channel: 'test-presence-channel' },
      raw: [],
    });

    // Ensure necessary mocks are set up (using sandbox mocks from beforeEach)
    const enterStub = command.mockClient.channels.get().presence.enter;
    enterStub.resolves(); // Ensure enter resolves successfully
    command.mockClient.channels.get().attach.resolves();
    command.mockClient.connection.on.callsFake((event: string, handler: (stateChange: any) => void) => {
      if (event === 'connected' && typeof handler === 'function') {
        // Simulate async connection event
        setTimeout(() => handler({ current: 'connected' }), 0);
      }
    });

    // Run the command and wait for it to complete (setupCleanupHandler now resolves immediately)
    await command.run();

    // Verify presence.enter was called with correct data
    expect(enterStub.calledOnce).to.be.true;
    expect(enterStub.firstCall.args[0]).to.deep.equal({ status: 'online' });

    // Check logStub was called with confirmation
    expect(logStub.calledWith(sinon.match('Entered presence'))).to.be.true;
    expect(logStub.calledWith(sinon.match('test-presence-channel'))).to.be.true;
  });

  it("should show other presence members when requested", async function() {
    // Setup to show other presence members
    command.setParseResult({
      flags: { data: '{}', 'show-others': true },
      args: { channel: 'test-presence-channel' },
      raw: [],
    });

    // Mock presence members data
    const mockMembers = [
      { clientId: 'other-user', connectionId: 'conn1', data: { status: 'online' } },
      { clientId: 'test-client-id', connectionId: 'conn2', data: { status: 'away' } } // Same as our client ID
    ];

    // Ensure necessary mocks are set up (using sandbox mocks from beforeEach)
    const getStub = command.mockClient.channels.get().presence.get;
    const subscribeStub = command.mockClient.channels.get().presence.subscribe;
    const enterStub = command.mockClient.channels.get().presence.enter;
    const attachStub = command.mockClient.channels.get().attach;

    getStub.resolves(mockMembers); // Mock presence.get response
    enterStub.resolves();
    attachStub.resolves();
    command.mockClient.connection.on.callsFake((event: string, handler: (stateChange: any) => void) => {
      if (event === 'connected' && typeof handler === 'function') {
        setTimeout(() => handler({ current: 'connected' }), 0);
      }
    });

    // Run the command and wait for it to complete
    await command.run();

    // Verify presence.get was called
    expect(getStub.calledOnce).to.be.true;

    // Verify presence.subscribe was called for presence events
    expect(subscribeStub.called).to.be.true;

    // Check logStub was called with other members but not own client ID
    expect(logStub.calledWith(sinon.match('other-user'))).to.be.true;
    expect(logStub.calledWith(sinon.match('Listening for presence events'))).to.be.true;
    // Check it wasn't called with own ID in the member list log lines
    let calledWithOwnId = false;
    for (const call of logStub.getCalls()) {
      // Only check log lines starting with the member list prefix '- '
      if (typeof call.args[0] === 'string' && call.args[0].startsWith('- ') && call.args.some(arg => typeof arg === 'string' && arg.includes('test-client-id'))) {
            calledWithOwnId = true;
            break;
          }
    }
    expect(calledWithOwnId, "Member list log should not contain own client ID").to.be.false;
  });

  it("should handle invalid JSON data format", async function() {
    // Set invalid JSON data
    command.setParseResult({
      flags: { data: '{invalid-json}', 'show-others': false },
      args: { channel: 'test-presence-channel' },
      raw: [],
    });

    // Use the sandbox to stub the error method
    const errorStub = sandbox.stub(command, 'error' as keyof TestableChannelsPresenceEnter);
    // Simulate the behavior where the command *would* throw this error internally
    // We expect the test setup (invalid JSON flag) to cause command.run() to trigger this.
    errorStub.throws(new Error('Invalid JSON data format'));

    try {
      // The actual command logic should detect the invalid JSON and call this.error, which is stubbed to throw.
      await command.run();
      // If command.run() completes without throwing (because this.error wasn't called or didn't throw as expected), fail the test.
      expect.fail("Command should have thrown an error for invalid JSON");
    } catch (error: any) {
      // Assert that the error caught is the one thrown by our stub
      expect(error.message).to.include('Invalid JSON data format');
    }
    // No need for finally block with errorStub.restore() as sandbox handles it
  });

  it("should output JSON format when requested", async function() {
    const testChannelName = 'test-presence-channel-json';
    // Configure for JSON output
    command.setParseResult({
      flags: { data: '{"status":"online"}', 'show-others': false, json: true }, // Add json flag
      args: { channel: testChannelName },
      raw: [],
    });
    command.setShouldOutputJson(true);
    command.setFormatJsonOutput((data) => JSON.stringify(data)); // Use standard JSON stringify for test

    // Ensure necessary mocks resolve, AND that the channel mock has the correct name
    const channelGetStub = command.mockClient.channels.get;
    const mockChannel = channelGetStub(); // Get the default mock channel from beforeEach
    mockChannel.name = testChannelName; // Set the correct name specifically for this test
    channelGetStub.withArgs(testChannelName).returns(mockChannel); // Ensure get() called with this name returns our modified mock

    const enterStub = mockChannel.presence.enter;
    const attachStub = mockChannel.attach;
    enterStub.resolves();
    attachStub.resolves();

    // Simulate connection event
    command.mockClient.connection.on.callsFake((event: string, handler: (stateChange: any) => void) => {
      if (event === 'connected' && typeof handler === 'function') {
        setTimeout(() => handler({ current: 'connected' }), 0);
      }
    });

    // Run the command and wait for it to complete
    await command.run();

    // Verify log was called once with JSON output
    expect(logStub.calledOnce).to.be.true;
    let actualJsonOutput;
    try {
      actualJsonOutput = JSON.parse(logStub.firstCall.args[0]);
    } catch {
      expect.fail(`Output was not valid JSON: ${logStub.firstCall.args[0]}`);
    }

    // Define expected JSON structure (timestamp will vary)
    const expectedJsonStructure = {
      success: true,
      message: `Entered presence on channel ${testChannelName} as test-client-id`,
      channel: testChannelName,
      clientId: "test-client-id",
      data: { status: "online" },
    };

    // Verify JSON content (omitting timestamp)
    expect(actualJsonOutput).to.deep.include(expectedJsonStructure);
    expect(actualJsonOutput).to.have.property('timestamp').that.is.a('string');

    // Verify presence.enter was called
    expect(enterStub.called).to.be.true;
  });
});
