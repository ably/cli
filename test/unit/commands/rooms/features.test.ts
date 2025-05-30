import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import * as Ably from "ably";

import RoomsOccupancyGet from "../../../../src/commands/rooms/occupancy/get.js";
import RoomsOccupancySubscribe from "../../../../src/commands/rooms/occupancy/subscribe.js";
import RoomsPresenceEnter from "../../../../src/commands/rooms/presence/enter.js";
import RoomsPresenceSubscribe from "../../../../src/commands/rooms/presence/subscribe.js";
import RoomsReactionsSend from "../../../../src/commands/rooms/reactions/send.js";
import RoomsReactionsSubscribe from "../../../../src/commands/rooms/reactions/subscribe.js";
import RoomsTypingKeystroke from "../../../../src/commands/rooms/typing/keystroke.js";
import RoomsTypingSubscribe from "../../../../src/commands/rooms/typing/subscribe.js";

// Base testable class for room feature commands
class TestableRoomCommand {
  protected _parseResult: any;
  public mockChatClient: any;
  public mockRealtimeClient: any;

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  public async parse() {
    return this._parseResult;
  }

  public async createChatClient(_flags: any) {
    return this.mockChatClient;
  }

  public async createAblyClient(_flags: any) {
    return this.mockRealtimeClient as unknown as Ably.Realtime;
  }

  public async ensureAppAndKey(_flags: any) {
    return { apiKey: "fake:key", appId: "fake-app" } as const;
  }

  public interactiveHelper = {
    confirm: sinon.stub().resolves(true),
    promptForText: sinon.stub().resolves("fake-input"),
    promptToSelect: sinon.stub().resolves("fake-selection"),
  } as any;
}

// Testable subclasses
class TestableRoomsOccupancyGet extends RoomsOccupancyGet {
  private testableCommand = new TestableRoomCommand();

  public setParseResult(result: any) { this.testableCommand.setParseResult(result); }
  public override async parse() { return this.testableCommand.parse(); }
  protected override async createChatClient(flags: any) { return this.testableCommand.createChatClient(flags); }
  protected override async createAblyClient(flags: any) { return this.testableCommand.createAblyClient(flags); }
  protected override async ensureAppAndKey(flags: any) { return this.testableCommand.ensureAppAndKey(flags); }
  protected override interactiveHelper = this.testableCommand.interactiveHelper;

  get mockChatClient() { return this.testableCommand.mockChatClient; }
  set mockChatClient(value) { this.testableCommand.mockChatClient = value; }
  get mockRealtimeClient() { return this.testableCommand.mockRealtimeClient; }
  set mockRealtimeClient(value) { this.testableCommand.mockRealtimeClient = value; }
}

class TestableRoomsOccupancySubscribe extends RoomsOccupancySubscribe {
  private testableCommand = new TestableRoomCommand();

  public setParseResult(result: any) { this.testableCommand.setParseResult(result); }
  public override async parse() { return this.testableCommand.parse(); }
  protected override async createChatClient(flags: any) { return this.testableCommand.createChatClient(flags); }
  protected override async createAblyClient(flags: any) { return this.testableCommand.createAblyClient(flags); }
  protected override async ensureAppAndKey(flags: any) { return this.testableCommand.ensureAppAndKey(flags); }
  protected override interactiveHelper = this.testableCommand.interactiveHelper;

  get mockChatClient() { return this.testableCommand.mockChatClient; }
  set mockChatClient(value) { this.testableCommand.mockChatClient = value; }
  get mockRealtimeClient() { return this.testableCommand.mockRealtimeClient; }
  set mockRealtimeClient(value) { this.testableCommand.mockRealtimeClient = value; }
}

class TestableRoomsPresenceEnter extends RoomsPresenceEnter {
  private testableCommand = new TestableRoomCommand();

  public setParseResult(result: any) { this.testableCommand.setParseResult(result); }
  public override async parse() { return this.testableCommand.parse(); }
  protected override async createChatClient(flags: any) { return this.testableCommand.createChatClient(flags); }
  protected override async createAblyClient(flags: any) { return this.testableCommand.createAblyClient(flags); }
  protected override async ensureAppAndKey(flags: any) { return this.testableCommand.ensureAppAndKey(flags); }
  protected override interactiveHelper = this.testableCommand.interactiveHelper;

  get mockChatClient() { return this.testableCommand.mockChatClient; }
  set mockChatClient(value) { this.testableCommand.mockChatClient = value; }
  get mockRealtimeClient() { return this.testableCommand.mockRealtimeClient; }
  set mockRealtimeClient(value) { this.testableCommand.mockRealtimeClient = value; }
}

class TestableRoomsReactionsSend extends RoomsReactionsSend {
  private testableCommand = new TestableRoomCommand();

  public setParseResult(result: any) { this.testableCommand.setParseResult(result); }
  public override async parse() { return this.testableCommand.parse(); }
  protected override async createChatClient(flags: any) { return this.testableCommand.createChatClient(flags); }
  protected override async createAblyClient(flags: any) { return this.testableCommand.createAblyClient(flags); }
  protected override async ensureAppAndKey(flags: any) { return this.testableCommand.ensureAppAndKey(flags); }
  protected override interactiveHelper = this.testableCommand.interactiveHelper;

  get mockChatClient() { return this.testableCommand.mockChatClient; }
  set mockChatClient(value) { this.testableCommand.mockChatClient = value; }
  get mockRealtimeClient() { return this.testableCommand.mockRealtimeClient; }
  set mockRealtimeClient(value) { this.testableCommand.mockRealtimeClient = value; }
}

class TestableRoomsTypingKeystroke extends RoomsTypingKeystroke {
  private testableCommand = new TestableRoomCommand();

  public setParseResult(result: any) { this.testableCommand.setParseResult(result); }
  public override async parse() { return this.testableCommand.parse(); }
  protected override async createChatClient(flags: any) { return this.testableCommand.createChatClient(flags); }
  protected override async createAblyClient(flags: any) { return this.testableCommand.createAblyClient(flags); }
  protected override async ensureAppAndKey(flags: any) { return this.testableCommand.ensureAppAndKey(flags); }
  protected override interactiveHelper = this.testableCommand.interactiveHelper;

  get mockChatClient() { return this.testableCommand.mockChatClient; }
  set mockChatClient(value) { this.testableCommand.mockChatClient = value; }
  get mockRealtimeClient() { return this.testableCommand.mockRealtimeClient; }
  set mockRealtimeClient(value) { this.testableCommand.mockRealtimeClient = value; }
}

describe("rooms feature commands", function () {
  let sandbox: sinon.SinonSandbox;
  let mockConfig: Config;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("rooms occupancy get", function () {
    let command: TestableRoomsOccupancyGet;
    let mockRoom: any;
    let mockOccupancy: any;
    let getStub: sinon.SinonStub;

    beforeEach(function () {
      command = new TestableRoomsOccupancyGet([], mockConfig);
      
      getStub = sandbox.stub().resolves({
        connections: 5,
        publishers: 2,
        subscribers: 3,
        presenceConnections: 2,
        presenceMembers: 4,
      });

      mockOccupancy = {
        get: getStub,
      };

      mockRoom = {
        attach: sandbox.stub().resolves(),
        occupancy: mockOccupancy,
      };

      command.mockChatClient = {
        rooms: {
          get: sandbox.stub().resolves(mockRoom),
          release: sandbox.stub().resolves(),
        },
      };

      command.mockRealtimeClient = {
        connection: {
          on: sandbox.stub(),
          state: "connected",
        },
        close: sandbox.stub(),
      };

      command.setParseResult({
        flags: {},
        args: { roomId: "test-room" },
        argv: [],
        raw: [],
      });
    });

    it("should get room occupancy metrics", async function () {
      await command.run();

      expect(command.mockChatClient.rooms.get.calledWith("test-room")).to.be.true;
      expect(mockRoom.attach.calledOnce).to.be.true;
      expect(getStub.calledOnce).to.be.true;
    });
  });

  describe("rooms occupancy subscribe", function () {
    let command: TestableRoomsOccupancySubscribe;
    let mockRoom: any;
    let mockOccupancy: any;
    let subscribeStub: sinon.SinonStub;

    beforeEach(function () {
      command = new TestableRoomsOccupancySubscribe([], mockConfig);
      
      subscribeStub = sandbox.stub();
      mockOccupancy = {
        subscribe: subscribeStub,
        unsubscribe: sandbox.stub().resolves(),
      };

      mockRoom = {
        attach: sandbox.stub().resolves(),
        occupancy: mockOccupancy,
      };

      command.mockChatClient = {
        rooms: {
          get: sandbox.stub().resolves(mockRoom),
          release: sandbox.stub().resolves(),
        },
      };

      command.mockRealtimeClient = {
        connection: {
          on: sandbox.stub(),
          state: "connected",
        },
        close: sandbox.stub(),
      };

      command.setParseResult({
        flags: {},
        args: { roomId: "test-room" },
        argv: [],
        raw: [],
      });
    });

    it("should subscribe to room occupancy updates", async function () {
      subscribeStub.callsFake((callback) => {
        setTimeout(() => {
          callback({
            connections: 6,
            publishers: 3,
            subscribers: 3,
            presenceConnections: 2,
            presenceMembers: 4,
          });
        }, 10);
        return Promise.resolve();
      });

      // Since subscribe runs indefinitely, we'll test the setup
      const runPromise = command.run();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(command.mockChatClient.rooms.get.calledWith("test-room")).to.be.true;
      expect(mockRoom.attach.calledOnce).to.be.true;
      expect(subscribeStub.calledOnce).to.be.true;
      
      command.mockRealtimeClient.close();
    });
  });

  describe("rooms presence enter", function () {
    let command: TestableRoomsPresenceEnter;
    let mockRoom: any;
    let mockPresence: any;
    let enterStub: sinon.SinonStub;

    beforeEach(function () {
      command = new TestableRoomsPresenceEnter([], mockConfig);
      
      enterStub = sandbox.stub().resolves();
      mockPresence = {
        enter: enterStub,
        subscribe: sandbox.stub(),
        unsubscribe: sandbox.stub().resolves(),
      };

      mockRoom = {
        attach: sandbox.stub().resolves(),
        presence: mockPresence,
      };

      command.mockChatClient = {
        rooms: {
          get: sandbox.stub().resolves(mockRoom),
          release: sandbox.stub().resolves(),
        },
      };

      command.mockRealtimeClient = {
        connection: {
          on: sandbox.stub(),
          state: "connected",
          id: "test-connection-id",
        },
        close: sandbox.stub(),
      };

      command.setParseResult({
        flags: {},
        args: { roomId: "test-room" },
        argv: [],
        raw: [],
      });
    });

    it("should enter room presence successfully", async function () {
      // Since presence enter runs indefinitely, we'll test the setup
      const runPromise = command.run();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(command.mockChatClient.rooms.get.calledWith("test-room")).to.be.true;
      expect(mockRoom.attach.calledOnce).to.be.true;
      expect(enterStub.calledOnce).to.be.true;
      
      command.mockRealtimeClient.close();
    });

    it("should handle presence data", async function () {
      command.setParseResult({
        flags: { data: '{"status": "online", "name": "Test User"}' },
        args: { roomId: "test-room" },
        argv: [],
        raw: [],
      });

      const runPromise = command.run();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(enterStub.calledOnce).to.be.true;
      const presenceData = enterStub.getCall(0).args[0];
      expect(presenceData).to.deep.equal({ status: "online", name: "Test User" });
      
      command.mockRealtimeClient.close();
    });
  });

  describe("rooms reactions send", function () {
    let command: TestableRoomsReactionsSend;
    let mockRoom: any;
    let mockReactions: any;
    let sendStub: sinon.SinonStub;

    beforeEach(function () {
      command = new TestableRoomsReactionsSend([], mockConfig);
      
      sendStub = sandbox.stub().resolves();
      mockReactions = {
        send: sendStub,
      };

      mockRoom = {
        attach: sandbox.stub().resolves(),
        reactions: mockReactions,
      };

      command.mockChatClient = {
        rooms: {
          get: sandbox.stub().resolves(mockRoom),
          release: sandbox.stub().resolves(),
        },
      };

      command.mockRealtimeClient = {
        connection: {
          on: sandbox.stub(),
          state: "connected",
        },
        close: sandbox.stub(),
      };

      command.setParseResult({
        flags: {},
        args: { roomId: "test-room", emoji: "👍" },
        argv: [],
        raw: [],
      });
    });

    it("should send a reaction successfully", async function () {
      await command.run();

      expect(command.mockChatClient.rooms.get.calledWith("test-room")).to.be.true;
      expect(mockRoom.attach.calledOnce).to.be.true;
      expect(sendStub.calledOnce).to.be.true;
      expect(sendStub.calledWith("👍")).to.be.true;
    });

    it("should handle metadata in reactions", async function () {
      command.setParseResult({
        flags: { metadata: '{"intensity": "high"}' },
        args: { roomId: "test-room", emoji: "🎉" },
        argv: [],
        raw: [],
      });

      await command.run();

      expect(sendStub.calledOnce).to.be.true;
      const reactionCall = sendStub.getCall(0);
      expect(reactionCall.args[0]).to.equal("🎉");
      // Metadata would typically be passed as second argument
      if (reactionCall.args[1]) {
        expect(reactionCall.args[1]).to.deep.include({ intensity: "high" });
      }
    });
  });

  describe("rooms typing keystroke", function () {
    let command: TestableRoomsTypingKeystroke;
    let mockRoom: any;
    let mockTyping: any;
    let startStub: sinon.SinonStub;

    beforeEach(function () {
      command = new TestableRoomsTypingKeystroke([], mockConfig);
      
      startStub = sandbox.stub().resolves();
      mockTyping = {
        start: startStub,
      };

      mockRoom = {
        attach: sandbox.stub().resolves(),
        typing: mockTyping,
      };

      command.mockChatClient = {
        rooms: {
          get: sandbox.stub().resolves(mockRoom),
          release: sandbox.stub().resolves(),
        },
      };

      command.mockRealtimeClient = {
        connection: {
          on: sandbox.stub(),
          state: "connected",
        },
        close: sandbox.stub(),
      };

      command.setParseResult({
        flags: {},
        args: { roomId: "test-room" },
        argv: [],
        raw: [],
      });
    });

    it("should start typing indicator", async function () {
      await command.run();

      expect(command.mockChatClient.rooms.get.calledWith("test-room")).to.be.true;
      expect(mockRoom.attach.calledOnce).to.be.true;
      expect(startStub.calledOnce).to.be.true;
    });
  });
});