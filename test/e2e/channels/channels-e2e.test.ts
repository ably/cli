import { expect } from "chai";
import * as Ably from "ably";
import {
  E2E_API_KEY,
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  createAblyClient,
  publishTestMessage,
  forceExit,
  cleanupTrackedResources,
  testOutputFiles,
  testCommands,
  displayTestFailureDebugOutput
} from "../../helpers/e2e-test-helper.js";
import { runCommand } from "../../helpers/command-helpers.js";

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

describe('Channel E2E Tests', function() {
  // Skip all tests if API key not available
  // Set up vars for test data
  let historyChannel: string;
  let jsonHistoryChannel: string;
  let listChannel: string;

  before(async function() {
    if (SHOULD_SKIP_E2E) {
      this.skip();
    }
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
    process.removeListener('SIGINT', forceExit);
  });

  beforeEach(function() {
    this.timeout(120000); // 2 minutes per individual test
    // Clear tracked commands and output files before each test
    testOutputFiles.clear();
    testCommands.length = 0;
  });

  afterEach(async function() {
    // Display debug output if test failed
    if (this.currentTest?.state === 'failed') {
      await displayTestFailureDebugOutput(this.currentTest?.title);
    }
    await cleanupTrackedResources();
  });

  // Test channels list command with verification
    it('should list channels and verify test channel is included', async function() {
      // Run the CLI command
      const listResult = await runCommand(["channels", "list"], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      // Enhanced diagnostic error messages
      expect(listResult.exitCode, `Expected exit code 0, got ${listResult.exitCode}. Stderr: ${listResult.stderr}. Stdout: ${listResult.stdout}`).to.equal(0);
      
      if (!listResult.stdout || listResult.stdout.trim() === '') {
        throw new Error(`Command returned empty output. Exit code: ${listResult.exitCode}, Stderr: ${listResult.stderr}, Stdout length: ${listResult.stdout?.length || 0}`);
      }
      
      expect(listResult.stdout, `Expected stdout to contain 'Found', but got: ${listResult.stdout}. Exit code: ${listResult.exitCode}, Stderr: ${listResult.stderr}`).to.include("Found");

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
      const listResult = await runCommand(["channels", "list", "--json"], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      // Enhanced diagnostic error messages
      expect(listResult.exitCode, `Expected exit code 0, got ${listResult.exitCode}. Stderr: ${listResult.stderr}. Stdout: ${listResult.stdout}`).to.equal(0);
      
      if (!listResult.stdout || listResult.stdout.trim() === '') {
        throw new Error(`Command returned empty output. Exit code: ${listResult.exitCode}, Stderr: ${listResult.stderr}, Stdout length: ${listResult.stdout?.length || 0}`);
      }
      
      let result;
      try {
        result = JSON.parse(listResult.stdout);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON output. Parse error: ${parseError}. Exit code: ${listResult.exitCode}, Stderr: ${listResult.stderr}, Stdout: ${listResult.stdout}`);
      }
      expect(result).to.have.property("success", true);
      expect(result).to.have.property("channels").that.is.an("array");
      expect(result).to.have.property("timestamp").that.is.a("string");

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

      // First publish the message
      const publishResult = await runCommand(["channels", "publish", uniqueChannel, JSON.stringify(messageData)], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      // Enhanced diagnostic error messages
      expect(publishResult.exitCode, `Publish failed - Expected exit code 0, got ${publishResult.exitCode}. Stderr: ${publishResult.stderr}. Stdout: ${publishResult.stdout}`).to.equal(0);
      
      if (!publishResult.stdout || publishResult.stdout.trim() === '') {
        throw new Error(`Publish command returned empty output. Exit code: ${publishResult.exitCode}, Stderr: ${publishResult.stderr}, Stdout length: ${publishResult.stdout?.length || 0}`);
      }
      
      expect(publishResult.stdout, `Expected publish stdout to contain success message, but got: ${publishResult.stdout}. Exit code: ${publishResult.exitCode}, Stderr: ${publishResult.stderr}`).to.contain(`Message published successfully to channel "${uniqueChannel}"`);

      // Add a delay to ensure message is stored and available in history
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Then check history
      const historyResult = await runCommand(["channels", "history", uniqueChannel], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      // Enhanced diagnostic error messages for history check
      expect(historyResult.exitCode, `History failed - Expected exit code 0, got ${historyResult.exitCode}. Stderr: ${historyResult.stderr}. Stdout: ${historyResult.stdout}`).to.equal(0);
      
      if (!historyResult.stdout || historyResult.stdout.trim() === '') {
        throw new Error(`History command returned empty output. Exit code: ${historyResult.exitCode}, Stderr: ${historyResult.stderr}, Stdout length: ${historyResult.stdout?.length || 0}`);
      }
      
      expect(historyResult.stdout, `Expected history stdout to contain 'E2E Test Message', but got: ${historyResult.stdout}. Exit code: ${historyResult.exitCode}, Stderr: ${historyResult.stderr}`).to.contain("E2E Test Message");
    });

    // Test history with verification
    it('should retrieve message history and verify contents', async function() {
      // First run the CLI command
      const historyResult = await runCommand(["channels", "history", historyChannel], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      // Enhanced diagnostic error messages
      expect(historyResult.exitCode, `History failed - Expected exit code 0, got ${historyResult.exitCode}. Stderr: ${historyResult.stderr}. Stdout: ${historyResult.stdout}`).to.equal(0);
      
      if (!historyResult.stdout || historyResult.stdout.trim() === '') {
        throw new Error(`History command returned empty output. Exit code: ${historyResult.exitCode}, Stderr: ${historyResult.stderr}, Stdout length: ${historyResult.stdout?.length || 0}`);
      }
      
      expect(historyResult.stdout, `Expected history stdout to contain 'Found', but got: ${historyResult.stdout}. Exit code: ${historyResult.exitCode}, Stderr: ${historyResult.stderr}`).to.contain("Found");
      expect(historyResult.stdout, `Expected history stdout to contain 'E2E History Test', but got: ${historyResult.stdout}. Exit code: ${historyResult.exitCode}, Stderr: ${historyResult.stderr}`).to.contain("E2E History Test");

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
      const historyResult = await runCommand(["channels", "history", jsonHistoryChannel, "--json"], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      // Enhanced diagnostic error messages
      expect(historyResult.exitCode, `JSON History failed - Expected exit code 0, got ${historyResult.exitCode}. Stderr: ${historyResult.stderr}. Stdout: ${historyResult.stdout}`).to.equal(0);
      
      if (!historyResult.stdout || historyResult.stdout.trim() === '') {
        throw new Error(`JSON History command returned empty output. Exit code: ${historyResult.exitCode}, Stderr: ${historyResult.stderr}, Stdout length: ${historyResult.stdout?.length || 0}`);
      }
      
      let result;
      try {
        result = JSON.parse(historyResult.stdout);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON history output. Parse error: ${parseError}. Exit code: ${historyResult.exitCode}, Stderr: ${historyResult.stderr}, Stdout: ${historyResult.stdout}`);
      }
      expect(result).to.have.property("messages").that.is.an("array");
      expect(result.messages.length).to.be.at.least(1);

      const testMsg = result.messages.find((msg: any) =>
        msg.data && typeof msg.data === 'object' && msg.data.text === "JSON History Test"
      );
      expect(testMsg).to.exist;

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

      // First batch publish the message
      const batchPublishResult = await runCommand(["channels", "batch-publish", "--channels", batchChannel, JSON.stringify(messageData)], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      // Enhanced diagnostic error messages
      expect(batchPublishResult.exitCode, `Batch publish failed - Expected exit code 0, got ${batchPublishResult.exitCode}. Stderr: ${batchPublishResult.stderr}. Stdout: ${batchPublishResult.stdout}`).to.equal(0);
      
      if (!batchPublishResult.stdout || batchPublishResult.stdout.trim() === '') {
        throw new Error(`Batch publish command returned empty output. Exit code: ${batchPublishResult.exitCode}, Stderr: ${batchPublishResult.stderr}, Stdout length: ${batchPublishResult.stdout?.length || 0}`);
      }
      
      expect(batchPublishResult.stdout, `Expected batch publish stdout to contain 'Batch publish successful', but got: ${batchPublishResult.stdout}. Exit code: ${batchPublishResult.exitCode}, Stderr: ${batchPublishResult.stderr}`).to.contain("Batch publish successful");

      // Add a delay to ensure message is stored and available in history
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Then check history
      const batchHistoryResult = await runCommand(["channels", "history", batchChannel], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      // Enhanced diagnostic error messages for batch history check
      expect(batchHistoryResult.exitCode, `Batch history failed - Expected exit code 0, got ${batchHistoryResult.exitCode}. Stderr: ${batchHistoryResult.stderr}. Stdout: ${batchHistoryResult.stdout}`).to.equal(0);
      
      if (!batchHistoryResult.stdout || batchHistoryResult.stdout.trim() === '') {
        throw new Error(`Batch history command returned empty output. Exit code: ${batchHistoryResult.exitCode}, Stderr: ${batchHistoryResult.stderr}, Stdout length: ${batchHistoryResult.stdout?.length || 0}`);
      }
      
      expect(batchHistoryResult.stdout, `Expected batch history stdout to contain 'Batch Message 1', but got: ${batchHistoryResult.stdout}. Exit code: ${batchHistoryResult.exitCode}, Stderr: ${batchHistoryResult.stderr}`).to.contain("Batch Message 1");
    });

    // Test publishing multiple messages with count and verification
    it('should publish multiple messages with count parameter and verify they were published', async function() {
      const expectedMessages = ["Message number 1", "Message number 2", "Message number 3"];
      const countChannel = getUniqueChannelName("count");

      // First publish multiple messages
      const countPublishResult = await runCommand(["channels", "publish", countChannel, "Message number {{.Count}}", "--count", "3"], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      // Enhanced diagnostic error messages
      expect(countPublishResult.exitCode, `Count publish failed - Expected exit code 0, got ${countPublishResult.exitCode}. Stderr: ${countPublishResult.stderr}. Stdout: ${countPublishResult.stdout}`).to.equal(0);
      
      if (!countPublishResult.stdout || countPublishResult.stdout.trim() === '') {
        throw new Error(`Count publish command returned empty output. Exit code: ${countPublishResult.exitCode}, Stderr: ${countPublishResult.stderr}, Stdout length: ${countPublishResult.stdout?.length || 0}`);
      }
      
      expect(countPublishResult.stdout, `Expected count publish stdout to contain 'Message 1 published successfully', but got: ${countPublishResult.stdout}. Exit code: ${countPublishResult.exitCode}, Stderr: ${countPublishResult.stderr}`).to.contain("Message 1 published successfully");
      expect(countPublishResult.stdout, `Expected count publish stdout to contain 'Message 2 published successfully', but got: ${countPublishResult.stdout}. Exit code: ${countPublishResult.exitCode}, Stderr: ${countPublishResult.stderr}`).to.contain("Message 2 published successfully");
      expect(countPublishResult.stdout, `Expected count publish stdout to contain 'Message 3 published successfully', but got: ${countPublishResult.stdout}. Exit code: ${countPublishResult.exitCode}, Stderr: ${countPublishResult.stderr}`).to.contain("Message 3 published successfully");
      expect(countPublishResult.stdout, `Expected count publish stdout to contain '3/3 messages published successfully', but got: ${countPublishResult.stdout}. Exit code: ${countPublishResult.exitCode}, Stderr: ${countPublishResult.stderr}`).to.contain("3/3 messages published successfully");

      // Add a delay to ensure messages are stored and available in history
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Then check history
      const countHistoryResult = await runCommand(["channels", "history", countChannel], {
        env: { ABLY_API_KEY: E2E_API_KEY || "" },
        timeoutMs: 30000
      });
      
      // Enhanced diagnostic error messages for count history check
      expect(countHistoryResult.exitCode, `Count history failed - Expected exit code 0, got ${countHistoryResult.exitCode}. Stderr: ${countHistoryResult.stderr}. Stdout: ${countHistoryResult.stdout}`).to.equal(0);
      
      if (!countHistoryResult.stdout || countHistoryResult.stdout.trim() === '') {
        throw new Error(`Count history command returned empty output. Exit code: ${countHistoryResult.exitCode}, Stderr: ${countHistoryResult.stderr}, Stdout length: ${countHistoryResult.stdout?.length || 0}`);
      }
      
      for (const expectedMsg of expectedMessages) {
        expect(countHistoryResult.stdout, `Expected count history stdout to contain '${expectedMsg}', but got: ${countHistoryResult.stdout}. Exit code: ${countHistoryResult.exitCode}, Stderr: ${countHistoryResult.stderr}`).to.contain(expectedMsg);
      }
    });
});
