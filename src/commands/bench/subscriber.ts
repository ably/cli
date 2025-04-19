import { Args } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";
import Table from "cli-table3";

import { AblyBaseCommand } from "../../base-command.js";

interface TestMetrics {
  endToEndLatencies: number[]; // Publisher -> Subscriber
  lastMessageTime: number;
  messagesReceived: number;
  publisherActive: boolean;
  testDetails: Record<string, unknown> | null;
  testId: null | string;
  testStartTime: number;
  totalLatency: number;
}

export default class BenchSubscriber extends AblyBaseCommand {
  static override args = {
    channel: Args.string({
      description: "The channel name to subscribe to",
      required: true,
    }),
  };

  static override description = "Run a subscriber benchmark test";

  static override examples = ["$ ably bench subscriber my-channel"];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
  };

  private receivedEchoCount = 0;
  private checkPublisherIntervalId: NodeJS.Timeout | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MAX_LOG_LINES = 10;
  private messageLogBuffer: string[] = []; // Buffer for the last 10 logs
  private realtime: Ably.Realtime | null = null;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.checkPublisherIntervalId) {
      clearInterval(this.checkPublisherIntervalId);
      this.checkPublisherIntervalId = null;
    }

    if (
      this.realtime &&
      this.realtime.connection.state !== "closed" && // Check state before closing to avoid errors if already closed
      this.realtime.connection.state !== "failed"
    ) {
      this.realtime.close();
    }

    return super.finally(err);
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(BenchSubscriber);

    this.realtime = await this.setupClient(flags);
    if (!this.realtime) return; // Exit if client setup failed

    const client = this.realtime;
    let channel: Ably.RealtimeChannel | null = null;
    const metrics: TestMetrics = {
      endToEndLatencies: [],
      lastMessageTime: 0,
      messagesReceived: 0,
      publisherActive: false,
      testDetails: null,
      testId: null,
      testStartTime: 0,
      totalLatency: 0,
    };

    try {
      channel = this.handleChannel(client, args.channel, flags);

      await this.handlePresence(channel, metrics, flags);

      this.subscribeToMessages(channel, metrics, flags);

      await this.checkInitialPresence(channel, metrics, flags);

      await this.waitForTermination(flags);
    } catch (error) {
      this.logCliEvent(
        flags,
        "benchmark",
        "testError",
        `Benchmark failed: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.stack : String(error) },
      );
      this.error(
        `Benchmark failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      // Cleanup is handled by the overridden finally method
    }
  }

  // --- Refactored Helper Methods ---

  private addLogToBuffer(
    logMessage: string,
    flags: Record<string, unknown>,
  ): void {
    if (this.shouldOutputJson(flags)) return; // Use passed flags
    this.messageLogBuffer.push(
      `[${new Date().toLocaleTimeString()}] ${logMessage}`,
    );
    if (this.messageLogBuffer.length > this.MAX_LOG_LINES) {
      this.messageLogBuffer.shift(); // Remove the oldest log
    }
  }

  private async checkInitialPresence(
    channel: Ably.RealtimeChannel,
    metrics: TestMetrics,
    flags: Record<string, unknown>,
  ): Promise<void> {
    const members = await channel.presence.get();
    const publishers = members.filter(
      (m) =>
        m.data &&
        typeof m.data === "object" &&
        "role" in m.data &&
        m.data.role === "publisher",
    );

    if (publishers.length > 0) {
      this.logCliEvent(
        flags,
        "benchmark",
        "initialPublishersFound",
        `Found ${publishers.length} publisher(s) already present`,
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(`Found ${publishers.length} publisher(s) already present`);
      }

      for (const publisher of publishers) {
        const { data } = publisher;
        if (
          data &&
          typeof data === "object" &&
          "testDetails" in data &&
          "testId" in data
        ) {
          const { testDetails, testId } = data as {
            testDetails: Record<string, unknown>;
            testId: string;
          }; // Destructure
          this.logCliEvent(
            flags,
            "benchmark",
            "activeTestFound",
            `Found active test from existing publisher`,
            { testDetails, testId },
          );
          // Update metrics only if no test is currently active or if it matches
          if (!metrics.testId || metrics.testId === testId) {
            metrics.testDetails = testDetails;
            metrics.testId = testId;
            metrics.publisherActive = true;
            metrics.lastMessageTime = Date.now(); // Assume active now
          }

          if (!this.shouldOutputJson(flags)) {
            this.log(`Active test ID: ${metrics.testId}`);
            if (metrics.testDetails) {
              this.log(
                `Test will send ${metrics.testDetails.messageCount} messages at ${metrics.testDetails.messageRate} msg/sec using ${metrics.testDetails.transport} transport`,
              );
            }
          }
        }
      }
    }
  }

  private createStatusDisplay(
    testId: null | string,
  ): InstanceType<typeof Table> {
    let table: InstanceType<typeof Table>;

    if (!testId) {
      table = new Table({
        style: {
          border: [], // No additional styles for the border
        },
      });
      table.push([chalk.yellow("Waiting for benchmark test to start...")]);
      return table;
    }

    table = new Table({
      colWidths: [20, 30], // Adjust column widths
      head: [chalk.white("Benchmark Test"), chalk.white(testId)],
      style: {
        border: [], // No additional styles for the border
        head: [], // No additional styles for the header
      },
    });

    table.push(["Messages received", "0"], ["Average latency", "0 ms"]);

    return table;
  }

  private finishTest(
    flags: Record<string, unknown>,
    metrics: TestMetrics,
  ): void {
    if (!metrics.testId) return;

    // Calculate final statistics before logging
    const testDurationSeconds = (Date.now() - metrics.testStartTime) / 1000;
    metrics.endToEndLatencies.sort((a, b) => a - b);
    const avgEndToEndLatency =
      metrics.endToEndLatencies.length > 0
        ? metrics.endToEndLatencies.reduce((sum, l) => sum + l, 0) /
          metrics.endToEndLatencies.length
        : 0;
    const e2eP50 =
      metrics.endToEndLatencies[
        Math.floor(metrics.endToEndLatencies.length * 0.5)
      ] || 0;
    const e2eP90 =
      metrics.endToEndLatencies[
        Math.floor(metrics.endToEndLatencies.length * 0.9)
      ] || 0;
    const e2eP95 =
      metrics.endToEndLatencies[
        Math.floor(metrics.endToEndLatencies.length * 0.95)
      ] || 0;
    const e2eP99 =
      metrics.endToEndLatencies[
        Math.floor(metrics.endToEndLatencies.length * 0.99)
      ] || 0;

    const results = {
      latencyMs:
        metrics.endToEndLatencies.length > 0
          ? {
              average: Number.parseFloat(avgEndToEndLatency.toFixed(2)),
              p50: Number.parseFloat(e2eP50.toFixed(2)),
              p90: Number.parseFloat(e2eP90.toFixed(2)),
              p95: Number.parseFloat(e2eP95.toFixed(2)),
              p99: Number.parseFloat(e2eP99.toFixed(2)),
            }
          : null,
      messagesReceived: metrics.messagesReceived,
      testDurationSeconds,
      testId: metrics.testId,
    };

    this.logCliEvent(
      flags,
      "benchmark",
      "testFinished",
      `Benchmark test ${metrics.testId} finished`,
      { results },
    );

    if (this.shouldOutputJson(flags)) {
      // In JSON mode, output the structured results object
      this.log(this.formatJsonOutput(results, flags));
      return;
    }

    this.log("\n" + chalk.green("Benchmark Results") + "\n");

    // Create a summary table
    const summaryTable = new Table({
      head: [chalk.white("Metric"), chalk.white("Value")],
      style: {
        border: [], // No additional styles for the border
        head: [], // No additional styles for the header
      },
    });

    summaryTable.push(
      ["Test ID", metrics.testId],
      ["Messages received", metrics.messagesReceived.toString()],
      [
        "Test duration",
        `${((Date.now() - metrics.testStartTime) / 1000).toFixed(2)} seconds`,
      ],
    );

    this.log(summaryTable.toString());

    if (metrics.endToEndLatencies.length === 0) {
      this.log("\nNo messages received during the test.");
      return;
    }

    // Create a latency table
    const latencyTable = new Table({
      head: [chalk.white("Latency Metric"), chalk.white("Value (ms)")],
      style: {
        border: [], // No additional styles for the border
        head: [], // No additional styles for the header
      },
    });

    latencyTable.push(
      ["End-to-End Average", avgEndToEndLatency.toFixed(2)],
      ["End-to-End P50", e2eP50.toFixed(2)],
      ["End-to-End P90", e2eP90.toFixed(2)],
      ["End-to-End P95", e2eP95.toFixed(2)],
      ["End-to-End P99", e2eP99.toFixed(2)],
    );

    this.log("\nLatency Measurements:");
    this.log(
      "(Time from message creation on publisher to receipt by subscriber)",
    );
    this.log(latencyTable.toString());
  }

  private handleChannel(
    client: Ably.Realtime,
    channelName: string,
    flags: Record<string, unknown>,
  ): Ably.RealtimeChannel {
    const channel = client.channels.get(channelName, {
      params: { rewind: "1" },
    });
    channel.on((stateChange: Ably.ChannelStateChange) => {
      this.logCliEvent(
        flags,
        "channel",
        stateChange.current,
        `Channel '${channelName}' state changed to ${stateChange.current}`,
        { reason: stateChange.reason },
      );
    });
    return channel;
  }

  private async handlePresence(
    channel: Ably.RealtimeChannel,
    metrics: TestMetrics,
    flags: Record<string, unknown>,
  ): Promise<void> {
    this.logCliEvent(
      flags,
      "presence",
      "enteringPresence",
      `Entering presence as subscriber on channel: ${channel.name}`,
    );
    await channel.presence.enter({ role: "subscriber" });
    this.logCliEvent(
      flags,
      "presence",
      "presenceEntered",
      `Entered presence as subscriber on channel: ${channel.name}`,
    );

    let testInProgress = false; // Track if a test is currently active
    let _display: InstanceType<typeof Table> | null = null; // Type for display table

    // --- Presence Enter Handler ---
    channel.presence.subscribe("enter", (member: Ably.PresenceMessage) => {
      const { clientId, data } = member; // Destructure member
      this.logCliEvent(
        flags,
        "presence",
        "memberEntered",
        `Member entered presence: ${clientId}`,
        { clientId, data },
      );

      if (
        data &&
        typeof data === "object" &&
        "role" in data &&
        data.role === "publisher" &&
        "testDetails" in data &&
        "testId" in data
      ) {
        const { testDetails, testId } = data as {
          testDetails: Record<string, unknown>;
          testId: string;
        }; // Destructure data
        this.logCliEvent(
          flags,
          "benchmark",
          "publisherDetected",
          `Publisher detected with test ID: ${testId}`,
          { testDetails, testId },
        );
        metrics.testDetails = testDetails;
        metrics.publisherActive = true;
        metrics.lastMessageTime = Date.now();
        // Do not start a new test here, wait for the first message
        if (!this.shouldOutputJson(flags)) {
          this.log(`\nPublisher detected with test ID: ${testId}`);
          this.log(
            `Test will send ${testDetails.messageCount} messages at ${testDetails.messageRate} msg/sec using ${testDetails.transport} transport`,
          );
        }
      }
    });

    // --- Presence Leave Handler ---
    channel.presence.subscribe("leave", (member: Ably.PresenceMessage) => {
      const { clientId, data } = member; // Destructure member
      this.logCliEvent(
        flags,
        "presence",
        "memberLeft",
        `Member left presence: ${clientId}`,
        { clientId },
      );

      if (
        data &&
        typeof data === "object" &&
        "role" in data &&
        data.role === "publisher" &&
        "testId" in data &&
        (data.testId as string) === metrics.testId &&
        testInProgress
      ) {
        const { testId } = data as { testId: string }; // Destructure data
        this.logCliEvent(
          flags,
          "benchmark",
          "publisherLeft",
          `Publisher with test ID ${testId} has left. Finishing test.`,
          { testId },
        );
        metrics.publisherActive = false;
        this.finishTest(flags, metrics);
        testInProgress = false;

        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }

        if (this.checkPublisherIntervalId) {
          clearInterval(this.checkPublisherIntervalId);
          this.checkPublisherIntervalId = null;
        }

        if (this.shouldOutputJson(flags)) {
          this.logCliEvent(
            flags,
            "benchmark",
            "waitingForTest",
            "Waiting for a new benchmark test to start...",
          );
        } else {
          _display = this.createStatusDisplay(null); // Reset display
          this.log("\nWaiting for a new benchmark test to start...");
        }
      }
    });
  }

  private resetDisplay(displayTable: InstanceType<typeof Table>): void {
    process.stdout.write("\u001B[2J\u001B[0f"); // Clear screen, move cursor
    this.log(displayTable.toString());
    this.log("\n--- Logs (Last 10) ---");
  }

  private async setupClient(
    flags: Record<string, unknown>,
  ): Promise<Ably.Realtime | null> {
    const realtime = await this.createAblyClient(flags);
    if (!realtime) {
      this.error(
        "Failed to create Ably client. Please check your API key and try again.",
      );
      return null;
    }

    realtime.connection.on((stateChange: Ably.ConnectionStateChange) => {
      this.logCliEvent(
        flags,
        "connection",
        stateChange.current,
        `Connection state changed to ${stateChange.current}`,
        { reason: stateChange.reason },
      );
    });
    return realtime;
  }

  // --- Original Private Methods ---

  private startNewTest(
    metrics: TestMetrics,
    testId: string,
    startTime: number,
    flags: Record<string, unknown>,
  ): void {
    this.logCliEvent(
      flags,
      "benchmark",
      "newTestDetected",
      `New benchmark test detected with ID: ${testId}`,
      { testId },
    );
    metrics.messagesReceived = 0;
    metrics.totalLatency = 0;
    metrics.endToEndLatencies = [];
    metrics.testId = testId;
    metrics.testStartTime = startTime;
    metrics.publisherActive = true;
    metrics.lastMessageTime = startTime;

    // Clear previous intervals if they exist
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.checkPublisherIntervalId)
      clearInterval(this.checkPublisherIntervalId);

    // Setup new progress interval
    if (this.shouldOutputJson(flags)) {
      this.intervalId = setInterval(() => {
        this.logCliEvent(
          flags,
          "benchmark",
          "testProgress",
          "Benchmark test in progress",
          {
            avgLatencyMs:
              metrics.endToEndLatencies.length > 0
                ? (
                    metrics.endToEndLatencies.reduce((sum, l) => sum + l, 0) /
                    metrics.endToEndLatencies.length
                  ).toFixed(1)
                : 0,
            messagesReceived: metrics.messagesReceived,
            testId: metrics.testId,
          },
        );
      }, 2000);
    } else {
      // Display update interval is handled implicitly by the message handler calling resetDisplay/updateStatusAndLogs
      // We need an interval just to call the update function periodically if no messages are received
      this.intervalId = setInterval(() => {
        // Find the display instance (this is a bit awkward, consider passing display ref)
        // For now, assume updateStatusAndLogs handles null display
        this.updateStatusAndLogs(null, metrics);
      }, 500);
    }
  }

  private startPublisherCheckInterval(
    metrics: TestMetrics,
    flags: Record<string, unknown>,
    onInactive: () => void,
  ): void {
    if (this.checkPublisherIntervalId) {
      clearInterval(this.checkPublisherIntervalId);
    }

    this.checkPublisherIntervalId = setInterval(() => {
      const publisherInactiveTime = Date.now() - metrics.lastMessageTime;
      if (publisherInactiveTime > 5000 && metrics.publisherActive) {
        this.logCliEvent(
          flags,
          "benchmark",
          "publisherInactive",
          `Publisher seems inactive (no messages for ${(publisherInactiveTime / 1000).toFixed(1)}s)`,
          { testId: metrics.testId },
        );
        metrics.publisherActive = false;
        this.finishTest(flags, metrics);
        onInactive(); // Update state in the calling context

        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }

        if (this.checkPublisherIntervalId) {
          clearInterval(this.checkPublisherIntervalId);
          this.checkPublisherIntervalId = null;
        }

        if (this.shouldOutputJson(flags)) {
          this.logCliEvent(
            flags,
            "benchmark",
            "waitingForTest",
            "Waiting for a new benchmark test to start...",
          );
        } else {
          this.log("\nWaiting for a new benchmark test to start...");
          // Resetting display is handled by onInactive callback setting display=null
        }
      }
    }, 1000);
  }

  private subscribeToMessages(
    channel: Ably.RealtimeChannel,
    metrics: TestMetrics,
    flags: Record<string, unknown>,
  ): void {
    let _display: InstanceType<typeof Table> | null = null;

    channel.subscribe((message: Ably.Message) => {
      const currentTime = Date.now();

      // Check if this message is the start of a new test
      if (
        message.data.type === "start" &&
        message.data.testId !== metrics.testId
      ) {
        this.startNewTest(
          metrics,
          message.data.testId,
          message.data.startTime,
          flags,
        );
        // Initialize publisher check only when a test starts
        this.startPublisherCheckInterval(metrics, flags, () =>
          this.finishTest(flags, metrics),
        );
        this.logCliEvent(
          flags,
          "benchmark",
          "testStarted",
          `Benchmark test started with ID: ${metrics.testId}`,
          { testId: metrics.testId },
        );
        const logMsg = `Benchmark test started: ${metrics.testId}`;
        this.addLogToBuffer(logMsg, flags); // Pass flags here
      } else if (
        metrics.publisherActive &&
        message.data.type === "message" &&
        message.data.testId === metrics.testId
      ) {
        metrics.messagesReceived += 1;
        metrics.lastMessageTime = currentTime;

        // Calculate latency (assuming message.data.timestamp is publisher creation time)
        const endToEndLatency = currentTime - message.data.timestamp;
        metrics.endToEndLatencies.push(endToEndLatency);
        metrics.totalLatency += endToEndLatency; // Accumulate for average calculation

        const logMsg = `Received message ${message.id} (e2e: ${endToEndLatency}ms)`;
        this.addLogToBuffer(logMsg, flags); // Pass flags here
      }
    });
    this.logCliEvent(
      flags,
      "benchmark",
      "subscribedToMessages",
      `Subscribed to benchmark messages on channel '${channel.name}'`,
    );
  }

  // New combined update function
  private updateStatusAndLogs(
    displayTable: InstanceType<typeof Table> | null,
    metrics: TestMetrics,
  ): void {
    if (!displayTable || !metrics.testId || this.shouldOutputJson({})) {
      // If displayTable is null (e.g. JSON mode or between tests), try to recreate if needed
      if (!this.shouldOutputJson({}) && metrics.testId && !displayTable) {
        // This case is tricky - we don't have the display instance here.
        // The logic in subscribeToMessages should handle creating the display.
        // Maybe log a warning or reconsider the design.
        // console.warn("Attempting to update status without a display table.");
        return; // Cannot update without a table instance
      }

      if (!displayTable) return;
    }

    // Calculate average latency from most recent messages
    const recentCount = Math.min(metrics.messagesReceived, 50);
    const recentLatencies = metrics.endToEndLatencies.slice(-recentCount);

    const avgLatency =
      recentLatencies.length > 0
        ? recentLatencies.reduce((sum, l) => sum + l, 0) /
          recentLatencies.length
        : 0;

    // Create updated table data
    const newTableData = [
      ["Messages received", metrics.messagesReceived.toString()],
      ["Average latency", `${avgLatency.toFixed(1)} ms`],
    ];

    // Clear console and redraw
    process.stdout.write("\u001B[2J\u001B[0f"); // Clear screen, move cursor

    // Recreate table with updated data
    const updatedTable = new Table({
      colWidths: [20, 30],
      head: [chalk.white("Benchmark Test"), chalk.white(metrics.testId || "")],
      style: {
        border: [],
        head: [],
      },
    });
    updatedTable.push(...newTableData);
    this.log(updatedTable.toString());

    this.log("\n--- Logs (Last 10) ---");
    for (const log of this.messageLogBuffer) this.log(log);
  }

  private async waitForTermination(
    flags: Record<string, unknown>,
  ): Promise<void> {
    if (!this.shouldOutputJson(flags)) {
      this.log("\nSubscriber is ready. Waiting for messages...");
      this.log("Press Ctrl+C to exit.");
    }

    this.logCliEvent(
      flags,
      "benchmark",
      "subscriberReady",
      "Subscriber is ready and waiting for messages",
    );
    // Keep the connection open indefinitely until Ctrl+C
    await new Promise(() => {
      /* Never resolves */
    });
  }
}
