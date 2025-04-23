import { expect, test } from "@oclif/test";
import * as Ably from "ably";
import { randomUUID } from "node:crypto";
import Mocha from "mocha";

// Generate unique test channel names to avoid collisions
function getUniqueChannelName(prefix: string): string {
  return `${prefix}-test-${randomUUID()}`;
}

// Helper to create an Ably client for setup/teardown
function createAblyClient(): Ably.Rest {
  if (!process.env.E2E_ABLY_API_KEY) {
    throw new Error("E2E_ABLY_API_KEY environment variable is required for E2E tests");
  }

  return new Ably.Rest({
    key: process.env.E2E_ABLY_API_KEY,
    clientId: `cli-e2e-test-${randomUUID()}`
  });
}

// Helper to publish a test message for history tests
async function publishTestMessage(channelName: string, messageData: any): Promise<void> {
  const client = createAblyClient();
  const channel = client.channels.get(channelName);
  await channel.publish("test-event", messageData);
  // No need to close - Rest client doesn't maintain connection
}

// Helper to fetch channel history
async function getChannelHistory(channelName: string): Promise<Ably.Message[]> {
  const client = createAblyClient();
  const channel = client.channels.get(channelName);
  const historyPage = await channel.history();
  return historyPage.items;
}

// Helper to list all channels
async function listAllChannels(): Promise<string[]> {
  const client = createAblyClient();
  const result = await client.request('get', '/channels', 2, {}, null);
  if (!result.items) return [];
  return result.items.map((channel: any) => channel.channelId);
}

// Helper to retry for up to N seconds with a check function
async function retryUntilSuccess<T>(
  checkFn: () => Promise<T>,
  validator: (result: T) => boolean,
  maxWaitSeconds = 10,
  intervalMs = 500
): Promise<T> {
  let totalWaitTime = 0;
  let lastResult: T;

  while (totalWaitTime < maxWaitSeconds * 1000) {
    lastResult = await checkFn();
    if (validator(lastResult)) {
      return lastResult;
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    totalWaitTime += intervalMs;
  }

  // Return last result even if not valid, for assertion failures
  return lastResult!;
}

// Force exit function to prevent tests from hanging
function forceExit() {
  process.exit(0);
}

// Skip tests if API key not available
const shouldSkip = !process.env.E2E_ABLY_API_KEY || process.env.SKIP_E2E_TESTS === 'true';
if (shouldSkip) {
  // Use mocha's describe.skip to skip all tests
  // This avoids the linter errors from member expressions in describe blocks
  Mocha.describe.skip('Channel E2E Tests', () => {
    it('skipped tests', function() {
      // Test is skipped
    });
  });
} else {
  // Regular tests when API key is available
  describe('Channel E2E Tests', function() {
    // Set up vars for test data
    let historyChannel: string;
    let jsonHistoryChannel: string;
    let listChannel: string;

    before(async function() {
      // Add handler for interrupt signal
      process.on('SIGINT', forceExit);

      try {
        // Set up unique channel names for the tests
        historyChannel = getUniqueChannelName("history");
        jsonHistoryChannel = getUniqueChannelName("json-history");
        listChannel = getUniqueChannelName("list");

        // Set up history test data
        await publishTestMessage(historyChannel, { text: "E2E History Test" });
        await publishTestMessage(jsonHistoryChannel, { text: "JSON History Test" });
        await publishTestMessage(listChannel, { text: "List Test" });
      } catch (error) {
        console.warn("Warning: Setup failed, tests may not function correctly:", error);
        // Don't fail the entire test suite, let individual tests fail if needed
      }
    });

    after(function() {
      // Remove interrupt handler
      process.removeListener('SIGINT', forceExit);
    });

    // Test channels list command with verification
    it('should list channels and verify test channel is included', async function() {
      // First run the CLI command
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || "" })
        .stdout()
        .command(["channels", "list"])
        .it('lists channels with test channel', async (ctx) => {
          // Verify CLI output
          expect(ctx.stdout).to.include("Found");
        });

      // Now verify with SDK in a separate step
      const allChannels = await retryUntilSuccess(
        listAllChannels,
        channels => channels.includes(listChannel),
        15
      );

      const channelExists = allChannels.includes(listChannel);
      expect(channelExists, `Channel ${listChannel} should exist in the channel list`).to.be.true;
    });

    // Test channels list with JSON output and verification
    it('should list channels in JSON format and verify test channel is included', async function() {
      // First run the CLI command
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || "" })
        .stdout()
        .command(["channels", "list", "--json"])
        .it('lists channels in JSON format with test channel', async (ctx) => {
          // Verify CLI output
          const result = JSON.parse(ctx.stdout);
          expect(result).to.have.property("success", true);
          expect(result).to.have.property("channels").that.is.an("array");
          expect(result).to.have.property("timestamp").that.is.a("string");
        });

      // Now verify with SDK in a separate step
      const allChannels = await retryUntilSuccess(
        listAllChannels,
        channels => channels.includes(listChannel),
        15
      );

      const foundChannel = allChannels.includes(listChannel);
      expect(foundChannel, `Channel ${listChannel} should exist in channel list`).to.be.true;
    });

    // Test publishing with verification
    it('should publish a message to a channel and verify it was published', async function() {
      const messageData = { data: "E2E Test Message" };
      const uniqueChannel = getUniqueChannelName("cli");

      // First publish the message using the test framework
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || "" })
        .stdout()
        .command(["channels", "publish", uniqueChannel, JSON.stringify(messageData)])
        .it('publishes a message to channel', async (ctx) => {
          // Verify CLI output
          expect(ctx.stdout).to.contain(`Message published successfully to channel "${uniqueChannel}"`);
        });

      // Add a delay to ensure message is stored and available in history
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Then check history with the test framework
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || "" })
        .stdout()
        .command(["channels", "history", uniqueChannel])
        .it('retrieves published message from history', async (ctx) => {
          // Verify output contains our message
          expect(ctx.stdout).to.contain("E2E Test Message");
        });
    });

    // Test history with verification
    it('should retrieve message history and verify contents', async function() {
      // First run the CLI command
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || "" })
        .stdout()
        .command(["channels", "history", historyChannel])
        .it('retrieves history with expected content', async (ctx) => {
          // Verify CLI output
          expect(ctx.stdout).to.contain("Found");
          expect(ctx.stdout).to.contain("E2E History Test");
        });

      // Now verify with SDK in a separate step outside of Oclif's callback
      const history = await getChannelHistory(historyChannel);
      expect(history.length).to.be.at.least(1, "History channel should have at least one message");

      const testMsg = history.find(msg =>
        msg.data && typeof msg.data === 'object' && msg.data.text === "E2E History Test");

      expect(testMsg, "History test message should be retrievable via SDK").to.exist;
    });

    // Test JSON history with verification
    it('should retrieve message history in JSON format and verify contents', async function() {
      // First run the CLI command
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || "" })
        .stdout()
        .command(["channels", "history", jsonHistoryChannel, "--json"])
        .it('retrieves JSON history with expected content', async (ctx) => {
          // Verify CLI output
          const result = JSON.parse(ctx.stdout);
          expect(result).to.have.property("messages").that.is.an("array");
          expect(result.messages.length).to.be.at.least(1);

          const testMsg = result.messages.find((msg: any) =>
            msg.data && typeof msg.data === 'object' && msg.data.text === "JSON History Test"
          );
          expect(testMsg).to.exist;
        });

      // Now verify with SDK in a separate step
      const history = await getChannelHistory(jsonHistoryChannel);
      expect(history.length).to.be.at.least(1, "JSON history channel should have at least one message");

      const sdkMsg = history.find(msg =>
        msg.data && typeof msg.data === 'object' && msg.data.text === "JSON History Test");

      expect(sdkMsg, "JSON history test message should be retrievable via SDK").to.exist;
    });

    // Test batch publish with verification
    it('should batch publish messages and verify they were published', async function() {
      const messageData = { data: "Batch Message 1" };
      const batchChannel = getUniqueChannelName("batch");

      // First batch publish the message using the test framework
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || "" })
        .stdout()
        .command(["channels", "batch-publish", "--channels", batchChannel, JSON.stringify(messageData)])
        .it('batch publishes a message to channel', async (ctx) => {
          // Verify CLI output
          expect(ctx.stdout).to.contain("Batch publish successful");
        });

      // Add a delay to ensure message is stored and available in history
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Then check history with the test framework
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || "" })
        .stdout()
        .command(["channels", "history", batchChannel])
        .it('retrieves batch published message from history', async (ctx) => {
          // Verify output contains our message
          expect(ctx.stdout).to.contain("Batch Message 1");
        });
    });

    // Test publishing multiple messages with count and verification
    it('should publish multiple messages with count parameter and verify they were published', async function() {
      const expectedMessages = ["Message number 1", "Message number 2", "Message number 3"];
      const countChannel = getUniqueChannelName("count");

      // First publish multiple messages using the test framework
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || "" })
        .stdout()
        .command(["channels", "publish", countChannel, "Message number {{.Count}}", "--count", "3"])
        .it('publishes multiple messages to channel', async (ctx) => {
          // Verify CLI output
          expect(ctx.stdout).to.contain("Message 1 published successfully");
          expect(ctx.stdout).to.contain("Message 2 published successfully");
          expect(ctx.stdout).to.contain("Message 3 published successfully");
          expect(ctx.stdout).to.contain("3/3 messages published successfully");
        });

      // Add a delay to ensure messages are stored and available in history
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Then check history with the test framework
      await test
        .timeout(30000)
        .env({ ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || "" })
        .stdout()
        .command(["channels", "history", countChannel])
        .it('retrieves multiple published messages from history', async (ctx) => {
          // Verify output contains our messages
          for (const expectedMsg of expectedMessages) {
            expect(ctx.stdout).to.contain(expectedMsg);
          }
        });
    });
  });
}
