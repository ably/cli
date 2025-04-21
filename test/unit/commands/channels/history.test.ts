import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ChannelsHistory from "../../../../src/commands/channels/history.js";

// Create a testable version of ChannelsHistory to expose protected methods
class TestableChannelsHistory extends ChannelsHistory {
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
    const channelName = args.channel;

    // Show authentication information
    this.showAuthInfoIfNeeded();

    try {
      // Mock channel object with history method
      const channel = {
        history: this.mockHistoryFn
      };

      // Setup channel options
      const channelOptions: any = {};

      // Add encryption if specified
      if (flags.cipher) {
        channelOptions.cipher = {
          key: flags.cipher,
        };
      }

      // Build history query parameters
      const historyParams: any = {
        direction: flags.direction,
        limit: flags.limit,
      };

      // Add time range if specified
      if (flags.start) {
        historyParams.start = new Date(flags.start).getTime();
      }

      if (flags.end) {
        historyParams.end = new Date(flags.end).getTime();
      }

      // Get history
      const history = await channel.history(historyParams);
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
          `Found ${messages.length.toString()} messages in the history of channel ${channelName}:`,
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

  beforeEach(function () {
    // Mock Config
    mockConfig = {} as Config;

    // Create command instance
    command = new TestableChannelsHistory([], mockConfig);

    // Stub the log and error methods
    logStub = sinon.stub(command, "log");
    errorStub = sinon.stub(command, "error");

    // Create history stub
    historyStub = sinon.stub().resolves(mockHistoryResponse);

    // Set the mock history function
    command.setMockHistoryFn(historyStub);

    // Set default parse result
    command.setParseResult({
      flags: { limit: 100, direction: "backwards" },
      args: { channel: "test-channel" },
      argv: [],
      raw: []
    });
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("run", function () {
    it("should retrieve channel history successfully", async function () {
      // Run the command
      await command.run();

      // Verify the history was called with correct parameters
      expect(historyStub.calledOnce).to.be.true;
      expect(historyStub.firstCall.args[0]).to.deep.equal({
        direction: "backwards",
        limit: 100
      });

      // Verify that we log message information
      expect(logStub.called).to.be.true;

      // Verify found messages log
      const foundMessages = logStub.args.find(args =>
        typeof args[0] === 'string' && args[0].includes("Found 2 messages"));
      expect(foundMessages).to.exist;
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
  });
});
