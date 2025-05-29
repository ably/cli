import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ConnectionsStats from "../../../../src/commands/connections/stats.js";
import * as Ably from "ably";

// Create a testable version of ConnectionsStats
class TestableConnectionsStats extends ConnectionsStats {
  public logOutput: string[] = [];
  public errorOutput: string = '';
  public consoleOutput: string[] = [];
  private _parseResult: any;
  public mockRestClient: any = null;
  private _shouldOutputJson = false;
  private _formatJsonOutputFn: ((data: Record<string, unknown>) => string) | null = null;

  // Override parse to simulate parse output
  public override async parse() {
    return this._parseResult;
  }

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  // Override client creation to return controlled mocks
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

  // Mock console.log to capture StatsDisplay output
  public mockConsoleLog = (message?: any, ...optionalParams: any[]): void => {
    if (message !== undefined) {
      this.consoleOutput.push(message.toString());
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
}

describe("ConnectionsStats", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableConnectionsStats;
  let mockConfig: Config;
  let mockStatsMethod: sinon.SinonStub;
  let originalConsoleLog: typeof console.log;

  // Mock stats data
  const mockStats = [
    {
      intervalId: Date.now().toString(),
      entries: {
        'connections.all.peak': 10,
        'connections.all.min': 5,
        'connections.all.mean': 7.5,
        'connections.all.opened': 15,
        'connections.all.refused': 2,
        'connections.all.count': 8,
        'channels.peak': 25,
        'channels.min': 10,
        'channels.mean': 18,
        'channels.opened': 30,
        'channels.refused': 1,
        'channels.count': 20,
        'messages.inbound.all.messages.count': 100,
        'messages.outbound.all.messages.count': 90,
        'messages.all.all.count': 190,
        'messages.all.all.data': 5000,
        'apiRequests.all.succeeded': 50,
        'apiRequests.all.failed': 3,
        'apiRequests.all.refused': 1,
        'apiRequests.tokenRequests.succeeded': 10,
        'apiRequests.tokenRequests.failed': 0,
        'apiRequests.tokenRequests.refused': 0
      }
    }
  ];

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableConnectionsStats([], mockConfig);

    // Create stubs for the stats method
    mockStatsMethod = sinon.stub().resolves({ items: mockStats });

    // Set up the mock REST client
    command.mockRestClient = {
      stats: mockStatsMethod,
      close: sinon.stub()
    };

    // Properly stub the configManager.getApiKey method
    sandbox.stub(command.getConfigManager(), 'getApiKey').resolves('dummy-key:secret');

    // Mock console.log to capture StatsDisplay output
    originalConsoleLog = console.log;
    console.log = command.mockConsoleLog;

    // Set default parse result for basic stats request
    command.setParseResult({
      flags: { 
        unit: 'minute', 
        limit: 10, 
        live: false, 
        debug: false,
        interval: 6
      },
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

  it("should retrieve and display connection stats successfully", async function() {
    await command.run();

    expect(mockStatsMethod.calledOnce).to.be.true;
    
    // Verify the stats method was called with correct parameters
    const callArgs = mockStatsMethod.firstCall.args[0];
    expect(callArgs).to.have.property('unit', 'minute');
    expect(callArgs).to.have.property('limit', 10);
    expect(callArgs).to.have.property('direction', 'backwards');

    // Check that stats were displayed via console.log (StatsDisplay output)
    const output = command.consoleOutput.join('\n');
    expect(output).to.include('Connections:');
    expect(output).to.include('Channels:');
    expect(output).to.include('Messages:');
  });

  it("should handle different time units", async function() {
    command.setParseResult({
      flags: { 
        unit: 'hour', 
        limit: 24, 
        live: false, 
        debug: false,
        interval: 6
      },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    expect(mockStatsMethod.calledOnce).to.be.true;
    
    const callArgs = mockStatsMethod.firstCall.args[0];
    expect(callArgs).to.have.property('unit', 'hour');
    expect(callArgs).to.have.property('limit', 24);
  });

  it("should handle custom time range with start and end", async function() {
    const startTime = 1618005600000;
    const endTime = 1618091999999;
    
    command.setParseResult({
      flags: { 
        unit: 'minute', 
        limit: 10, 
        start: startTime,
        end: endTime,
        live: false, 
        debug: false,
        interval: 6
      },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    expect(mockStatsMethod.calledOnce).to.be.true;
    
    const callArgs = mockStatsMethod.firstCall.args[0];
    expect(callArgs).to.have.property('start', startTime);
    expect(callArgs).to.have.property('end', endTime);
  });

  it("should handle empty stats response", async function() {
    mockStatsMethod.resolves({ items: [] });

    await command.run();

    expect(mockStatsMethod.calledOnce).to.be.true;
    
    // The "No connection stats available" message comes from this.log(), not console.log
    const output = command.logOutput.join('\n');
    expect(output).to.include('No connection stats available');
  });

  it("should handle API errors", async function() {
    const apiError = new Error("API request failed");
    mockStatsMethod.rejects(apiError);

    try {
      await command.run();
      expect.fail('Command should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.include('Failed to fetch stats');
    }
  });

  it("should output JSON when requested", async function() {
    command.setShouldOutputJson(true);

    await command.run();

    expect(mockStatsMethod.calledOnce).to.be.true;

    // Check for JSON output in the console logs (StatsDisplay uses console.log for JSON)
    const jsonOutput = command.consoleOutput.find(log => {
      try {
        const parsed = JSON.parse(log);
        return parsed.entries && typeof parsed.entries === 'object';
      } catch {
        return false;
      }
    });
    expect(jsonOutput).to.exist;
  });

  it("should handle live stats mode setup", async function() {
    command.setParseResult({
      flags: { 
        unit: 'minute', 
        limit: 1, 
        live: true, 
        debug: false,
        interval: 10
      },
      args: {},
      argv: [],
      raw: []
    });

    // Create a promise that resolves quickly to simulate the live mode setup
    let liveStatsPromise: Promise<void>;
    
    // Mock the process.on method to prevent hanging in test
    const originalProcessOn = process.on;
    const processOnStub = sinon.stub(process, 'on');
    
    try {
      // Start the command but don't wait for it to complete (since live mode runs indefinitely)
      liveStatsPromise = command.run();
      
      // Give it a moment to set up
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify that stats were called at least once for the initial display
      expect(mockStatsMethod.called).to.be.true;
      
      // Verify that process event listeners were set up for graceful shutdown
      expect(processOnStub.calledWith('SIGINT')).to.be.true;
      expect(processOnStub.calledWith('SIGTERM')).to.be.true;
      
    } finally {
      // Restore process.on
      processOnStub.restore();
      process.on = originalProcessOn;
      
      // The live stats promise will never resolve naturally, so we don't await it
    }
  });

  it("should handle debug mode in live stats", async function() {
    command.setParseResult({
      flags: { 
        unit: 'minute', 
        limit: 1, 
        live: true, 
        debug: true,
        interval: 6
      },
      args: {},
      argv: [],
      raw: []
    });

    // Mock the process.on method to prevent hanging in test
    const processOnStub = sinon.stub(process, 'on');
    
    try {
      // Start the command and give it a moment to set up
      const liveStatsPromise = command.run();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify debug mode was enabled
      expect(mockStatsMethod.called).to.be.true;
      
    } finally {
      processOnStub.restore();
    }
  });
});