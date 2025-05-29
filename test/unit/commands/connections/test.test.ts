import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ConnectionsTest from "../../../../src/commands/connections/test.js";
import * as Ably from "ably";

// Create a testable version of ConnectionsTest
class TestableConnectionsTest extends ConnectionsTest {
  public logOutput: string[] = [];
  public consoleOutput: string[] = [];
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

  // Mock console.log to capture any direct console output
  public mockConsoleLog = (message?: any, ...optionalParams: any[]): void => {
    if (message !== undefined) {
      this.consoleOutput.push(message.toString());
    }
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

  // Public getter to access protected configManager for testing
  public getConfigManager() {
    return this.configManager;
  }

  // Override ensureAppAndKey to prevent real auth checks in unit tests
  protected override async ensureAppAndKey(_flags: any): Promise<{ apiKey: string; appId: string } | null> {
    this.debug('Skipping ensureAppAndKey in test mode');
    return { apiKey: 'dummy-key-value:secret', appId: 'dummy-app' };
  }
}

describe("ConnectionsTest", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableConnectionsTest;
  let mockConfig: Config;
  let originalConsoleLog: typeof console.log;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableConnectionsTest([], mockConfig);

    // Mock config manager to prevent "No API key found" errors
    sandbox.stub(command.getConfigManager(), 'getApiKey').resolves('dummy-key:secret');

    // Mock console.log to capture any direct console output
    originalConsoleLog = console.log;
    console.log = command.mockConsoleLog;

    // Set up a complete mock client structure
    const mockChannelInstance = {
      name: 'test-connection-channel',
      publish: sandbox.stub().resolves(),
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
        id: 'test-connection-id',
        key: 'test-connection-key'
      },
      close: sandbox.stub(),
    };

    // Set default parse result
    command.setParseResult({
      flags: { timeout: 30000, 'run-for': 10000 },
      args: {},
      argv: [],
      raw: []
    });
  });

  afterEach(function() {
    // Restore console.log
    console.log = originalConsoleLog;
    sandbox.restore();
  });

  it("should attempt to create an Ably client", async function() {
    const createClientStub = sandbox.stub(command, 'createAblyClient' as keyof TestableConnectionsTest)
      .resolves(command.mockClient as unknown as Ably.Realtime);

    // Mock connection state to simulate connected quickly
    command.mockClient.connection.once.callsFake((event: string, callback: () => void) => {
      if (event === 'connected') {
        setTimeout(() => {
          command.mockClient.connection.state = 'connected';
          callback();
        }, 10);
      }
    });

    // Create a controller to manage test timeout
    const controller = new AbortController();
    const testPromise = command.run();
    
    // Set a timeout to avoid hanging tests
    setTimeout(() => controller.abort(), 100);

    try {
      await Promise.race([
        testPromise,
        new Promise((_, reject) => 
          controller.signal.addEventListener('abort', () => reject(new Error('Test timeout')))
        )
      ]);
    } catch (error: any) {
      // Expected for timeout
      if (!error.message.includes('Test timeout')) {
        throw error;
      }
    }

    expect(createClientStub.calledOnce).to.be.true;
  });

  it("should test connection successfully", async function() {
    // Set up successful connection simulation
    command.mockClient.connection.once.callsFake((event: string, callback: () => void) => {
      if (event === 'connected') {
        setTimeout(() => {
          command.mockClient.connection.state = 'connected';
          command.mockClient.connection.id = 'test-connection-id';
          command.mockClient.connection.key = 'test-connection-key';
          callback();
        }, 10);
      }
    });

    // Use shorter run duration for test
    command.setParseResult({
      flags: { timeout: 30000, 'run-for': 100 },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    // Verify connection was established
    expect(command.mockClient.connection.once.calledWith('connected')).to.be.true;

    // Check that success was logged
    const output = command.logOutput.join('\n');
    expect(output).to.include('Connection test completed successfully');
  });

  it("should handle connection timeout", async function() {
    // Set very short timeout for test
    command.setParseResult({
      flags: { timeout: 50, 'run-for': 10000 },
      args: {},
      argv: [],
      raw: []
    });

    // Don't call the connection callback to simulate timeout
    command.mockClient.connection.once.callsFake(() => {
      // Do nothing - simulates connection never establishing
    });

    try {
      await command.run();
      expect.fail('Command should have thrown a timeout error');
    } catch (error: any) {
      expect(error.message).to.include('Connection test failed');
    }
  });

  it("should handle connection failures", async function() {
    // Simulate connection failure
    command.mockClient.connection.once.callsFake((event: string, callback: (stateChange: any) => void) => {
      if (event === 'connected') {
        // Don't call this callback
      } else if (event === 'failed') {
        setTimeout(() => {
          command.mockClient.connection.state = 'failed';
          callback({ 
            current: 'failed', 
            reason: { message: 'Connection failed due to network error' }
          });
        }, 10);
      }
    });

    try {
      await command.run();
      expect.fail('Command should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.include('Connection test failed');
    }
  });

  it("should handle disconnection during test", async function() {
    // Set up connection established then disconnected
    let connectionEstablished = false;
    
    command.mockClient.connection.once.callsFake((event: string, callback: (stateChange?: any) => void) => {
      if (event === 'connected') {
        setTimeout(() => {
          command.mockClient.connection.state = 'connected';
          connectionEstablished = true;
          callback();
        }, 10);
      } else if (event === 'disconnected') {
        setTimeout(() => {
          if (connectionEstablished) {
            command.mockClient.connection.state = 'disconnected';
            callback({ 
              current: 'disconnected', 
              reason: { message: 'Network connection lost' }
            });
          }
        }, 20);
      }
    });

    // Use short run duration
    command.setParseResult({
      flags: { timeout: 30000, 'run-for': 100 },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    // Should still complete successfully as connection was established
    const output = command.logOutput.join('\n');
    expect(output).to.include('Connection test completed successfully');
  });

  it("should output JSON when requested", async function() {
    command.setShouldOutputJson(true);
    command.setFormatJsonOutput((data) => JSON.stringify(data));

    // Set up successful connection
    command.mockClient.connection.once.callsFake((event: string, callback: () => void) => {
      if (event === 'connected') {
        setTimeout(() => {
          command.mockClient.connection.state = 'connected';
          command.mockClient.connection.id = 'test-connection-id';
          command.mockClient.connection.key = 'test-connection-key';
          callback();
        }, 10);
      }
    });

    // Use short run duration
    command.setParseResult({
      flags: { timeout: 30000, 'run-for': 100, json: true },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    // Find JSON output in logs
    const jsonOutput = command.logOutput.find(log => {
      try {
        const parsed = JSON.parse(log);
        return parsed.success === true;
      } catch {
        return false;
      }
    });
    expect(jsonOutput).to.exist;

    if (jsonOutput) {
      const parsedOutput = JSON.parse(jsonOutput);
      expect(parsedOutput).to.have.property('success', true);
      expect(parsedOutput).to.have.property('connectionId', 'test-connection-id');
      expect(parsedOutput).to.have.property('connectionKey', 'test-connection-key');
    }
  });

  it("should handle client creation failure", async function() {
    // Mock createAblyClient to return null
    sandbox.stub(command, 'createAblyClient' as keyof TestableConnectionsTest).resolves(null);

    // Should return early without error when client creation fails
    await command.run();

    // Verify that connection was never tested since client creation failed
    expect(command.mockClient.connection.once.called).to.be.false;
  });

  it("should test publish and subscribe during connection test", async function() {
    const testChannelName = `test-${Date.now()}`;
    const publishStub = command.mockClient.channels.get().publish;
    const subscribeStub = command.mockClient.channels.get().subscribe;

    // Set up successful connection
    command.mockClient.connection.once.callsFake((event: string, callback: () => void) => {
      if (event === 'connected') {
        setTimeout(() => {
          command.mockClient.connection.state = 'connected';
          callback();
        }, 10);
      }
    });

    // Use short run duration
    command.setParseResult({
      flags: { timeout: 30000, 'run-for': 100 },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    // Verify that a test channel was used
    expect(command.mockClient.channels.get.called).to.be.true;
    
    // Verify that messages were published and subscription was set up
    expect(publishStub.called).to.be.true;
    expect(subscribeStub.called).to.be.true;
  });
});