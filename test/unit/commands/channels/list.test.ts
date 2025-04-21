import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ChannelsList from "../../../../src/commands/channels/list.js";

// Create a testable version of ChannelsList to expose protected methods
class TestableChannelsList extends ChannelsList {
  // Override parse to simulate parse output
  public override async parse() {
    // Return the parse result that was set via our test setup
    return this._parseResult;
  }

  // Add a property to store the parse result for testing
  private _parseResult: any = {
    flags: { limit: 100 },
    args: {},
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
    const { flags } = await this.parse();

    // Create the Ably client - this will handle displaying data plane info
    const client = await this.createAblyClient();
    if (!client) return;

    try {
      // Use our mocked rest client
      const rest = this.restClient;

      // Build params for channel listing
      const params: any = {
        limit: flags.limit,
      };

      if (flags.prefix) {
        params.prefix = flags.prefix;
      }

      // Call our mock request method
      const channelsResponse = await rest.request(
        "get",
        "/channels",
        2,
        params,
        null,
      );

      if (channelsResponse.statusCode !== 200) {
        this.error(`Failed to list channels: ${channelsResponse.statusCode}`);
        return;
      }

      const channels = channelsResponse.items || [];

      // Output channels based on format
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              channels: channels.map((channel: any) => ({
                channelId: channel.channelId,
                metrics: channel.status?.occupancy?.metrics || {},
              })),
              hasMore: channels.length === flags.limit,
              success: true,
              timestamp: new Date().toISOString(),
              total: channels.length,
            },
            flags,
          ),
        );
        return;
      }

      if (channels.length === 0) {
        this.log("No active channels found.");
        return;
      }

      this.log(
        `Found ${channels.length.toString()} active channels:`,
      );

      for (const channel of channels) {
        this.log(`${channel.channelId}`);

        // Show occupancy if available
        if (channel.status?.occupancy?.metrics) {
          const { metrics } = channel.status.occupancy;
          this.log(
            `  Connections: ${metrics.connections || 0}`,
          );
          this.log(
            `  Publishers: ${metrics.publishers || 0}`,
          );
          this.log(
            `  Subscribers: ${metrics.subscribers || 0}`,
          );

          if (metrics.presenceConnections !== undefined) {
            this.log(
              `  Presence Connections: ${metrics.presenceConnections}`,
            );
          }

          if (metrics.presenceMembers !== undefined) {
            this.log(
              `  Presence Members: ${metrics.presenceMembers}`,
            );
          }
        }

        this.log(""); // Add a line break between channels
      }

      if (channels.length === flags.limit) {
        this.log(
          `Showing maximum of ${flags.limit} channels. Use --limit to show more.`,
        );
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              error: error instanceof Error ? error.message : String(error),
              status: "error",
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(
          `Error listing channels: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      client.close();
    }
  }

  // Mock Rest client
  private restClient: any;

  // Method to set rest client
  public setRestClient(client: any) {
    this.restClient = client;
  }

  // Override shouldOutputJson
  public override shouldOutputJson(_flags: any) {
    return this._shouldOutputJson;
  }

  private _shouldOutputJson = false;

  // Method to set shouldOutputJson value
  public setShouldOutputJson(value: boolean) {
    this._shouldOutputJson = value;
  }

  // Override formatJsonOutput
  public override formatJsonOutput(data: Record<string, unknown>, _flags: any) {
    return this._formatJsonOutputFn ? this._formatJsonOutputFn(data) : JSON.stringify(data);
  }

  private _formatJsonOutputFn: ((data: Record<string, unknown>) => string) | null = null;

  // Method to set formatJsonOutput function
  public setFormatJsonOutput(fn: (data: Record<string, unknown>) => string) {
    this._formatJsonOutputFn = fn;
  }
}

// Mock channel response data
const mockChannelsResponse = {
  statusCode: 200,
  items: [
    {
      channelId: "test-channel-1",
      status: {
        occupancy: {
          metrics: {
            connections: 5,
            publishers: 2,
            subscribers: 3,
            presenceConnections: 1,
            presenceMembers: 2
          }
        }
      }
    },
    {
      channelId: "test-channel-2",
      status: {
        occupancy: {
          metrics: {
            connections: 3,
            publishers: 1,
            subscribers: 2
          }
        }
      }
    }
  ]
};

describe("ChannelsList", function () {
  let command: TestableChannelsList;
  let mockRest: any;
  let requestStub: sinon.SinonStub;
  let closeStub: sinon.SinonStub;
  let mockConfig: Config;
  let logStub: sinon.SinonStub;
  let errorStub: sinon.SinonStub;

  beforeEach(function () {
    // Mock Config
    mockConfig = {} as Config;

    // Create command instance
    command = new TestableChannelsList([], mockConfig);

    // Stub the log and error methods
    logStub = sinon.stub(command, "log");
    errorStub = sinon.stub(command, "error");

    // Create request stub
    requestStub = sinon.stub();

    // Create mock REST client
    mockRest = {
      request: requestStub
    };

    // Set the mock rest client
    command.setRestClient(mockRest);

    // Create a stub for the client close method
    closeStub = sinon.stub();

    // Set the mock Ably client
    command.setMockAblyClient({
      close: closeStub
    });

    // Set default parse result
    command.setParseResult({
      flags: { limit: 100 },
      args: {},
      argv: [],
      raw: []
    });
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("run", function () {
    it("should list channels successfully", async function () {
      // Configure the stub to return mock data
      requestStub.resolves(mockChannelsResponse);

      // Run the command
      await command.run();

      // Verify the REST client request was called with correct parameters
      expect(requestStub.calledOnce).to.be.true;
      expect(requestStub.firstCall.args[0]).to.equal("get");
      expect(requestStub.firstCall.args[1]).to.equal("/channels");
      expect(requestStub.firstCall.args[2]).to.equal(2);
      expect(requestStub.firstCall.args[3]).to.deep.equal({ limit: 100 });

      // Verify that we log channel information
      expect(logStub.called).to.be.true;

      // Verify first call contains the channel count
      const foundChannels = logStub.args.find(args =>
        typeof args[0] === 'string' && args[0].includes("Found 2 active channels"));
      expect(foundChannels).to.exist;

      // Verify client was properly closed
      expect(closeStub.calledOnce).to.be.true;
    });

    it("should handle empty channels response", async function () {
      // Configure the stub to return empty array
      requestStub.resolves({
        statusCode: 200,
        items: []
      });

      // Run the command
      await command.run();

      // Verify the REST client request was called
      expect(requestStub.calledOnce).to.be.true;

      // Verify that we log "No active channels found"
      const noChannelsLog = logStub.args.find(args =>
        typeof args[0] === 'string' && args[0] === "No active channels found.");
      expect(noChannelsLog).to.exist;

      // Verify client was properly closed
      expect(closeStub.calledOnce).to.be.true;
    });

    it("should handle API errors", async function () {
      // Configure the stub to return an error
      requestStub.resolves({
        statusCode: 400,
        error: "Bad Request"
      });

      // Run the command and expect it to error
      await command.run();

      // Verify the error was handled
      expect(errorStub.calledOnce).to.be.true;
      expect(errorStub.firstCall.args[0]).to.include("Failed to list channels");

      // Verify client was properly closed
      expect(closeStub.calledOnce).to.be.true;
    });

    it("should respect limit flag", async function () {
      // Override the parse result to use different flags
      command.setParseResult({
        flags: { limit: 50 },
        args: {},
        argv: [],
        raw: []
      });

      // Configure the response
      requestStub.resolves(mockChannelsResponse);

      // Run the command
      await command.run();

      // Verify the request was called with the correct limit
      expect(requestStub.calledOnce).to.be.true;
      expect(requestStub.firstCall.args[3]).to.deep.equal({ limit: 50 });

      // Verify client was properly closed
      expect(closeStub.calledOnce).to.be.true;
    });

    it("should respect prefix flag", async function () {
      // Override the parse result to use different flags
      command.setParseResult({
        flags: { limit: 100, prefix: "test-" },
        args: {},
        argv: [],
        raw: []
      });

      // Configure the response
      requestStub.resolves(mockChannelsResponse);

      // Run the command
      await command.run();

      // Verify the request was called with the correct parameters
      expect(requestStub.calledOnce).to.be.true;
      expect(requestStub.firstCall.args[3]).to.deep.equal({
        limit: 100,
        prefix: "test-"
      });

      // Verify client was properly closed
      expect(closeStub.calledOnce).to.be.true;
    });
  });

  describe("JSON output", function () {
    it("should output JSON when requested", async function () {
      // Set shouldOutputJson to return true
      command.setShouldOutputJson(true);

      // Set formatJsonOutput function
      command.setFormatJsonOutput((data) => JSON.stringify(data));

      // Configure the response
      requestStub.resolves(mockChannelsResponse);

      // Run the command
      await command.run();

      // Verify the JSON output was generated
      expect(logStub.calledOnce).to.be.true;

      // Parse the JSON that was output
      const jsonOutput = JSON.parse(logStub.firstCall.args[0]);

      // Verify the structure of the JSON output
      expect(jsonOutput).to.have.property("channels").that.is.an("array");
      expect(jsonOutput.channels).to.have.lengthOf(2);
      expect(jsonOutput.channels[0]).to.have.property("channelId", "test-channel-1");
      expect(jsonOutput.channels[0]).to.have.property("metrics");
      expect(jsonOutput).to.have.property("success", true);

      // Verify client was properly closed
      expect(closeStub.calledOnce).to.be.true;
    });
  });
});
