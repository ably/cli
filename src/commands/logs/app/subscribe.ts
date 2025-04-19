import { Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";
import { formatJson, isJsonData } from "../../../utils/json-formatter.js";

export default class LogsAppSubscribe extends AblyBaseCommand {
  static override description =
    "Stream logs from the app-wide meta channel [meta]log";

  static override examples = [
    "$ ably logs app subscribe",
    "$ ably logs app subscribe --rewind 10",
    "$ ably logs app subscribe --json",
    "$ ably logs app subscribe --pretty-json",
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
    const { flags } = await this.parse(LogsAppSubscribe);

    const channelName = "[meta]log";

    try {
      // Create the Ably client
      this.client = await this.createAblyClient(flags);
      if (!this.client) return;

      const { client } = this; // local const
      const channelOptions: Ably.ChannelOptions = {};

      // Add listeners for connection state changes
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

      // Listen to channel state changes
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

        // Color-code different event types based on severity
        let eventColor = chalk.blue;

        // For app log events - based on examples and severity
        if (
          message.data &&
          typeof message.data === "object" &&
          "severity" in message.data
        ) {
          const severity = message.data.severity as string;
          switch (severity) {
            case "error": {
              eventColor = chalk.red;

              break;
            }

            case "warning": {
              eventColor = chalk.yellow;

              break;
            }

            case "info": {
              eventColor = chalk.green;

              break;
            }

            case "debug": {
              eventColor = chalk.blue;

              break;
            }
            // No default
          }
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
      });
      process.on("SIGTERM", () => {
        cleanup();
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
