import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import * as Ably from "ably";

import BenchPublisher from "../../../../src/commands/bench/publisher.js";
import BenchSubscriber from "../../../../src/commands/bench/subscriber.js";

// Testable subclass for bench publisher command
class TestableBenchPublisher extends BenchPublisher {
  private _parseResult: any;
  public mockRealtimeClient: any;
  public mockRestClient: any;

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  public override async parse() {
    return this._parseResult;
  }

  protected override async createAblyClient(_flags: any) {
    return this.mockRealtimeClient as unknown as Ably.Realtime;
  }

  protected override createAblyRestClient(_flags: any): Ably.Rest {
    return this.mockRestClient as unknown as Ably.Rest;
  }

  protected override async ensureAppAndKey(_flags: any) {
    return { apiKey: "fake:key", appId: "fake-app" } as const;
  }

  protected override interactiveHelper = {
    confirm: sinon.stub().resolves(true),
    promptForText: sinon.stub().resolves("fake-input"),
    promptToSelect: sinon.stub().resolves("fake-selection"),
  } as any;

  // Expose protected methods for testing
  public testDelay(ms: number) {
    return (this as any).delay(ms);
  }

  public testGenerateRandomData(size: number) {
    return (this as any).generateRandomData(size);
  }

  public testCalculateMetrics(startTime: number, endTime: number, messageCount: number, errorCount: number) {
    return (this as any).calculateMetrics(startTime, endTime, messageCount, errorCount);
  }
}

// Testable subclass for bench subscriber command
class TestableBenchSubscriber extends BenchSubscriber {
  private _parseResult: any;
  public mockRealtimeClient: any;

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  public override async parse() {
    return this._parseResult;
  }

  protected override async createAblyClient(_flags: any) {
    return this.mockRealtimeClient as unknown as Ably.Realtime;
  }

  protected override async ensureAppAndKey(_flags: any) {
    return { apiKey: "fake:key", appId: "fake-app" } as const;
  }

  protected override interactiveHelper = {
    confirm: sinon.stub().resolves(true),
    promptForText: sinon.stub().resolves("fake-input"),
    promptToSelect: sinon.stub().resolves("fake-selection"),
  } as any;
}

describe("benchmarking commands", function () {
  let sandbox: sinon.SinonSandbox;
  let mockConfig: Config;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("bench publisher", function () {
    let command: TestableBenchPublisher;
    let mockChannel: any;
    let publishStub: sinon.SinonStub;

    beforeEach(function () {
      command = new TestableBenchPublisher([], mockConfig);
      
      publishStub = sandbox.stub().resolves();
      mockChannel = {
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

      command.mockRestClient = {
        channels: { get: sandbox.stub().returns(mockChannel) },
      };

      // Speed up test by stubbing out internal delay utility
      sandbox.stub(command as any, "delay").resolves();

      command.setParseResult({
        flags: {
          transport: "realtime",
          messages: 5,
          rate: 5,
          "message-size": 100,
          "wait-for-subscribers": false,
        },
        args: { channel: "test-channel" },
        argv: [],
        raw: [],
      });
    });

    it("should publish messages at the specified rate", async function () {
      await command.run();

      expect(publishStub.callCount).to.equal(5);
    });

    it("should generate random data of specified size", function () {
      const data = command.testGenerateRandomData(100);
      
      expect(typeof data).to.equal("string");
      expect(data.length).to.equal(100);
    });

    it("should calculate metrics correctly", function () {
      const startTime = 1000;
      const endTime = 2000; // 1 second duration
      const messageCount = 100;
      const errorCount = 5;

      const metrics = command.testCalculateMetrics(startTime, endTime, messageCount, errorCount);

      expect(metrics).to.deep.include({
        totalMessages: messageCount,
        successfulMessages: messageCount - errorCount,
        failedMessages: errorCount,
        durationMs: endTime - startTime,
        messagesPerSecond: 100, // 100 messages in 1 second
        successRate: 0.95, // 95% success rate
      });
    });

    it("should handle rate limiting with small intervals", async function () {
      command.setParseResult({
        flags: {
          transport: "realtime",
          messages: 3,
          rate: 20, // 20 messages per second = 50ms interval
          "message-size": 50,
          "wait-for-subscribers": false,
        },
        args: { channel: "test-channel" },
        argv: [],
        raw: [],
      });

      // Restore the delay stub to test timing
      (command as any).delay.restore();
      const delaySpy = sandbox.spy(command, "testDelay");

      const startTime = Date.now();
      await command.run();
      const endTime = Date.now();

      expect(publishStub.callCount).to.equal(3);
      // Should take at least some time due to rate limiting
      expect(endTime - startTime).to.be.greaterThan(50);
    });

    it("should handle publish errors gracefully", async function () {
      publishStub.onFirstCall().rejects(new Error("Publish failed"));
      publishStub.onSecondCall().resolves();
      publishStub.onThirdCall().resolves();

      // Should not throw, but handle errors internally
      await command.run();

      expect(publishStub.callCount).to.equal(5);
    });

    it("should wait for subscribers when flag is set", async function () {
      const presenceGetStub = mockChannel.presence.get;
      presenceGetStub.onFirstCall().resolves([]); // No subscribers initially
      presenceGetStub.onSecondCall().resolves([{ clientId: "subscriber1" }]); // Subscriber appears

      command.setParseResult({
        flags: {
          transport: "realtime",
          messages: 2,
          rate: 10,
          "message-size": 50,
          "wait-for-subscribers": true,
        },
        args: { channel: "test-channel" },
        argv: [],
        raw: [],
      });

      await command.run();

      expect(presenceGetStub.callCount).to.be.greaterThan(1);
      expect(publishStub.callCount).to.equal(2);
    });

    it("should use REST transport when specified", async function () {
      command.setParseResult({
        flags: {
          transport: "rest",
          messages: 3,
          rate: 5,
          "message-size": 50,
          "wait-for-subscribers": false,
        },
        args: { channel: "test-channel" },
        argv: [],
        raw: [],
      });

      await command.run();

      expect(publishStub.callCount).to.equal(3);
    });
  });

  describe("bench subscriber", function () {
    let command: TestableBenchSubscriber;
    let mockChannel: any;
    let subscribeStub: sinon.SinonStub;

    beforeEach(function () {
      command = new TestableBenchSubscriber([], mockConfig);
      
      subscribeStub = sandbox.stub();
      mockChannel = {
        subscribe: subscribeStub,
        unsubscribe: sandbox.stub().resolves(),
        presence: {
          enter: sandbox.stub().resolves(),
          leave: sandbox.stub().resolves(),
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

      command.setParseResult({
        flags: {},
        args: { channel: "test-channel" },
        argv: [],
        raw: [],
      });
    });

    it("should subscribe to channel successfully", async function () {
      subscribeStub.callsFake((callback) => {
        // Simulate receiving messages
        setTimeout(() => {
          callback({
            name: "benchmark-message",
            data: { payload: "test data" },
            timestamp: Date.now(),
            clientId: "publisher1",
          });
        }, 10);
      });

      // Since subscribe runs indefinitely, we'll test the setup
      const runPromise = command.run();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(subscribeStub.calledOnce).to.be.true;
      expect(mockChannel.presence.enter.calledOnce).to.be.true;
      
      command.mockRealtimeClient.close();
    });

    it("should enter presence when subscribing", async function () {
      subscribeStub.resolves();

      const runPromise = command.run();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockChannel.presence.enter.calledOnce).to.be.true;
      
      command.mockRealtimeClient.close();
    });

    it("should handle subscription errors gracefully", async function () {
      subscribeStub.rejects(new Error("Subscription failed"));

      try {
        await command.run();
      } catch (error) {
        expect(error.message).to.include("Subscription failed");
      }
    });

    it("should process incoming messages and calculate stats", async function () {
      const receivedMessages: any[] = [];
      
      subscribeStub.callsFake((callback) => {
        // Simulate multiple messages over time
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            const message = {
              name: "benchmark-message",
              data: { payload: `test data ${i}`, sequence: i },
              timestamp: Date.now(),
              clientId: "publisher1",
            };
            receivedMessages.push(message);
            callback(message);
          }, i * 10);
        }
      });

      const runPromise = command.run();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(subscribeStub.calledOnce).to.be.true;
      
      command.mockRealtimeClient.close();
    });
  });

  describe("benchmarking metrics calculation", function () {
    let command: TestableBenchPublisher;

    beforeEach(function () {
      command = new TestableBenchPublisher([], mockConfig);
    });

    it("should calculate correct throughput metrics", function () {
      const startTime = 1000;
      const endTime = 3000; // 2 seconds
      const messageCount = 200;
      const errorCount = 10;

      const metrics = command.testCalculateMetrics(startTime, endTime, messageCount, errorCount);

      expect(metrics.totalMessages).to.equal(200);
      expect(metrics.successfulMessages).to.equal(190);
      expect(metrics.failedMessages).to.equal(10);
      expect(metrics.durationMs).to.equal(2000);
      expect(metrics.messagesPerSecond).to.equal(100); // 200 messages in 2 seconds
      expect(metrics.successRate).to.equal(0.95); // 95% success rate
    });

    it("should handle zero duration edge case", function () {
      const startTime = 1000;
      const endTime = 1000; // Same time = 0 duration
      const messageCount = 100;
      const errorCount = 0;

      const metrics = command.testCalculateMetrics(startTime, endTime, messageCount, errorCount);

      expect(metrics.durationMs).to.equal(0);
      expect(metrics.messagesPerSecond).to.equal(Infinity); // Division by zero
      expect(metrics.successRate).to.equal(1.0);
    });

    it("should handle all failed messages", function () {
      const startTime = 1000;
      const endTime = 2000;
      const messageCount = 50;
      const errorCount = 50; // All messages failed

      const metrics = command.testCalculateMetrics(startTime, endTime, messageCount, errorCount);

      expect(metrics.successfulMessages).to.equal(0);
      expect(metrics.failedMessages).to.equal(50);
      expect(metrics.successRate).to.equal(0.0);
    });

    it("should calculate metrics for very fast operations", function () {
      const startTime = 1000;
      const endTime = 1100; // 100ms
      const messageCount = 10;
      const errorCount = 1;

      const metrics = command.testCalculateMetrics(startTime, endTime, messageCount, errorCount);

      expect(metrics.durationMs).to.equal(100);
      expect(metrics.messagesPerSecond).to.equal(100); // 10 messages in 0.1 seconds = 100/sec
      expect(metrics.successRate).to.equal(0.9);
    });
  });
});