import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import LogsConnectionLifecycleSubscribe from "../../../../../src/commands/logs/connection-lifecycle/subscribe.js";
import * as Ably from "ably";

// Create a testable version of LogsConnectionLifecycleSubscribe
class TestableLogsConnectionLifecycleSubscribe extends LogsConnectionLifecycleSubscribe {
  public logOutput: string[] = [];
  public errorOutput: string = '';
  private _parseResult: any;
  public mockClient: any = {};
  private _shouldOutputJson = false;
  private _formatJsonOutputFn: ((data: Record<string, unknown>) => string) | null = null;

  // Override parse to simulate parse output
  public override async parse() {
    return this._parseResult;
  }

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  // Override client creation to return a controlled mock
  public override async createAblyClient(_flags: any): Promise<Ably.Realtime | null> {
    this.debug('Overridden createAblyClient called');
    return this.mockClient as unknown as Ably.Realtime;
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

describe("LogsConnectionLifecycleSubscribe", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableLogsConnectionLifecycleSubscribe;
  let mockConfig: Config;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableLogsConnectionLifecycleSubscribe([], mockConfig);

    // Set up a complete mock client structure for the [meta]connection.lifecycle channel
    const mockChannelInstance = {
      name: '[meta]connection.lifecycle',
      subscribe: sandbox.stub(),
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

    // Set default parse result
    command.setParseResult({
      flags: { rewind: 0 },
      args: {},
      argv: [],
      raw: []
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should attempt to create an Ably client", async function() {
    const createClientStub = sandbox.stub(command, 'createAblyClient' as keyof TestableLogsConnectionLifecycleSubscribe)
      .resolves(command.mockClient as unknown as Ably.Realtime);

    // Mock connection to simulate quick connection
    command.mockClient.connection.on.callsFake((stateChange: any) => {
      if (typeof stateChange === 'function') {
        setTimeout(() => {
          stateChange({ current: 'connected' });
        }, 10);
      }
    });

    // Start the command but interrupt it quickly to avoid hanging
    const controller = new AbortController();
    const testPromise = command.run();
    
    setTimeout(() => controller.abort(), 100);

    try {
      await Promise.race([
        testPromise,
        new Promise((_, reject) => 
          controller.signal.addEventListener('abort', () => reject(new Error('Test timeout')))
        )
      ]);
    } catch (error: any) {
      // Expected timeout
      if (!error.message.includes('Test timeout')) {
        throw error;
      }
    }

    expect(createClientStub.calledOnce).to.be.true;
  });

  it("should subscribe to [meta]connection.lifecycle channel", async function() {
    const subscribeStub = command.mockClient.channels.get().subscribe;

    // Mock connection state changes
    command.mockClient.connection.on.callsFake((callback: any) => {
      if (typeof callback === 'function') {
        setTimeout(() => {
          callback({ current: 'connected' });
        }, 10);
      }
    });

    // Start the command but interrupt it quickly
    const controller = new AbortController();
    const testPromise = command.run();
    
    setTimeout(() => controller.abort(), 100);

    try {
      await Promise.race([
        testPromise,
        new Promise((_, reject) => 
          controller.signal.addEventListener('abort', () => reject(new Error('Test timeout')))
        )
      ]);
    } catch (error: any) {
      // Expected timeout
    }

    // Verify that we got the [meta]connection.lifecycle channel and subscribed to it
    expect(command.mockClient.channels.get.calledWith('[meta]connection.lifecycle')).to.be.true;
    expect(subscribeStub.called).to.be.true;
  });

  it("should handle rewind parameter", async function() {
    command.setParseResult({
      flags: { rewind: 10 },
      args: {},
      argv: [],
      raw: []
    });

    // Mock connection
    command.mockClient.connection.on.callsFake((callback: any) => {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ current: 'connected' }), 10);
      }
    });

    // Start and quickly abort
    const controller = new AbortController();
    const testPromise = command.run();
    
    setTimeout(() => controller.abort(), 100);

    try {
      await Promise.race([
        testPromise,
        new Promise((_, reject) => 
          controller.signal.addEventListener('abort', () => reject(new Error('Test timeout')))
        )
      ]);
    } catch (error: any) {
      // Expected timeout
    }

    // Verify channel was created with rewind parameter
    expect(command.mockClient.channels.get.calledWith('[meta]connection.lifecycle', {
      params: { rewind: '10' }
    })).to.be.true;
  });

  it("should handle connection state changes", async function() {
    const connectionOnStub = command.mockClient.connection.on;
    const channelOnStub = command.mockClient.channels.get().on;

    // Start and quickly abort
    const controller = new AbortController();
    const testPromise = command.run();
    
    setTimeout(() => controller.abort(), 50);

    try {
      await Promise.race([
        testPromise,
        new Promise((_, reject) => 
          controller.signal.addEventListener('abort', () => reject(new Error('Test timeout')))
        )
      ]);
    } catch (error: any) {
      // Expected timeout
    }

    // Verify that connection state change handlers were set up
    expect(connectionOnStub.called).to.be.true;
    // Verify that channel state change handlers were set up  
    expect(channelOnStub.called).to.be.true;
  });

  it("should handle log message reception for connection lifecycle events", async function() {
    const subscribeStub = command.mockClient.channels.get().subscribe;

    // Mock connection
    command.mockClient.connection.on.callsFake((callback: any) => {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ current: 'connected' }), 10);
      }
    });

    // Start and quickly abort
    const controller = new AbortController();
    const testPromise = command.run();
    
    setTimeout(() => controller.abort(), 100);

    try {
      await Promise.race([
        testPromise,
        new Promise((_, reject) => 
          controller.signal.addEventListener('abort', () => reject(new Error('Test timeout')))
        )
      ]);
    } catch (error: any) {
      // Expected timeout
    }

    // Verify subscribe was called
    expect(subscribeStub.called).to.be.true;

    // Simulate receiving a connection lifecycle log message
    const messageCallback = subscribeStub.firstCall.args[0];
    if (typeof messageCallback === 'function') {
      const mockMessage = {
        name: 'connection.opened',
        data: { 
          connectionId: 'test-connection-123',
          transport: 'websocket',
          ipAddress: '192.168.1.1'
        },
        timestamp: Date.now(),
        clientId: 'test-client',
        connectionId: 'test-connection-123',
        id: 'msg-123'
      };

      messageCallback(mockMessage);

      // Check that the message was logged
      const output = command.logOutput.join('\n');
      expect(output).to.include('connection.opened');
    }
  });

  it("should color-code different connection lifecycle events", async function() {
    const subscribeStub = command.mockClient.channels.get().subscribe;

    // Mock connection
    command.mockClient.connection.on.callsFake((callback: any) => {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ current: 'connected' }), 10);
      }
    });

    // Start and quickly abort
    const controller = new AbortController();
    const testPromise = command.run();
    
    setTimeout(() => controller.abort(), 100);

    try {
      await Promise.race([
        testPromise,
        new Promise((_, reject) => 
          controller.signal.addEventListener('abort', () => reject(new Error('Test timeout')))
        )
      ]);
    } catch (error: any) {
      // Expected timeout
    }

    // Test different event types
    const messageCallback = subscribeStub.firstCall.args[0];
    if (typeof messageCallback === 'function') {
      // Test connection opened (should be green)
      messageCallback({
        name: 'connection.opened',
        data: {},
        timestamp: Date.now(),
        id: 'msg-1'
      });

      // Test connection closed (should be yellow)  
      messageCallback({
        name: 'connection.closed',
        data: {},
        timestamp: Date.now(),
        id: 'msg-2'
      });

      // Test failed event (should be red)
      messageCallback({
        name: 'connection.failed',
        data: {},
        timestamp: Date.now(),
        id: 'msg-3'
      });

      // Check that different event types were logged
      const output = command.logOutput.join('\n');
      expect(output).to.include('connection.opened');
      expect(output).to.include('connection.closed');
      expect(output).to.include('connection.failed');
    }
  });

  it("should output JSON when requested", async function() {
    command.setShouldOutputJson(true);
    command.setFormatJsonOutput((data) => JSON.stringify(data));

    const subscribeStub = command.mockClient.channels.get().subscribe;

    // Mock connection
    command.mockClient.connection.on.callsFake((callback: any) => {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ current: 'connected' }), 10);
      }
    });

    // Start and quickly abort
    const controller = new AbortController();
    const testPromise = command.run();
    
    setTimeout(() => controller.abort(), 100);

    try {
      await Promise.race([
        testPromise,
        new Promise((_, reject) => 
          controller.signal.addEventListener('abort', () => reject(new Error('Test timeout')))
        )
      ]);
    } catch (error: any) {
      // Expected timeout
    }

    // Simulate receiving a message in JSON mode
    const messageCallback = subscribeStub.firstCall.args[0];
    if (typeof messageCallback === 'function') {
      const mockMessage = {
        name: 'connection.opened',
        data: { connectionId: 'test-connection-123' },
        timestamp: Date.now(),
        clientId: 'test-client',
        connectionId: 'test-connection-123',
        id: 'msg-123'
      };

      messageCallback(mockMessage);

      // Check for JSON output
      const jsonOutput = command.logOutput.find(log => {
        try {
          const parsed = JSON.parse(log);
          return parsed.success === true && parsed.event === 'connection.opened';
        } catch {
          return false;
        }
      });
      expect(jsonOutput).to.exist;
    }
  });

  it("should handle channel state changes", async function() {
    const channelOnStub = command.mockClient.channels.get().on;

    // Mock connection
    command.mockClient.connection.on.callsFake((callback: any) => {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ current: 'connected' }), 10);
      }
    });

    // Start and quickly abort
    const controller = new AbortController();
    const testPromise = command.run();
    
    setTimeout(() => controller.abort(), 100);

    try {
      await Promise.race([
        testPromise,
        new Promise((_, reject) => 
          controller.signal.addEventListener('abort', () => reject(new Error('Test timeout')))
        )
      ]);
    } catch (error: any) {
      // Expected timeout
    }

    // Verify that channel state change handlers were set up
    expect(channelOnStub.called).to.be.true;

    // Simulate channel state change
    const channelStateCallback = channelOnStub.firstCall.args[0];
    if (typeof channelStateCallback === 'function') {
      channelStateCallback({
        current: 'attached',
        reason: null
      });

      // Check that channel state change was logged
      const output = command.logOutput.join('\n');
      expect(output).to.include('attached');
    }
  });

  it("should handle client creation failure", async function() {
    // Mock createAblyClient to return null
    sandbox.stub(command, 'createAblyClient' as keyof TestableLogsConnectionLifecycleSubscribe).resolves(null);

    // Should return early without error when client creation fails
    await command.run();

    // Verify that subscribe was never called since client creation failed
    expect(command.mockClient.channels.get().subscribe.called).to.be.false;
  });
});