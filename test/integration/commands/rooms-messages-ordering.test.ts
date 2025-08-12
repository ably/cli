import { expect } from "chai";
import { test } from "@oclif/test";

describe('Rooms messages send ordering integration tests', function() {
  let originalEnv: NodeJS.ProcessEnv;
  let sentMessages: Array<{ text: string; timestamp: number }>;
  let sendFunction: (message: any) => Promise<void>;

  beforeEach(function() {
    // Store original env vars
    originalEnv = { ...process.env };
    sentMessages = [];

    // Create a function that tracks sent messages with timestamps
    sendFunction = async (message: any) => {
      sentMessages.push({
        text: message.text,
        timestamp: Date.now()
      });
      // Simulate some network latency
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      return;
    };

    // Create mock Chat client
    const mockChatClient = {
      rooms: {
        get: () => ({
          attach: async () => {},
          messages: {
            send: sendFunction
          }
        }),
        release: async () => {}
      }
    };

    const mockAblyClient = {
      connection: {
        on: () => {},
        state: 'connected'
      },
      close: () => {}
    };

    // Make the mocks globally available
    globalThis.__TEST_MOCKS__ = {
      ablyRestMock: {}, // Required by base type
      ablyChatMock: mockChatClient,
      ablyRealtimeMock: mockAblyClient
    };

    process.env.ABLY_TEST_MODE = 'true';
    process.env.ABLY_SUPPRESS_PROCESS_EXIT = 'true';
    process.env.ABLY_KEY = 'test_key';
  });

  afterEach(function() {
    process.env = originalEnv;
    delete globalThis.__TEST_MOCKS__;
  });

  describe('Message delay and ordering', function() {
    it('should have 40ms default delay between messages', function() {
      const startTime = Date.now();
      return test
        .stdout()
        .command(['rooms:messages:send', 'test-room', 'Message {{.Count}}', '--count', '3'])
        .it('applies default 40ms delay', ctx => {
          expect(ctx.stdout).to.include('Sending 3 messages with 40ms delay');
          expect(ctx.stdout).to.include('3/3 messages sent successfully');
          
          // Check that messages were sent with appropriate delays
          expect(sentMessages).to.have.lengthOf(3);
          
          // Check message order
          expect(sentMessages[0].text).to.equal('Message 1');
          expect(sentMessages[1].text).to.equal('Message 2');
          expect(sentMessages[2].text).to.equal('Message 3');
          
          // Check timing - should take at least 80ms (2 delays of 40ms)
          const totalTime = Date.now() - startTime;
          expect(totalTime).to.be.at.least(80);
        });
    });

    it('should respect custom delay value', function() {
      const startTime = Date.now();
      return test
        .stdout()
        .command(['rooms:messages:send', 'test-room', 'Message {{.Count}}', '--count', '3', '--delay', '100'])
        .it('applies custom delay', ctx => {
          expect(ctx.stdout).to.include('Sending 3 messages with 100ms delay');
          expect(ctx.stdout).to.include('3/3 messages sent successfully');
          
          // Check timing - should take at least 200ms (2 delays of 100ms)
          const totalTime = Date.now() - startTime;
          expect(totalTime).to.be.at.least(200);
        });
    });

    it('should enforce minimum 40ms delay even if lower value specified', function() {
      const startTime = Date.now();
      return test
        .stdout()
        .command(['rooms:messages:send', 'test-room', 'Message {{.Count}}', '--count', '3', '--delay', '10'])
        .it('enforces minimum delay', ctx => {
          // Should use 40ms instead of 10ms
          expect(ctx.stdout).to.include('Sending 3 messages with 40ms delay');
          expect(ctx.stdout).to.include('3/3 messages sent successfully');
          
          // Check timing - should take at least 80ms (2 delays of 40ms)
          const totalTime = Date.now() - startTime;
          expect(totalTime).to.be.at.least(80);
        });
    });

    it('should send messages in sequential order with delay', function() {
      return test
        .stdout()
        .command(['rooms:messages:send', 'test-room', 'Message {{.Count}}', '--count', '5'])
        .it('maintains message order', _ctx => {
          expect(sentMessages).to.have.lengthOf(5);
          
          // Verify messages are in correct order
          for (let i = 0; i < 5; i++) {
            expect(sentMessages[i].text).to.equal(`Message ${i + 1}`);
          }
          
          // Verify timestamps are sequential (each should be at least 40ms apart)
          for (let i = 1; i < sentMessages.length; i++) {
            const timeDiff = sentMessages[i].timestamp - sentMessages[i - 1].timestamp;
            expect(timeDiff).to.be.at.least(35); // Allow some margin for timer precision
          }
        });
    });
  });

  describe('Single message sending', function() {
    it('should send single message without delay', function() {
      return test
        .stdout()
        .command(['rooms:messages:send', 'test-room', 'Single message'])
        .it('sends single message immediately', ctx => {
          expect(ctx.stdout).to.include('Message sent successfully');
          expect(sentMessages).to.have.lengthOf(1);
          expect(sentMessages[0].text).to.equal('Single message');
        });
    });
  });

  describe('Error handling with multiple messages', function() {
    it('should continue sending remaining messages on error', function() {
      // Override the send function to make the 3rd message fail
      let callCount = 0;
      const failingSendFunction = async (message: any) => {
        callCount++;
        if (callCount === 3) {
          throw new Error('Network error');
        }
        sentMessages.push({
          text: message.text,
          timestamp: Date.now()
        });
        return;
      };
      
      // Update the mock to use the failing function
      if (globalThis.__TEST_MOCKS__?.ablyChatMock) {
        globalThis.__TEST_MOCKS__.ablyChatMock.rooms.get = () => ({
          attach: async () => {},
          messages: {
            send: failingSendFunction
          }
        });
      }

      return test
        .stdout()
        .command(['rooms:messages:send', 'test-room', 'Message {{.Count}}', '--count', '5'])
        .it('handles errors gracefully', ctx => {
          expect(ctx.stdout).to.include('4/5 messages sent successfully (1 errors)');
          expect(sentMessages).to.have.lengthOf(4);
        });
    });
  });
});