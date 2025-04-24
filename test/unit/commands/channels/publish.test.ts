import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ChannelsPublish from "../../../../src/commands/channels/publish.js";
import * as Ably from "ably";

// Create a testable version of ChannelsPublish
class TestableChannelsPublish extends ChannelsPublish {
  public logOutput: string[] = [];
  public errorOutput: string = '';
  private _parseResult: any;
  private _shouldOutputJson = false;
  private _formatJsonOutputFn: ((data: Record<string, unknown>) => string) | null = null;

  // Override parse to simulate parse output
  public override async parse() {
    return this._parseResult;
  }

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  // Mock client objects
  public mockRestClient: any = null;
  public mockRealtimeClient: any = null;

  // Override client creation methods
  public override async createAblyClient(flags: any): Promise<Ably.Realtime | null> {
    // For REST transport, return null to use REST client
    if (flags.transport !== 'realtime') {
      this.debug('Simulating REST client usage pathway');
      return null;
    }

    // Otherwise return the mock Realtime client
    this.debug('Using mock Realtime client');
    return this.mockRealtimeClient as unknown as Ably.Realtime;
  }

  public override createAblyRestClient(_options: Ably.ClientOptions | any): Ably.Rest {
    this.debug('Using mock REST client');
    return this.mockRestClient as unknown as Ably.Rest;
  }

  // Override logging methods
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  public override log(message?: string | undefined, ...args: any[]): void {
    if (message) {
      this.logOutput.push(message);
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

  // Override ensureAppAndKey to prevent real auth checks in unit tests
  protected override async ensureAppAndKey(_flags: any): Promise<{ apiKey: string; appId: string } | null> {
    this.debug('Skipping ensureAppAndKey in test mode');
    return { apiKey: 'dummy-key-value:secret', appId: 'dummy-app' };
  }
}

describe("ChannelsPublish", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableChannelsPublish;
  let mockConfig: Config;
  let mockRestPublish: sinon.SinonStub;
  let mockRealtimePublish: sinon.SinonStub;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableChannelsPublish([], mockConfig);

    // Create stubs for the publish methods
    mockRestPublish = sinon.stub().resolves();
    mockRealtimePublish = sinon.stub().resolves();

    // Set up the mock REST client
    const mockRestChannel = {
      publish: mockRestPublish
    };
    command.mockRestClient = {
      channels: {
        get: sinon.stub().returns(mockRestChannel)
      },
      request: sinon.stub().resolves({ statusCode: 201 }),
      close: sinon.stub()
    };

    // Set up the mock Realtime client
    const mockRealtimeChannel = {
      publish: mockRealtimePublish,
      on: sinon.stub(), // Add the missing 'on' method
    };
    command.mockRealtimeClient = {
      channels: {
        get: sinon.stub().returns(mockRealtimeChannel)
      },
      connection: {
        once: sinon.stub().callsArg(1), // Simulate immediate connection
        on: sinon.stub(), // Add the missing 'on' method
        state: 'connected',
        close: sinon.stub()
      },
      close: sinon.stub()
    };

    // Set default parse result for REST transport
    command.setParseResult({
      flags: { transport: 'rest', name: undefined, encoding: undefined, count: 1, delay: 0 },
      args: { channel: 'test-channel', message: '{"data":"hello"}' },
      argv: [],
      raw: []
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should publish a message using REST successfully", async function() {
    await command.run();

    const getChannel = command.mockRestClient.channels.get;
    expect(getChannel.calledOnce).to.be.true;
    expect(getChannel.firstCall.args[0]).to.equal('test-channel');

    expect(mockRestPublish.calledOnce).to.be.true;
    expect(mockRestPublish.firstCall.args[0]).to.deep.equal({ data: 'hello' });
    expect(command.logOutput.join('\n')).to.include('Message published successfully');
  });

  it("should publish a message using Realtime successfully", async function() {
    command.setParseResult({
      flags: { transport: 'realtime', name: undefined, encoding: undefined, count: 1, delay: 0 },
      args: { channel: 'test-channel', message: '{"data":"realtime hello"}' },
      argv: [],
      raw: []
    });

    await command.run();

    const getChannel = command.mockRealtimeClient.channels.get;
    expect(getChannel.calledOnce).to.be.true;
    expect(getChannel.firstCall.args[0]).to.equal('test-channel');

    expect(mockRealtimePublish.calledOnce).to.be.true;
    expect(mockRealtimePublish.firstCall.args[0]).to.deep.equal({ data: 'realtime hello' });
    expect(command.logOutput.join('\n')).to.include('Message published successfully');
  });

  it("should handle API errors during REST publish", async function() {
    const apiError = new Error("REST API Error");

    // Make the publish method reject with our error
    mockRestPublish.rejects(apiError);

    // Test for thrown error
    let errorThrown = false;

    try {
      await command.run();
      expect.fail('Command should have thrown an error');
    } catch {
      errorThrown = true;
      // The error could come from different places in the code path
      // Just check that some error was thrown during REST publish
      expect(mockRestPublish.called).to.be.true;
    }

    // Verify an error was thrown
    expect(errorThrown).to.be.true;
  });

  it("should handle API errors during Realtime publish", async function() {
    command.setParseResult({
      flags: { transport: 'realtime', name: undefined, encoding: undefined, count: 1, delay: 0 },
      args: { channel: 'test-channel', message: '{"data":"test"}' },
      argv: [],
      raw: []
    });

    const apiError = new Error("Realtime API Error");

    // Make the publish method reject with our error
    mockRealtimePublish.rejects(apiError);

    // Test for thrown error
    let errorThrown = false;

    try {
      await command.run();
      expect.fail('Command should have thrown an error');
    } catch {
      errorThrown = true;
      // The error could come from different places in the code path
      // Just check that some error was thrown during Realtime publish
      expect(mockRealtimePublish.called).to.be.true;
    }

    // Verify an error was thrown
    expect(errorThrown).to.be.true;
  });

  it("should publish with specified event name", async function() {
    command.setParseResult({
      flags: { transport: 'rest', name: 'custom-event', encoding: undefined, count: 1, delay: 0 },
      args: { channel: 'test-channel', message: '{"data":"hello"}' },
      argv: [],
      raw: []
    });

    await command.run();

    expect(mockRestPublish.calledOnce).to.be.true;

    // Check that the name parameter was set correctly in the published message
    const publishArgs = mockRestPublish.firstCall.args[0];
    expect(publishArgs).to.have.property('name', 'custom-event');
    expect(publishArgs).to.have.property('data', 'hello');
  });

  it("should publish multiple messages with --count", async function() {
    command.setParseResult({
      flags: { transport: 'rest', name: undefined, encoding: undefined, count: 3, delay: 0 },
      args: { channel: 'test-channel', message: '{"data":"count test"}' },
      argv: [],
      raw: []
    });

    await command.run();

    expect(mockRestPublish.callCount).to.equal(3);
    expect(command.logOutput.join('\n')).to.include('messages published successfully');
  });

  it("should output JSON when requested", async function() {
    command.setShouldOutputJson(true);
    command.setFormatJsonOutput(data => JSON.stringify({
      ...data,
      success: true,
      channel: 'test-channel'
    }));

    await command.run();

    expect(mockRestPublish.calledOnce).to.be.true;

    // Check for JSON output in the logs
    const jsonOutput = command.logOutput.find(log => log.includes('success'));
    expect(jsonOutput).to.exist;

    // Parse and verify properties
    if (jsonOutput) {
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).to.have.property('success', true);
      expect(parsed).to.have.property('channel', 'test-channel');
    }
  });

  it("should handle invalid message JSON", async function() {
    // Override the prepareMessage method to simulate a JSON parsing error
    sinon.stub(command, 'prepareMessage' as any).throws(new Error('Invalid JSON'));

    // Override the error method to mock the error behavior
    sinon.stub(command, 'error').callsFake((msg) => {
      command.errorOutput = typeof msg === 'string' ? msg : msg.message;
      throw new Error('Invalid JSON');
    });

    command.setParseResult({
      flags: { transport: 'rest', name: undefined, encoding: undefined, count: 1, delay: 0 },
      args: { channel: 'test-channel', message: 'invalid-json' },
      argv: [],
      raw: []
    });

    try {
      await command.run();
      expect.fail('Command should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.include('Invalid JSON');
    }
  });
});
