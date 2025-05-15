import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import * as Ably from "ably";

import BenchPublisher from "../../../../src/commands/bench/publisher.js";

// Lightweight testable subclass to intercept parsing and client creation
class TestableBenchPublisher extends BenchPublisher {
  private _parseResult: any;
  public mockRealtimeClient: any;

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  // Override parse to return the canned args/flags
  public override async parse() {
    return this._parseResult;
  }

  // Override Realtime client creation to supply our stub
  public override async createAblyClient(_flags: any) {
    return this.mockRealtimeClient as unknown as Ably.Realtime;
  }

  // Skip app/key validation logic
  protected override async ensureAppAndKey(_flags: any) {
    return { apiKey: "fake:key", appId: "fake-app" } as const;
  }

  // Mock interactive helper for non-interactive unit testing
  protected override interactiveHelper = {
    confirm: sinon.stub().resolves(true),
    promptForText: sinon.stub().resolves("fake-input"),
    promptToSelect: sinon.stub().resolves("fake-selection"),
  } as any;
}

describe("bench publisher control envelopes", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableBenchPublisher;
  let mockConfig: Config;
  let publishStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableBenchPublisher([], mockConfig);

    publishStub = sandbox.stub().resolves();

    // Minimal mock channel
    const mockChannel = {
      publish: publishStub,
      subscribe: sandbox.stub(),
      presence: {
        enter: sandbox.stub().resolves(),
        get: sandbox.stub().resolves([]),
        subscribe: sandbox.stub(),
        unsubscribe: sandbox.stub(),
      },
      on: sandbox.stub(),
    };

    command.mockRealtimeClient = {
      channels: { get: sandbox.stub().returns(mockChannel) },
      connection: { on: sandbox.stub(), state: "connected" },
      close: sandbox.stub(),
    };

    // Speed up test by stubbing out internal delay utility (3000 ms wait)
    sandbox.stub(command as any, "delay").resolves();

    command.setParseResult({
      flags: {
        transport: "realtime",
        messages: 2,
        rate: 2,
        "message-size": 50,
        "wait-for-subscribers": false,
      },
      args: { channel: "test-channel" },
      argv: [],
      raw: [],
    });
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("should publish start, message and end control envelopes in order", async function () {
    await command.run();

    // Extract the data argument from publish calls
    const publishedPayloads = publishStub.getCalls().map((c) => c.args[1]);

    expect(publishedPayloads[0]).to.have.property("type", "start");

    // There should be at least one message payload with type "message"
    const messagePayload = publishedPayloads.find((p) => p.type === "message");
    expect(messagePayload).to.not.be.undefined;

    // Last payload should be end control
    const lastPayload = publishedPayloads.at(-1);
    expect(lastPayload).to.have.property("type", "end");
  });
}); 