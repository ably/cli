import { expect } from "chai";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
// import { AblyTestEnvironment } from "test/helpers/ably-test-environment.js"; // Removed as not strictly needed and causing import error

// Path to the compiled CLI entry point
const cliPath = resolve(process.cwd(), "bin/run.js");

// Toggle for verbose child-process output during debugging (opt-in via env)
const DEBUG_OUTPUT = Boolean(process.env.ABLY_CLI_TEST_SHOW_OUTPUT);

// Default timeout for test steps
const DEFAULT_TIMEOUT = 30_000; // 30 seconds

describe("E2E: ably bench publisher and subscriber", function () {
  this.timeout(DEFAULT_TIMEOUT * 4); // Allow more time for the whole suite (was * 2, then *3, now *4 = 120s)

  let testChannel: string;
  let apiKey: string;

  before(async function () {
    if (!process.env.ABLY_API_KEY) {
      this.skip(); // Skip tests if ABLY_API_KEY is not set
    }
    apiKey = process.env.ABLY_API_KEY;
    testChannel = `cli-e2e-bench-${Date.now()}`;
  });

  it("should run publisher and subscriber, and report correct message counts", async function () {
    const messageCount = 20; // Small number for a quick test
    const messageRate = 10;

    let subscriberProcess: ChildProcessWithoutNullStreams | null = null;
    let publisherProcess: ChildProcessWithoutNullStreams | null = null;

    let subscriberOutput = "";
    let publisherOutput = "";
    let subscriberReady = false;
    let testError: Error | null = null; // To store any error that occurs
    let subscriberSummaryEntry: any = null; // Capture testFinished entry

    try {
      // 1. Start Subscriber (Restored original command)
      const subscriberPromise = new Promise<void>((resolveSubscriber, rejectSubscriber) => {
        // console.log("Spawning original subscriber command..."); // Debug
        subscriberProcess = spawn(
          "node",
          [cliPath, "bench", "subscriber", testChannel, "--api-key", apiKey, "--json", "--verbose"],
          { env: { ...process.env, ABLY_CLI_TEST_MODE: undefined } }, 
        );

        subscriberProcess.stdout.on("data", (data) => {
          const outputChunk = data.toString();
          if (DEBUG_OUTPUT) process.stdout.write(`[DEBUG_SUB_OUT] ${outputChunk}`); // Pipe to main stdout only if debugging
          subscriberOutput += outputChunk;
          let lastProcessedIndex = 0;
          let newlineIndex;
          while ((newlineIndex = subscriberOutput.indexOf("\n", lastProcessedIndex)) !== -1) {
            const line = subscriberOutput.slice(lastProcessedIndex, newlineIndex).trim();
            lastProcessedIndex = newlineIndex + 1;
            // console.log(`PARSING SUBSCRIBER LINE: >>>${line}<<<`); // Debug
            if (line === "") continue;
            try {
              const logEntry = JSON.parse(line);
              // console.log("PARSED SUBSCRIBER JSON: ", logEntry); // Debug
              if (
                logEntry.component === "benchmark" &&
                logEntry.event === "subscriberReady" &&
                !subscriberReady
              ) {
                subscriberReady = true;
              }
              if (logEntry.component === "benchmark" && logEntry.event === "testFinished") {
                // console.log("!!! SUBSCRIBER FINISHED DETECTED VIA JSON !!!"); // Debug
                subscriberSummaryEntry = logEntry; // store for later assertions
                resolveSubscriber();
              }
            } catch (_ignored) {
              // console.error(`ERROR PARSING SUBSCRIBER JSON LINE: "${line}", ERROR: ${_ignored}`); // Debug
            }
          }
          subscriberOutput = subscriberOutput.slice(lastProcessedIndex);
        });

        subscriberProcess.stderr.on("data", (data) => {
          const errorChunk = data.toString();
          if (DEBUG_OUTPUT) {
            process.stderr.write(`[DEBUG_SUB_ERR] ${errorChunk}`); // Pipe to main stderr
            console.error(`SUBSCRIBER STDERR: ${errorChunk.trim()}`);
          }
        });

        subscriberProcess.on("error", (err) => {
          // console.error("SUBSCRIBER SPAWN ERROR: ", err); // Debug
          rejectSubscriber(err);
        });
        subscriberProcess.on("close", (code) => {
          // console.log(`SUBSCRIBER CLOSED WITH CODE: ${code}`); // Debug
          if (code !== 0 && code !== null) { 
            // eslint-disable-next-line unicorn/no-negated-condition
            if (!publisherOutput.includes("testCompleted")) {
              rejectSubscriber(new Error(`Subscriber process exited with code ${code}. Full Output:\n${subscriberOutput}\nStderr:\n${subscriberProcess?.stderr?.toString() || "N/A"}`));
            } else {
              resolveSubscriber(); 
            }
          } else {
            resolveSubscriber();
          }
        });
      });

      // 2. Wait for Subscriber to be ready
      // console.log("Waiting for subscriber to be ready..."); // Debug
      await new Promise<void>((resolveWait, rejectWait) => {
        const waitTimeout = setTimeout(() => {
          // console.error("Timeout waiting for subscriber ready signal."); // Debug
          rejectWait(new Error("Timeout waiting for subscriber to become ready."));
        }, DEFAULT_TIMEOUT);
        const interval = setInterval(() => {
          if (subscriberReady) {
            // console.log("Subscriber is ready, proceeding to start publisher."); // Debug
            clearTimeout(waitTimeout);
            clearInterval(interval);
            resolveWait();
          }
        }, 500);
      });
      // console.log("Subscriber ready, starting publisher..."); // Debug

      // 3. Start Publisher
      const publisherPromise = new Promise<void>((resolvePublisher, rejectPublisher) => {
        // console.log("Spawning publisher command..."); // Debug
        publisherProcess = spawn(
          "node",
          [
            cliPath,
            "bench",
            "publisher",
            testChannel,
            "--api-key",
            apiKey,
            "--messages",
            messageCount.toString(),
            "--rate",
            messageRate.toString(),
            "--json",
            "--verbose",
          ],
          { env: { ...process.env, ABLY_CLI_TEST_MODE: undefined } },
        );

        publisherProcess.stdout.on("data", (data) => {
          const outputChunk = data.toString();
          if (DEBUG_OUTPUT) process.stdout.write(`[DEBUG_PUB_OUT] ${outputChunk}`); // Pipe to main stdout only if debugging
          publisherOutput += outputChunk;
        });
        publisherProcess.stderr.on("data", (data) => {
          const errorChunk = data.toString();
          if (DEBUG_OUTPUT) {
            process.stderr.write(`[DEBUG_PUB_ERR] ${errorChunk}`); // Pipe to main stderr
            console.error(`PUBLISHER STDERR: ${errorChunk.trim()}`);
          }
        });
        publisherProcess.on("error", (err) => {
          // console.error("PUBLISHER SPAWN ERROR: ", err); // Debug
          rejectPublisher(err);
        });
        publisherProcess.on("close", (code) => {
          // console.log(`PUBLISHER CLOSED WITH CODE: ${code}`); // Debug
          if (code === 0) {
            resolvePublisher();
          } else {
            rejectPublisher(new Error(`Publisher process exited with code ${code}. Output:\n${publisherOutput}`));
          }
        });
      });

      // console.log("Waiting for publisherPromise..."); // Debug
      await publisherPromise;
      // console.log("publisherPromise resolved. Waiting for subscriberPromise..."); // Debug
      await subscriberPromise;
      // console.log("subscriberPromise resolved. Proceeding to assertions."); // Debug

    } catch (error: any) {
      testError = error;
    } finally {
      if (subscriberProcess) {
        const sp = subscriberProcess as ChildProcessWithoutNullStreams;
        if (sp.killed === false) sp.kill("SIGTERM");
      }
      if (publisherProcess) {
        const pp = publisherProcess as ChildProcessWithoutNullStreams;
        if (pp.killed === false) pp.kill("SIGTERM");
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (testError) throw testError;

    const publisherLogEntries = publisherOutput.trim().split("\n").map(line => {
      try { return JSON.parse(line); } catch { return {}; }
    });
    const publisherSummary = publisherLogEntries.find(entry => entry.event === "testCompleted" && entry.component === "benchmark");
    expect(publisherSummary, "Publisher summary not found or not in JSON format").to.exist;
    expect(publisherSummary?.data).to.exist;
    if (publisherSummary?.data) {
      expect(publisherSummary.data.messagesSent, "Publisher messagesSent mismatch").to.equal(messageCount);
      expect(publisherSummary.data.messagesEchoed, "Publisher messagesEchoed seems too low").to.be.greaterThanOrEqual(messageCount * 0.9);
      expect(publisherSummary.data.errors, "Publisher errors should be 0").to.equal(0);
    }

    const subscriberLogEntries = subscriberOutput.trim().split("\n").map(line => {
      try { return JSON.parse(line); } catch { return {}; }
    });
    const subscriberSummary = subscriberSummaryEntry ?? subscriberLogEntries.find(entry => entry.event === "testFinished" && entry.component === "benchmark");
    expect(subscriberSummary, "Subscriber summary not found or not in JSON format").to.exist;
    expect(subscriberSummary?.data?.results).to.exist;
    if (subscriberSummary?.data?.results) {
      expect(subscriberSummary.data.results.messagesReceived, "Subscriber messagesReceived mismatch").to.equal(messageCount);
    }
  });
}); 