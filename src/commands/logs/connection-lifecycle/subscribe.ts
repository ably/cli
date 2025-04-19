import { Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";
import { formatJson, isJsonData } from "../../../utils/json-formatter.js";

export default class LogsConnectionLifecycleSubscribe extends AblyBaseCommand {
  static override description =
    "Stream logs from [meta]connection.lifecycle meta channel";

  static override examples = [
    "$ ably logs connection-lifecycle subscribe",
    "$ ably logs connection-lifecycle subscribe --rewind 10",
    "$ ably logs connection-lifecycle subscribe --json",
    "$ ably logs connection-lifecycle subscribe --pretty-json",
  ];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    rewind: Flags.integer({
      default: 0,
      description: "Number of messages to rewind when subscribing",
    }),
  };

  private client: Ably.Realtime | null = null;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (
      this.client &&
      this.client.connection.state !== "closed" && // Check state before closing to avoid errors if already closed
      this.client.connection.state !== "failed"
    ) {
      this.client.close();
    }

    return super.finally(err);
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(LogsConnectionLifecycleSubscribe);

    const channelName = "[meta]connection.lifecycle";

    try {
      // Create the Ably client
      this.client = await this.createAblyClient(flags);
      if (!this.client) return;

      const { client } = this; // local const
      const channelOptions: Ably.ChannelOptions = {};

      // Add listeners for connection state changes (important for understanding meta channel behavior)
      client.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(
          flags,
          "connection",
          stateChange.current,
          `Connection state changed to ${stateChange.current}`,
          { reason: stateChange.reason },
        );
      });

      // Configure rewind if specified
      if (flags.rewind > 0) {
        this.logCliEvent(
          flags,
          "logs",
          "rewindEnabled",
          `Rewind enabled for ${channelName}`,
          { channel: channelName, count: flags.rewind },
        );
        channelOptions.params = {
          ...channelOptions.params,
          rewind: flags.rewind.toString(),
        };
      }

      const channel = client.channels.get(channelName, channelOptions);

      // Listen to channel state changes (for the meta channel itself)
      channel.on((stateChange: Ably.ChannelStateChange) => {
        this.logCliEvent(
          flags,
          "channel",
          stateChange.current,
          `Meta channel '${channelName}' state changed to ${stateChange.current}`,
          { channel: channelName, reason: stateChange.reason },
        );
      });

      this.logCliEvent(
        flags,
        "logs",
        "subscribing",
        `Subscribing to ${channelName}...`,
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(`Subscribing to ${chalk.cyan(channelName)}...`);
        this.log("Press Ctrl+C to exit");
        this.log("");
      }

      // Subscribe to the channel
      channel.subscribe((message) => {
        const timestamp = message.timestamp
          ? new Date(message.timestamp).toISOString()
          : new Date().toISOString();
        const event = message.name || "unknown";
        const logEvent = {
          channel: channelName,
          clientId: message.clientId,
          connectionId: message.connectionId,
          data: message.data,
          encoding: message.encoding,
          event,
          id: message.id,
          success: true,
          timestamp,
        };
        this.logCliEvent(
          flags,
          "logs",
          "logReceived",
          `Log received on ${channelName}`,
          logEvent,
        );

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput(logEvent, flags));
          return;
        }

        // Color-code different event types
        let eventColor = chalk.blue;

        // For connection lifecycle events
        if (
          event.includes("connection.opened") ||
          event.includes("transport.opened")
        ) {
          eventColor = chalk.green;
        } else if (
          event.includes("connection.closed") ||
          event.includes("transport.closed")
        ) {
          eventColor = chalk.yellow;
        } else if (event.includes("failed")) {
          eventColor = chalk.red;
        } else if (event.includes("disconnected")) {
          eventColor = chalk.magenta;
        } else if (event.includes("suspended")) {
          eventColor = chalk.gray;
        }

        // Format the log output
        this.log(
          `${chalk.dim(`[${timestamp}]`)} Channel: ${chalk.cyan(channelName)} | Event: ${eventColor(event)}`,
        );
        if (message.data) {
          if (isJsonData(message.data)) {
            this.log("Data:");
            this.log(formatJson(message.data));
          } else {
            this.log(`Data: ${message.data}`);
          }
        }

        this.log("");
      });
      this.logCliEvent(
        flags,
        "logs",
        "subscribed",
        `Successfully subscribed to ${channelName}`,
      );

      // Set up cleanup for when the process is terminated
      const cleanup = () => {
        this.logCliEvent(
          flags,
          "logs",
          "cleanupInitiated",
          "Cleanup initiated (Ctrl+C pressed)",
        );
        if (!this.shouldOutputJson(flags)) {
          this.log("\nUnsubscribing and closing connection...");
        }

        if (client) {
          this.logCliEvent(
            flags,
            "connection",
            "closing",
            "Closing Ably connection.",
          );
          client.connection.once("closed", () => {
            this.logCliEvent(
              flags,
              "connection",
              "closed",
              "Connection closed gracefully.",
            );
            if (!this.shouldOutputJson(flags)) {
              this.log("Connection closed");
            }
          });
          client.close();
        }
      };

      // Handle process termination
      process.on("SIGINT", () => {
        if (!this.shouldOutputJson(flags)) {
          this.log("\nSubscription ended");
        }

        cleanup();

        process.exit(0); // Reinstated: Explicit exit on signal
      });
      process.on("SIGTERM", () => {
        cleanup();

        process.exit(0); // Reinstated: Explicit exit on signal
      });

      this.logCliEvent(flags, "logs", "listening", "Listening for logs...");
      // Wait indefinitely
      await new Promise(() => {});
    } catch (error: unknown) {
      const err = error as Error;
      this.logCliEvent(
        flags,
        "logs",
        "fatalError",
        `Error during log subscription: ${err.message}`,
        { channel: channelName, error: err.message },
      );
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { channel: channelName, error: err.message, success: false },
            flags,
          ),
        );
      } else {
        this.error(err.message);
      }
    } finally {
      // Ensure client is closed
      if (this.client && this.client.connection.state !== "closed") {
        this.logCliEvent(
          flags || {},
          "connection",
          "finalCloseAttempt",
          "Ensuring connection is closed in finally block.",
        );
        this.client.close();
      }
    }
  }
}
