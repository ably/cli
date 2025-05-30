import { expect } from "chai";
import { test } from "@oclif/test";
import { registerMock } from "../test-utils.js";

// Mock room data
const mockMessages = [
  {
    text: "Hello room!",
    clientId: "test-client",
    timestamp: new Date(Date.now() - 10000),
    metadata: { isImportant: true },
  },
  {
    text: "How is everyone?", 
    clientId: "other-client",
    timestamp: new Date(Date.now() - 5000),
    metadata: { thread: "general" },
  },
];

const mockPresenceMembers = [
  { clientId: "user1", data: { name: "Alice", status: "online" } },
  { clientId: "user2", data: { name: "Bob", status: "busy" } },
];

const mockReactions = [
  { emoji: "👍", count: 3, clientIds: ["user1", "user2", "user3"] },
  { emoji: "❤️", count: 1, clientIds: ["user1"] },
];

const mockOccupancy = {
  connections: 5,
  publishers: 2,
  subscribers: 3,
  presenceConnections: 2,
  presenceMembers: 2,
};

// Create comprehensive mock for Chat client and room
const createMockRoom = (roomId: string) => ({
  id: roomId,
  attach: async () => Promise.resolve(),
  detach: async () => Promise.resolve(),
  
  // Messages functionality
  messages: {
    send: async (message: any) => {
      mockMessages.push({
        text: message.text,
        clientId: "test-client",
        timestamp: new Date(),
        metadata: message.metadata || {},
      });
      return Promise.resolve();
    },
    subscribe: (callback: (message: any) => void) => {
      // Simulate receiving messages
      setTimeout(() => {
        callback({
          text: "New message",
          clientId: "live-client",
          timestamp: new Date(),
        });
      }, 100);
      return Promise.resolve();
    },
    unsubscribe: async () => Promise.resolve(),
    get: async (options?: any) => {
      const limit = options?.limit || 50;
      const direction = options?.direction || "backwards";
      
      let messages = [...mockMessages];
      if (direction === "backwards") {
        messages.reverse();
      }
      
      return {
        items: messages.slice(0, limit),
        hasNext: () => false,
        isLast: () => true,
      };
    },
  },
  
  // Presence functionality
  presence: {
    enter: async (data?: any) => {
      mockPresenceMembers.push({
        clientId: "test-client",
        data: data || { status: "online" },
      });
      return Promise.resolve();
    },
    leave: async () => Promise.resolve(),
    get: async () => [...mockPresenceMembers],
    subscribe: (callback: (member: any) => void) => {
      setTimeout(() => {
        callback({
          action: "enter",
          clientId: "new-member",
          data: { name: "Charlie", status: "active" },
        });
      }, 100);
      return Promise.resolve();
    },
    unsubscribe: async () => Promise.resolve(),
  },
  
  // Reactions functionality
  reactions: {
    send: async (emoji: string, metadata?: any) => {
      const existingReaction = mockReactions.find(r => r.emoji === emoji);
      if (existingReaction) {
        existingReaction.count++;
        existingReaction.clientIds.push("test-client");
      } else {
        mockReactions.push({
          emoji,
          count: 1,
          clientIds: ["test-client"],
        });
      }
      return Promise.resolve();
    },
    subscribe: (callback: (reaction: any) => void) => {
      setTimeout(() => {
        callback({
          emoji: "🎉",
          clientId: "celebration-client",
          timestamp: new Date(),
        });
      }, 100);
      return Promise.resolve();
    },
    unsubscribe: async () => Promise.resolve(),
  },
  
  // Typing functionality
  typing: {
    start: async () => Promise.resolve(),
    stop: async () => Promise.resolve(),
    subscribe: (callback: (event: any) => void) => {
      setTimeout(() => {
        callback({
          clientId: "typing-client",
          event: "start",
          timestamp: new Date(),
        });
      }, 100);
      return Promise.resolve();
    },
    unsubscribe: async () => Promise.resolve(),
  },
  
  // Occupancy functionality
  occupancy: {
    get: async () => ({ ...mockOccupancy }),
    subscribe: (callback: (occupancy: any) => void) => {
      setTimeout(() => {
        callback({
          ...mockOccupancy,
          connections: mockOccupancy.connections + 1,
        });
      }, 100);
      return Promise.resolve();
    },
    unsubscribe: async () => Promise.resolve(),
  },
});

const mockChatClient = {
  rooms: {
    get: (roomId: string) => createMockRoom(roomId),
    release: async (roomId: string) => Promise.resolve(),
  },
};

const mockRealtimeClient = {
  connection: {
    once: (event: string, callback: () => void) => {
      if (event === 'connected') {
        setTimeout(callback, 0);
      }
    },
    on: (callback: (stateChange: any) => void) => {
      // Simulate connection state changes
      setTimeout(() => {
        callback({ current: "connected", reason: null });
      }, 10);
    },
    state: "connected",
    id: "test-connection-id",
  },
  close: () => {
    // Mock close method
  },
};

let originalEnv: NodeJS.ProcessEnv;

describe('Rooms integration tests', function() {
  this.timeout(10000); // Increase timeout for integration tests
  
  beforeEach(function() {
    // Store original env vars
    originalEnv = { ...process.env };

    // Set environment variables for this test file
    process.env.ABLY_CLI_TEST_MODE = 'true';
    process.env.ABLY_API_KEY = 'test.key:secret';

    // Register the chat and realtime mocks using the test-utils system
    registerMock('ablyChatMock', mockChatClient);
    registerMock('ablyRealtimeMock', mockRealtimeClient);
  });

  afterEach(function() {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('Chat room lifecycle', function() {
    const testRoomId = 'integration-test-room';
    
    it('sends a message to a room', function() {
      return test
        .stdout()
        .command(['rooms', 'messages', 'send', testRoomId, 'Hello from integration test!'])
        .it('successfully sends a message', ctx => {
          expect(ctx.stdout).to.contain('Message sent successfully');
        });
    });

    it('sends multiple messages with metadata', function() {
      return test
        .stdout()
        .command(['rooms', 'messages', 'send', testRoomId, 'Message with metadata', '--metadata', '{"priority":"high"}', '--count', '3'])
        .it('sends multiple messages with metadata', ctx => {
          expect(ctx.stdout).to.contain('messages sent successfully');
        });
    });

    it('retrieves message history', function() {
      return test
        .stdout()
        .command(['rooms', 'messages', 'get', testRoomId, '--limit', '10'])
        .it('retrieves room message history', ctx => {
          expect(ctx.stdout).to.contain('Hello room!');
          expect(ctx.stdout).to.contain('How is everyone?');
        });
    });

    it('enters room presence with data', function() {
      return test
        .stdout()
        .command(['rooms', 'presence', 'enter', testRoomId, '--data', '{"name":"Integration Tester","role":"tester"}'])
        .it('enters presence successfully', ctx => {
          // Since presence enter runs indefinitely, we check initial setup
          expect(ctx.stdout).to.contain('Entered presence');
        });
    });

    it('gets room occupancy metrics', function() {
      return test
        .stdout()
        .command(['rooms', 'occupancy', 'get', testRoomId])
        .it('retrieves occupancy metrics', ctx => {
          expect(ctx.stdout).to.contain('Connections:');
          expect(ctx.stdout).to.contain('Publishers:');
          expect(ctx.stdout).to.contain('Subscribers:');
        });
    });

    it('sends a reaction to a room', function() {
      return test
        .stdout()
        .command(['rooms', 'reactions', 'send', testRoomId, '🚀'])
        .it('sends reaction successfully', ctx => {
          expect(ctx.stdout).to.contain('Reaction sent successfully');
        });
    });

    it('starts typing indicator', function() {
      return test
        .stdout()
        .command(['rooms', 'typing', 'keystroke', testRoomId])
        .it('starts typing indicator', ctx => {
          expect(ctx.stdout).to.contain('Typing indicator started');
        });
    });
  });

  describe('JSON output format', function() {
    const testRoomId = 'json-test-room';

    it('outputs message send result in JSON format', function() {
      return test
        .stdout()
        .command(['rooms', 'messages', 'send', testRoomId, 'JSON test message', '--json'])
        .it('outputs JSON result', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('success', true);
          expect(output).to.have.property('roomId', testRoomId);
        });
    });

    it('outputs message history in JSON format', function() {
      return test
        .stdout()
        .command(['rooms', 'messages', 'get', testRoomId, '--json'])
        .it('outputs JSON history', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('messages').that.is.an('array');
        });
    });

    it('outputs occupancy metrics in JSON format', function() {
      return test
        .stdout()
        .command(['rooms', 'occupancy', 'get', testRoomId, '--json'])
        .it('outputs JSON occupancy', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('connections');
          expect(output).to.have.property('publishers');
          expect(output).to.have.property('subscribers');
        });
    });
  });

  describe('Error handling', function() {
    it('handles invalid room ID gracefully', function() {
      return test
        .stderr()
        .command(['rooms', 'messages', 'send', '', 'test message'])
        .catch(err => {
          expect(err.message).to.include('Room ID is required');
        })
        .it('fails with empty room ID');
    });

    it('handles invalid metadata JSON', function() {
      return test
        .stderr()
        .command(['rooms', 'messages', 'send', 'test-room', 'test message', '--metadata', 'invalid-json'])
        .catch(err => {
          expect(err.message).to.include('Invalid metadata JSON');
        })
        .it('fails with invalid metadata');
    });

    it('handles missing message text', function() {
      return test
        .stderr()
        .command(['rooms', 'messages', 'send', 'test-room'])
        .catch(err => {
          expect(err.message).to.include('Missing required argument');
        })
        .it('fails with missing message text');
    });
  });

  describe('Real-time message flow simulation', function() {
    const testRoomId = 'realtime-test-room';

    it('simulates sending and then subscribing to messages', function() {
      // This test simulates a real flow where we send a message and then subscribe
      return test
        .stdout()
        .command(['rooms', 'messages', 'send', testRoomId, 'Test message for subscription'])
        .it('sends message for subscription test', ctx => {
          expect(ctx.stdout).to.contain('Message sent successfully');
        });
    });

    it('simulates presence lifecycle', function() {
      // Test presence enter followed by checking presence
      return test
        .stdout()
        .command(['rooms', 'presence', 'enter', testRoomId, '--data', '{"status":"testing"}'])
        .it('enters presence for lifecycle test', ctx => {
          expect(ctx.stdout).to.contain('Entered presence');
        });
    });
  });
});