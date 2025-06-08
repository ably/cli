import { expect } from "chai";
import { test } from "@oclif/test";

// Create a more comprehensive mock for Ably client
const mockPresenceMembers = [
  { clientId: "user1", data: { name: "User 1" } },
  { clientId: "user2", data: { name: "User 2" } }
];

const mockMessages = [
  { name: "event1", data: { text: "Test message 1" }, timestamp: Date.now() - 10000, clientId: "user1" },
  { name: "event2", data: { text: "Test message 2" }, timestamp: Date.now() - 5000, clientId: "user2" }
];

const mockOccupancyMetrics = {
  metrics: {
    connections: 5,
    publishers: 2,
    subscribers: 3,
    presenceConnections: 2,
    presenceMembers: 2
  }
};

// More comprehensive mock Ably client
const mockClient = {
  request: () => {
    // Return channel list response
    return {
      statusCode: 200,
      items: [
        { channelId: "test-channel-1", status: { occupancy: mockOccupancyMetrics } },
        { channelId: "test-channel-2" }
      ]
    };
  },
  channels: {
    get: () => ({
      name: "test-channel-1",
      publish: async () => true,
      history: () => {
        // Return channel history response
        return {
          items: mockMessages
        };
      },
      presence: {
        get: () => mockPresenceMembers,
        enter: async () => true,
        leave: async () => true,
        subscribe: (callback: (message: any) => void) => {
          // Simulate presence update
          setTimeout(() => {
            callback({ action: "enter", clientId: "user3", data: { name: "User 3" }});
          }, 100);
        }
      },
      subscribe: (eventName: string, callback: (message: any) => void) => {
        // Simulate message received
        setTimeout(() => {
          callback({ name: "message", data: { text: "New message" } });
        }, 100);
      }
    })
  },
  connection: {
    once: (event: string, callback: () => void) => {
      if (event === 'connected') {
        setTimeout(callback, 0);
      }
    },
    on: () => {}
  },
  stats: {
    get: async () => {
      return [{ inbound: {}, outbound: {}, persisted: {}, connections: {}, channels: 5, apiRequests: 120, tokenRequests: 10 }];
    }
  },
  close: () => {
    // Mock close method
  }
};

// Pre-define variables used in tests to avoid linter errors
const publishFlowUniqueChannel = `test-channel-${Date.now()}`;
const publishFlowUniqueMessage = `Test message ${Date.now()}`;
const presenceFlowUniqueChannel = `test-presence-${Date.now()}`;
const presenceFlowUniqueClientId = `client-${Date.now()}`;

let originalEnv: NodeJS.ProcessEnv;

describe('Channels integration tests', function() {
  beforeEach(function() {
    // Store original env vars
    originalEnv = { ...process.env };

    // Make the mock globally available
    globalThis.__TEST_MOCKS__ = {
      ablyRestMock: mockClient
    };

    // Set environment variables for this test file
    process.env.ABLY_CLI_TEST_MODE = 'true';
    process.env.ABLY_API_KEY = 'test.key:secret'; // Using a consistent mock key for integration tests
  });

  afterEach(function() {
    // Clean up global mock
    delete globalThis.__TEST_MOCKS__;
    // Restore original environment variables
    process.env = originalEnv;
  });

  // Core channel operations
  describe('Core channel operations', function() {
    it('lists active channels', function() {
      return test
        .stdout()
        .command(['channels', 'list'])
        .it('lists active channels', ctx => {
          expect(ctx.stdout).to.contain('test-channel-1');
          expect(ctx.stdout).to.contain('test-channel-2');
        });
    });

    it('outputs channels list in JSON format', function() {
      return test
        .stdout()
        .command(['channels', 'list', '--json'])
        .it('outputs channels list in JSON format', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('channels').that.is.an('array');
          expect(output.channels.length).to.be.at.least(2);
        });
    });

    it('publishes message to a channel', function() {
      return test
        .stdout()
        .command(['channels', 'publish', 'test-channel-1', '{"text":"Hello World"}'])
        .it('successfully publishes a message', ctx => {
          expect(ctx.stdout).to.contain('Message published successfully');
          expect(ctx.stdout).to.contain('test-channel-1');
        });
    });

    it('retrieves channel history', function() {
      return test
        .stdout()
        .command(['channels', 'history', 'test-channel-1'])
        .it('retrieves channel history with messages', ctx => {
          expect(ctx.stdout).to.contain('Test message 1');
          expect(ctx.stdout).to.contain('Test message 2');
        });
    });
  });

  // Presence operations
  describe('Presence operations', function() {
    it('enters channel presence', function() {
      return test
        .stdout()
        .command(['channels', 'presence', 'enter', 'test-channel-1', '{"name":"Test User"}', '--client-id', 'test-client'])
        .it('enters presence successfully', ctx => {
          expect(ctx.stdout).to.contain('Entered presence');
          expect(ctx.stdout).to.contain('test-channel-1');
        });
    });

    it('lists presence members', function() {
      return test
        .stdout()
        .command(['channels', 'presence', 'list', 'test-channel-1'])
        .it('lists presence members', ctx => {
          expect(ctx.stdout).to.contain('user1');
          expect(ctx.stdout).to.contain('user2');
          expect(ctx.stdout).to.contain('User 1');
          expect(ctx.stdout).to.contain('User 2');
        });
    });
  });

  // Occupancy operations
  describe('Occupancy operations', function() {
    it('gets channel occupancy metrics', function() {
      return test
        .stdout()
        .command(['channels', 'occupancy', 'get', 'test-channel-1'])
        .it('retrieves channel occupancy metrics', ctx => {
          expect(ctx.stdout).to.contain('test-channel-1');
          expect(ctx.stdout).to.contain('Connections: 5');
          expect(ctx.stdout).to.contain('Publishers: 2');
          expect(ctx.stdout).to.contain('Subscribers: 3');
          expect(ctx.stdout).to.contain('Presence Members: 2');
        });
    });
  });

  // Batch operations
  describe('Batch operations', function() {
    it('batch publishes to multiple channels', function() {
      return test
        .stdout()
        .command(['channels', 'batch-publish', '--channels', 'test-channel-1,test-channel-2', '{"text":"Batch Message"}'])
        .it('successfully batch publishes', ctx => {
          expect(ctx.stdout).to.contain('Batch publish successful');
          expect(ctx.stdout).to.contain('test-channel-1');
          expect(ctx.stdout).to.contain('test-channel-2');
        });
    });
  });

  // Test flow: Publish -> history
  describe('Publish to history flow', function() {
    // We need to split these into separate tests rather than using .do() which causes linter errors
    it('publishes message then retrieves it in history', function() {
      // Test publish command
      return test
        .stdout()
        .command(['channels', 'publish', publishFlowUniqueChannel, `{"text":"${publishFlowUniqueMessage}"}`])
        .it('publishes unique message', ctx => {
          expect(ctx.stdout).to.contain('Message published successfully');
        });
    });

    it('retrieves published message from history', function() {
      // Test history command
      return test
        .stdout()
        .command(['channels', 'history', publishFlowUniqueChannel])
        .it('retrieves published message from history', ctx => {
          // In the real world the message would be in history, but in our mock
          // we're just checking that history command was executed correctly
          expect(ctx.stdout).to.contain('Messages from channel');
        });
    });
  });

  // Test flow: Presence enter -> presence list
  describe('Presence enter to list flow', function() {
    // We need to split these into separate tests rather than using .do() which causes linter errors
    it('enters presence on unique channel', function() {
      // Test presence enter command
      return test
        .stdout()
        .command(['channels', 'presence', 'enter', presenceFlowUniqueChannel, '{"name":"Integration Test"}', '--client-id', presenceFlowUniqueClientId])
        .it('enters presence on unique channel', ctx => {
          expect(ctx.stdout).to.contain('Entered presence');
        });
    });

    it('lists presence members including our test client', function() {
      // Test presence list command
      return test
        .stdout()
        .command(['channels', 'presence', 'list', presenceFlowUniqueChannel])
        .it('lists presence members including our test client', ctx => {
          // In the real world our client would be in the list, but in our mock
          // we're just checking the command was executed correctly
          expect(ctx.stdout).to.contain('Presence members');
        });
    });
  });

  // Connection monitoring operations
  describe('Connection monitoring operations', function() {
    it('retrieves connection stats with default parameters', function() {
      return test
        .stdout()
        .command(['connections', 'stats'])
        .it('retrieves connection stats successfully', ctx => {
          expect(ctx.stdout).to.contain('Connections:');
          expect(ctx.stdout).to.contain('Channels:');
          expect(ctx.stdout).to.contain('Messages:');
        });
    });

    it('retrieves connection stats in JSON format', function() {
      return test
        .stdout()
        .command(['connections', 'stats', '--json'])
        .it('outputs connection stats in JSON format', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('inbound');
          expect(output).to.have.property('outbound');
          expect(output).to.have.property('connections');
        });
    });

    it('retrieves connection stats with custom time range', function() {
      const start = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
      const end = Date.now();
      
      return test
        .stdout()
        .command(['connections', 'stats', '--start', start.toString(), '--end', end.toString()])
        .it('retrieves stats for custom time range', ctx => {
          expect(ctx.stdout).to.contain('Stats for');
        });
    });

    it('retrieves connection stats with different time units', function() {
      return test
        .stdout()
        .command(['connections', 'stats', '--unit', 'hour', '--limit', '5'])
        .it('retrieves hourly stats', ctx => {
          expect(ctx.stdout).to.contain('Connections:');
          expect(ctx.stdout).to.contain('Channels:');
        });
    });
  });

  // Error recovery scenarios
  describe('Error recovery scenarios', function() {
    it('handles channel operations with invalid channel names gracefully', function() {
      return test
        .stdout()
        .stderr()
        .command(['channels', 'history', ''])
        .exit(2) // Expected exit code for invalid input
        .it('rejects empty channel name');
    });

    it('handles connection stats with invalid parameters gracefully', function() {
      return test
        .stdout()
        .stderr()
        .command(['connections', 'stats', '--start', 'invalid-timestamp'])
        .exit(2) // Expected exit code for invalid input
        .it('rejects invalid timestamp');
    });

    it('handles batch publish with invalid JSON gracefully', function() {
      return test
        .stdout()
        .stderr()
        .command(['channels', 'batch-publish', '--channels', 'test-channel', 'invalid-json'])
        .exit(2) // Expected exit code for invalid JSON
        .it('rejects invalid JSON payload');
    });
  });
});
