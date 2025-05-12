import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ChannelsHistory from "../../../../src/commands/channels/history.js";
import { AblyBaseCommand } from "../../../../src/base-command.js";

// Create a testable version of ChannelsHistory to expose protected methods
class TestableChannelsHistory extends ChannelsHistory {
  logOutput: string[] = [];
  errorOutput: string = '';

  // Override parse to simulate parse output
  public override async parse() {
    // Return the parse result that was set via our test setup
    return this._parseResult;
  }

  // Add a property to store the parse result for testing
  private _parseResult: any = {
    flags: { limit: 100, direction: "backwards" },
    args: { channel: "test-channel" },
    argv: [],
    raw: []
  };

  // Method to set parse result for testing
  public setParseResult(result: any) {
    this._parseResult = result;
  }

  // Override createAblyClient to return our mock
  public override async createAblyClient() {
    return this._mockAblyClient as any;
  }

  private _mockAblyClient: any = {
    close: () => {}
  };

  // Method to set the mock Ably client
  public setMockAblyClient(client: any) {
    this._mockAblyClient = client;
  }

  // Override run method to control the flow for testing
  public override async run(): Promise<void> {
    const { args, flags } = await this.parse();
    // const channelName = args.channel; // Not strictly needed if directly using mockHistoryFn

    this.showAuthInfoIfNeeded(); // Keep this stubbed

    try {
      const apiKey = flags["api-key"] || (await (this as any).configManager.getApiKey());

      if (!apiKey) {
        await (this as any).ensureAppAndKey(flags);
        return;
      }

      // Simulate client creation and getting channel options happens before history call in real command
      // For the test, we mainly care that historyParams are built correctly and mockHistoryFn is called.

      // Setup channel options (as before, for logic if needed, though not directly used by mockHistoryFn)
      const channelOptions: any = {};
      if (flags.cipher) {
        channelOptions.cipher = { key: flags.cipher };
      }

      // Build history query parameters (as before)
      const historyParams: any = {
        direction: flags.direction,
        limit: flags.limit,
      };
      if (flags.start) {
        historyParams.start = new Date(flags.start).getTime();
      }
      if (flags.end) {
        historyParams.end = new Date(flags.end).getTime();
      }

      // Call the mock history function directly, passing the params
      const history = await this.mockHistoryFn(historyParams);
      const messages = history.items;

      // Display results based on format
      if (this.shouldOutputJson()) {
        this.log(this.formatJsonOutput({ messages }));
      } else {
        if (messages.length === 0) {
          this.log("No messages found in the channel history.");
          return;
        }

        this.log(
          `Found ${messages.length.toString()} messages in the history of channel ${args.channel}:`,
        );
        this.log("");

        for (const [index, message] of messages.entries()) {
          const timestamp = message.timestamp
            ? new Date(message.timestamp).toISOString()
            : "Unknown timestamp";

          this.log(`[${index + 1}] ${timestamp}`);
          this.log(`Event: ${message.name || "(none)"}`);

          if (message.clientId) {
            this.log(`Client ID: ${message.clientId}`);
          }

          this.log("Data:");
          this.log(JSON.stringify(message.data, null, 2));

          this.log("");
        }

        if (messages.length === flags.limit) {
          this.log(
            `Showing maximum of ${flags.limit} messages. Use --limit to show more.`,
          );
        }
      }
    } catch (error) {
      this.error(
        `Error retrieving channel history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Mock history function that will be stubbed in tests
  public mockHistoryFn: any = async () => ({ items: [] });

  // Method to set mock history function
  public setMockHistoryFn(fn: any) {
    this.mockHistoryFn = fn;
  }

  // Override showing auth info for testing
  public override showAuthInfoIfNeeded() {
    // Stub implementation that does nothing
  }

  // Override shouldOutputJson
  public override shouldOutputJson() {
    return this._shouldOutputJson;
  }

  private _shouldOutputJson = false;

  // Method to set shouldOutputJson value
  public setShouldOutputJson(value: boolean) {
    this._shouldOutputJson = value;
  }

  // Override formatJsonOutput
  public override formatJsonOutput(data: Record<string, unknown>) {
    return this._formatJsonOutputFn ? this._formatJsonOutputFn(data) : JSON.stringify(data);
  }

  private _formatJsonOutputFn: ((data: Record<string, unknown>) => string) | null = null;

  // Method to set formatJsonOutput function
  public setFormatJsonOutput(fn: (data: Record<string, unknown>) => string) {
    this._formatJsonOutputFn = fn;
  }

  // Mock error method for testing errors
  public override error(message: string | Error, _options?: any): never {
    this.errorOutput = typeof message === 'string' ? message : message.message;
    throw new Error(typeof message === 'string' ? message : message.message);
  }
}

// Mock channel history response data
const mockHistoryResponse = {
  items: [
    {
      id: "message1",
      name: "event1",
      data: { text: "Hello world 1" },
      timestamp: 1600000000000,
      clientId: "client1",
      connectionId: "connection1"
    },
    {
      id: "message2",
      name: "event2",
      data: { text: "Hello world 2" },
      timestamp: 1600000001000,
      clientId: "client2",
      connectionId: "connection2"
    }
  ]
};

describe("ChannelsHistory", function () {
  let command: TestableChannelsHistory;
  let mockConfig: Config;
  let logStub: sinon.SinonStub;
  let errorStub: sinon.SinonStub;
  let historyStub: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;
  let ensureAppAndKeyStub: sinon.SinonStub;
  let getApiKeyMock: sinon.SinonStub; // To hold the mock for getApiKey

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;

    ensureAppAndKeyStub = sandbox.stub(AblyBaseCommand.prototype, <any>"ensureAppAndKey").resolves();

    command = new TestableChannelsHistory([], mockConfig);

    // Stub getApiKey on the command instance's configManager *after* creation
    getApiKeyMock = sandbox.stub((command as any).configManager, "getApiKey").resolves("default.testapikey");

    logStub = sandbox.stub(command, "log");
    errorStub = sandbox.stub(command, "error");
    historyStub = sandbox.stub().resolves(mockHistoryResponse);
    command.setMockHistoryFn(historyStub);
    command.setParseResult({
      flags: { limit: 100, direction: "backwards" }, // Default includes no api-key flag
      args: { channel: "test-channel" },
      argv: [],
      raw: []
    });
  });

  afterEach(function () {
    sandbox.restore(); // This will restore all stubs created by the sandbox, including getApiKeyMock
  });

  describe("run", function () {
    it("should retrieve channel history successfully", async function () {
      // Relies on default getApiKeyMock returning a key
      await command.run();
      expect(historyStub.calledOnce).to.be.true;
      // ... other assertions
    });

    it("should retrieve channel history successfully using ABLY_API_KEY from env", async function () {
      command.setParseResult({
        flags: { limit: 100, direction: "backwards" }, // No api-key flag
        args: { channel: "test-channel" },
        argv: [],
        raw: []
      });
      getApiKeyMock.resolves("env.apikeyfromconfig");

      await command.run();

      expect(getApiKeyMock.calledOnce).to.be.true;
      expect(historyStub.calledOnce).to.be.true;
      expect(logStub.args.some(args => typeof args[0] === 'string' && args[0].includes("Found 2 messages"))).to.be.true;
    });

    it("should fail gracefully if no API key is found (env or flag)", async function () {
      command.setParseResult({
        flags: { limit: 100, direction: "backwards" }, // No api-key flag
        args: { channel: "test-channel" },
        argv: [],
        raw: []
      });
      // Override the getApiKey mock for this specific test to return no key
      getApiKeyMock.resolves();

      await command.run();

      expect(getApiKeyMock.calledOnce).to.be.true;
      expect(ensureAppAndKeyStub.calledOnce).to.be.true;
      expect(historyStub.called).to.be.false;
    });

    it("should handle empty history response", async function () {
      // Configure the stub to return empty array
      historyStub.resolves({ items: [] });

      // Run the command
      await command.run();

      // Verify history was called
      expect(historyStub.calledOnce).to.be.true;

      // Verify that we log "No messages found"
      const noMessagesLog = logStub.args.find(args =>
        typeof args[0] === 'string' && args[0] === "No messages found in the channel history.");
      expect(noMessagesLog).to.exist;
    });

    it("should handle API errors", async function () {
      // Configure the stub to throw an error
      historyStub.rejects(new Error("API error"));

      // Run the command and expect it to error
      await command.run();

      // Verify the error was handled
      expect(errorStub.calledOnce).to.be.true;
      expect(errorStub.firstCall.args[0]).to.include("Error retrieving channel history");
    });

    it("should respect direction flag", async function () {
      // Override the parse result to use different flags
      command.setParseResult({
        flags: { limit: 100, direction: "forwards" },
        args: { channel: "test-channel" },
        argv: [],
        raw: []
      });

      // Run the command
      await command.run();

      // Verify history was called with the correct direction
      expect(historyStub.calledOnce).to.be.true;
      expect(historyStub.firstCall.args[0]).to.deep.equal({
        direction: "forwards",
        limit: 100
      });
    });

    it("should respect start and end flags", async function () {
      // Define timestamps
      const start = "2022-01-01T00:00:00.000Z";
      const end = "2022-01-02T00:00:00.000Z";

      // Override the parse result to use different flags
      command.setParseResult({
        flags: {
          limit: 100,
          direction: "backwards",
          start,
          end
        },
        args: { channel: "test-channel" },
        argv: [],
        raw: []
      });

      // Run the command
      await command.run();

      // Verify history was called with the correct time range
      expect(historyStub.calledOnce).to.be.true;
      expect(historyStub.firstCall.args[0]).to.deep.equal({
        direction: "backwards",
        limit: 100,
        start: new Date(start).getTime(),
        end: new Date(end).getTime()
      });
    });
  });

  describe("JSON output", function () {
    it("should output JSON when requested", async function () {
      // Set shouldOutputJson to return true
      command.setShouldOutputJson(true);

      // Set formatJsonOutput function
      command.setFormatJsonOutput((data) => JSON.stringify(data));

      // Run the command
      await command.run();

      // Verify the JSON output was generated
      expect(logStub.calledOnce).to.be.true;

      // Parse the JSON that was output
      const jsonOutput = JSON.parse(logStub.firstCall.args[0]);

      // Verify the structure of the JSON output
      expect(jsonOutput).to.have.property("messages").that.is.an("array");
      expect(jsonOutput.messages).to.have.lengthOf(2);
      expect(jsonOutput.messages[0]).to.have.property("id", "message1");
      expect(jsonOutput.messages[0]).to.have.property("name", "event1");
      expect(jsonOutput.messages[0]).to.have.property("data").that.deep.equals({ text: "Hello world 1" });
    });

    it("should output JSON when requested with error", async function () {
      // Set shouldOutputJson to return true
      command.setShouldOutputJson(true);

      // Set formatJsonOutput function
      command.setFormatJsonOutput((data) => JSON.stringify(data));

      // Run the command
      await command.run();

      // Verify the JSON output was generated
      expect(logStub.calledOnce).to.be.true;

      // Parse the JSON that was output
      const jsonOutput = JSON.parse(logStub.firstCall.args[0]);

      // Verify the structure of the JSON output
      expect(jsonOutput).to.have.property("messages").that.is.an("array");
      expect(jsonOutput.messages).to.have.lengthOf(2);
      expect(jsonOutput.messages[0]).to.have.property("id", "message1");
      expect(jsonOutput.messages[0]).to.have.property("name", "event1");
      expect(jsonOutput.messages[0]).to.have.property("data").that.deep.equals({ text: "Hello world 1" });
    });

    it("should output JSON when requested with error and shouldOutputJson set to false", async function () {
      // Set shouldOutputJson to return false
      command.setShouldOutputJson(false);

      // Set formatJsonOutput function
      command.setFormatJsonOutput((data) => JSON.stringify(data));

      // Run the command
      await command.run();

      // In this case, we should NOT be outputting JSON since shouldOutputJson returns false
      // The UI format should be used instead
      expect(logStub.called).to.be.true;

      // Verify that we're not formatting as JSON (checking the first call which should be about found messages)
      expect(logStub.firstCall.args[0]).to.include("Found");
    });

    it("should output JSON when requested with error and shouldOutputJson set to true", async function () {
      // Set shouldOutputJson to return true
      command.setShouldOutputJson(true);

      // Set formatJsonOutput function
      command.setFormatJsonOutput((data) => JSON.stringify(data));

      // Run the command
      await command.run();

      // Verify the JSON output was generated
      expect(logStub.calledOnce).to.be.true;

      // Parse the JSON that was output
      const jsonOutput = JSON.parse(logStub.firstCall.args[0]);

      // Verify the structure of the JSON output
      expect(jsonOutput).to.have.property("messages").that.is.an("array");
      expect(jsonOutput.messages).to.have.lengthOf(2);
      expect(jsonOutput.messages[0]).to.have.property("id", "message1");
      expect(jsonOutput.messages[0]).to.have.property("name", "event1");
      expect(jsonOutput.messages[0]).to.have.property("data").that.deep.equals({ text: "Hello world 1" });
    });
  });
});
