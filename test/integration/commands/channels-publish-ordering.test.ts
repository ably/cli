import { expect } from "chai";
import { test } from "@oclif/test";

describe('Channels publish ordering integration tests', function() {
  let originalEnv: NodeJS.ProcessEnv;
  let publishedMessages: Array<{ data: string; timestamp: number }>;
  let realtimeConnectionUsed: boolean;

  beforeEach(function() {
    // Store original env vars
    originalEnv = { ...process.env };
    publishedMessages = [];
    realtimeConnectionUsed = false;

    // Create a function that tracks published messages with timestamps
    const publishFunction = async (message: any) => {
      publishedMessages.push({
        data: message.data,
        timestamp: Date.now()
      });
      // Simulate some network latency
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      return;
    };

    // Create mock Ably clients
    const mockRealtimeClient = {
      channels: {
        get: () => ({
          publish: publishFunction
        })
      },
      connection: {
        once: (event: string, callback: () => void) => {
          realtimeConnectionUsed = true;
          if (event === 'connected') {
            setTimeout(callback, 0);
          }
        },
        on: () => {},
        state: 'connected'
      },
      close: () => {}
    };

    const mockRestClient = {
      channels: {
        get: () => ({
          publish: publishFunction
        })
      }
    };

    // Make the mocks globally available
    globalThis.__TEST_MOCKS__ = {
      ablyRealtimeMock: mockRealtimeClient,
      ablyRestMock: mockRestClient
    };

    process.env.ABLY_TEST_MODE = 'true';
    process.env.ABLY_SUPPRESS_PROCESS_EXIT = 'true';
    process.env.ABLY_KEY = 'test_key';
  });

  afterEach(function() {
    process.env = originalEnv;
    delete globalThis.__TEST_MOCKS__;
  });

  describe('Multiple message publishing', function() {
    it('should use realtime transport by default when publishing multiple messages', function() {
      return test
        .stdout()
        .command(['channels:publish', 'test-channel', 'Message {{.Count}}', '--count', '3'])
        .it('uses realtime transport for multiple messages', ctx => {
          expect(ctx.stdout).to.include('3/3 messages published successfully');
          // Should have used realtime connection
          expect(realtimeConnectionUsed).to.be.true;
        });
    });

    it('should respect explicit rest transport flag', function() {
      return test
        .stdout()
        .command(['channels:publish', 'test-channel', 'Message {{.Count}}', '--count', '3', '--transport', 'rest'])
        .it('uses rest transport when explicitly specified', ctx => {
          expect(ctx.stdout).to.include('3/3 messages published successfully');
          // Should not have used realtime connection
          expect(realtimeConnectionUsed).to.be.false;
        });
    });

    it('should use rest transport for single message by default', function() {
      return test
        .stdout()
        .command(['channels:publish', 'test-channel', 'Single message'])
        .it('uses rest transport for single message', ctx => {
          expect(ctx.stdout).to.include('Message published successfully');
          // Should not have used realtime connection
          expect(realtimeConnectionUsed).to.be.false;
        });
    });
  });

  describe('Message delay and ordering', function() {
    it('should have 40ms default delay between messages', function() {
      const startTime = Date.now();
      return test
        .stdout()
        .command(['channels:publish', 'test-channel', 'Message {{.Count}}', '--count', '3'])
        .it('applies default 40ms delay', ctx => {
          expect(ctx.stdout).to.include('Publishing 3 messages with 40ms delay');
          expect(ctx.stdout).to.include('3/3 messages published successfully');
          
          // Check that messages were published with appropriate delays
          expect(publishedMessages).to.have.lengthOf(3);
          
          // Check message order
          expect(publishedMessages[0].data).to.equal('Message 1');
          expect(publishedMessages[1].data).to.equal('Message 2');
          expect(publishedMessages[2].data).to.equal('Message 3');
          
          // Check timing - should take at least 80ms (2 delays of 40ms)
          const totalTime = Date.now() - startTime;
          expect(totalTime).to.be.at.least(80);
        });
    });

    it('should respect custom delay value', function() {
      const startTime = Date.now();
      return test
        .stdout()
        .command(['channels:publish', 'test-channel', 'Message {{.Count}}', '--count', '3', '--delay', '100'])
        .it('applies custom delay', ctx => {
          expect(ctx.stdout).to.include('Publishing 3 messages with 100ms delay');
          expect(ctx.stdout).to.include('3/3 messages published successfully');
          
          // Check timing - should take at least 200ms (2 delays of 100ms)
          const totalTime = Date.now() - startTime;
          expect(totalTime).to.be.at.least(200);
        });
    });

    it('should allow zero delay when explicitly set', function() {
      return test
        .stdout()
        .command(['channels:publish', 'test-channel', 'Message {{.Count}}', '--count', '3', '--delay', '0'])
        .it('allows zero delay when explicit', ctx => {
          expect(ctx.stdout).to.include('Publishing 3 messages with 0ms delay');
          expect(ctx.stdout).to.include('3/3 messages published successfully');
        });
    });

    it('should publish messages in sequential order with delay', function() {
      return test
        .stdout()
        .command(['channels:publish', 'test-channel', 'Message {{.Count}}', '--count', '5'])
        .it('maintains message order', _ctx => {
          expect(publishedMessages).to.have.lengthOf(5);
          
          // Verify messages are in correct order
          for (let i = 0; i < 5; i++) {
            expect(publishedMessages[i].data).to.equal(`Message ${i + 1}`);
          }
          
          // Verify timestamps are sequential (each should be at least 40ms apart)
          for (let i = 1; i < publishedMessages.length; i++) {
            const timeDiff = publishedMessages[i].timestamp - publishedMessages[i - 1].timestamp;
            expect(timeDiff).to.be.at.least(35); // Allow some margin for timer precision
          }
        });
    });
  });

  describe('Error handling with multiple messages', function() {
    it('should continue publishing remaining messages on error', function() {
      // Override the publish function to make the 3rd message fail
      let callCount = 0;
      const failingPublishFunction = async (message: any) => {
        callCount++;
        if (callCount === 3) {
          throw new Error('Network error');
        }
        publishedMessages.push({
          data: message.data,
          timestamp: Date.now()
        });
        return;
      };
      
      // Update both mocks to use the failing function
      if (globalThis.__TEST_MOCKS__) {
        globalThis.__TEST_MOCKS__.ablyRealtimeMock.channels.get = () => ({
          publish: failingPublishFunction
        });
        globalThis.__TEST_MOCKS__.ablyRestMock.channels.get = () => ({
          publish: failingPublishFunction
        });
      }

      return test
        .stdout()
        .command(['channels:publish', 'test-channel', 'Message {{.Count}}', '--count', '5'])
        .it('handles errors gracefully', ctx => {
          expect(ctx.stdout).to.include('4/5 messages published successfully (1 errors)');
          expect(publishedMessages).to.have.lengthOf(4);
        });
    });
  });
});