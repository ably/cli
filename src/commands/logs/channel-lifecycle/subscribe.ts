import { Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";
import { formatJson, isJsonData } from "../../../utils/json-formatter.js";

export default class LogsChannelLifecycleSubscribe extends AblyBaseCommand {
  static override description =
    "Stream logs from [meta]channel.lifecycle meta channel";

  static override examples = [
    "$ ably logs channel-lifecycle subscribe",
    "$ ably logs channel-lifecycle subscribe --rewind 10",
  ];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    json: Flags.boolean({
      default: false,
      description: "Output results as JSON",
    }),
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
    const { flags } = await this.parse(LogsChannelLifecycleSubscribe);

    const channelName = "[meta]channel.lifecycle";

    try {
      // Create the Ably client
      this.client = await this.createAblyRealtimeClient(flags);
      if (!this.client) return;

      const { client } = this; // local const
      const channelOptions: Ably.ChannelOptions = {};

      // Set up connection state logging
      this.setupConnectionStateLogging(client, flags, {
        includeUserFriendlyMessages: true
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

      // Set up channel state logging
      this.setupChannelStateLogging(channel, flags, {
        includeUserFriendlyMessages: true
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
          data: message.data,
          event,
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

        // For channel lifecycle events
        if (event.includes("attached")) {
          eventColor = chalk.green;
        } else if (event.includes("detached")) {
          eventColor = chalk.yellow;
        } else if (event.includes("failed")) {
          eventColor = chalk.red;
        } else if (event.includes("suspended")) {
          eventColor = chalk.magenta;
        }

        // Format the log output with consistent styling
        this.log(
          `${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`Channel: ${channelName}`)} | ${eventColor(`Event: ${event}`)}`,
        );

        if (message.data) {
          if (isJsonData(message.data)) {
            this.log(chalk.blue("Data:"));
            this.log(formatJson(message.data));
          } else {
            this.log(`${chalk.blue("Data:")} ${message.data}`);
          }
        }

        this.log(""); // Empty line for better readability
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
        if (client) {
          this.logCliEvent(
            flags,
            "connection",
            "closing",
            "Closing Ably connection.",
          );
          client.close();
          this.logCliEvent(
            flags,
            "connection",
            "closed",
            "Ably connection closed.",
          );
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
      this.error(err.message);
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
