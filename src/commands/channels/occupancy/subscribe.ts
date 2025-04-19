import { Args } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";

export default class ChannelsOccupancySubscribe extends AblyBaseCommand {
  static args = {
    channel: Args.string({
      description: "Channel name to subscribe to occupancy for",
      required: true,
    }),
  };

  static description = "Subscribe to real-time occupancy metrics for a channel";

  static examples = [
    "$ ably channels occupancy subscribe my-channel",
    "$ ably channels occupancy subscribe my-channel --json",
    "$ ably channels occupancy subscribe --pretty-json my-channel",
  ];

  static flags = {
    ...AblyBaseCommand.globalFlags,
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
    const { args, flags } = await this.parse(ChannelsOccupancySubscribe);

    const channelName = args.channel;

    try {
      this.logCliEvent(
        flags,
        "subscribe",
        "connecting",
        "Connecting to Ably...",
      );

      // Create the Ably client
      this.client = await this.createAblyClient(flags);
      if (!this.client) return;

      const { client } = this; // local const

      // Get the channel with occupancy option enabled
      const channelOptions = {
        params: {
          occupancy: "metrics", // Enable occupancy events
        },
      };

      const channel = client.channels.get(channelName, channelOptions);

      // Setup connection state change handler
      client.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(
          flags,
          "connection",
          stateChange.current,
          `Connection state changed to ${stateChange.current}`,
          { reason: stateChange.reason },
        );
        if (!this.shouldOutputJson(flags)) {
          switch (stateChange.current) {
            case "connected": {
              this.log("Successfully connected to Ably");
              this.log(
                `Subscribing to occupancy events for channel '${channelName}'...`,
              );

              break;
            }

            case "disconnected": {
              this.log("Disconnected from Ably");

              break;
            }

            case "failed": {
              this.error(
                `Connection failed: ${stateChange.reason?.message || "Unknown error"}`,
              );

              break;
            }
            // No default
          }
        }
      });

      // Listen to channel state changes
      channel.on((stateChange: Ably.ChannelStateChange) => {
        this.logCliEvent(
          flags,
          "channel",
          stateChange.current,
          `Channel '${channelName}' state changed to ${stateChange.current}`,
          { channel: channelName, reason: stateChange.reason },
        );
        if (!this.shouldOutputJson(flags)) {
          switch (stateChange.current) {
            case "attached": {
              this.log(
                `${chalk.green("✓")} Successfully attached to channel: ${chalk.cyan(channelName)}`,
              );

              break;
            }

            case "failed": {
              this.log(
                `${chalk.red("✗")} Failed to attach to channel ${chalk.cyan(channelName)}: ${stateChange.reason?.message || "Unknown error"}`,
              );

              break;
            }

            case "detached": {
              this.log(
                `${chalk.yellow("!")} Detached from channel: ${chalk.cyan(channelName)} ${stateChange.reason ? `(Reason: ${stateChange.reason.message})` : ""}`,
              );

              break;
            }
            // No default
          }
        }
      });

      this.logCliEvent(
        flags,
        "subscribe",
        "listening",
        "Listening for occupancy updates. Press Ctrl+C to exit.",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log("Listening for occupancy updates. Press Ctrl+C to exit.");
      }

      // Subscribe to occupancy events
      channel.subscribe("[meta]occupancy", (message: Ably.Message) => {
        const timestamp = message.timestamp
          ? new Date(message.timestamp).toISOString()
          : new Date().toISOString();

        // Extract occupancy metrics from the message
        const occupancyMetrics = message.data?.metrics;

        if (!occupancyMetrics) {
          const errorMsg = "Received occupancy update but no metrics available";
          this.logCliEvent(flags, "subscribe", "metricsUnavailable", errorMsg, {
            channel: channelName,
            timestamp,
          });
          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput(
                {
                  channel: channelName,
                  error: errorMsg,
                  success: false,
                  timestamp,
                },
                flags,
              ),
            );
          } else {
            this.log(`[${timestamp}] ${errorMsg}`);
          }

          return;
        }

        const occupancyEvent = {
          channel: channelName,
          metrics: occupancyMetrics,
          timestamp,
        };
        this.logCliEvent(
          flags,
          "subscribe",
          "occupancyUpdate",
          "Received occupancy update",
          occupancyEvent,
        );

        // Output the occupancy metrics based on format
        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput({ success: true, ...occupancyEvent }, flags),
          );
        } else {
          this.log(
            `[${timestamp}] Occupancy update for channel '${channelName}'`,
          );
          this.log(`  Connections: ${occupancyMetrics.connections ?? 0}`);
          this.log(`  Publishers: ${occupancyMetrics.publishers ?? 0}`);
          this.log(`  Subscribers: ${occupancyMetrics.subscribers ?? 0}`);

          if (occupancyMetrics.presenceConnections !== undefined) {
            this.log(
              `  Presence Connections: ${occupancyMetrics.presenceConnections}`,
            );
          }

          if (occupancyMetrics.presenceMembers !== undefined) {
            this.log(`  Presence Members: ${occupancyMetrics.presenceMembers}`);
          }

          if (occupancyMetrics.presenceSubscribers !== undefined) {
            this.log(
              `  Presence Subscribers: ${occupancyMetrics.presenceSubscribers}`,
            );
          }

          this.log(""); // Empty line for better readability
        }
      });
      this.logCliEvent(
        flags,
        "subscribe",
        "subscribedToOccupancy",
        `Subscribed to [meta]occupancy on channel ${channelName}`,
        { channel: channelName },
      );

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = () => {
          this.logCliEvent(
            flags,
            "subscribe",
            "cleanupInitiated",
            "Cleanup initiated (Ctrl+C pressed)",
          );
          if (!this.shouldOutputJson(flags)) {
            this.log("\nUnsubscribing and closing connection...");
          }

          this.logCliEvent(
            flags,
            "subscribe",
            "unsubscribingOccupancy",
            `Unsubscribing from [meta]occupancy on ${channelName}`,
            { channel: channelName },
          );
          try {
            channel.unsubscribe(); // Unsubscribe from all listeners on the channel
            this.logCliEvent(
              flags,
              "subscribe",
              "unsubscribedOccupancy",
              `Unsubscribed from [meta]occupancy on ${channelName}`,
              { channel: channelName },
            );
          } catch (error) {
            this.logCliEvent(
              flags,
              "subscribe",
              "unsubscribeError",
              `Error unsubscribing from ${channelName}: ${error instanceof Error ? error.message : String(error)}`,
              {
                channel: channelName,
                error: error instanceof Error ? error.message : String(error),
              },
            );
          }

          if (client) {
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

              resolve();
            });
            this.logCliEvent(
              flags,
              "connection",
              "closing",
              "Closing Ably connection.",
            );
            client.close();
          } else {
            this.logCliEvent(
              flags,
              "subscribe",
              "noClientToClose",
              "No active client connection to close.",
            );
            resolve();
          }
        };

        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "subscribe",
        "fatalError",
        `Error during occupancy subscription: ${errorMsg}`,
        { channel: channelName, error: errorMsg },
      );
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { channel: channelName, error: errorMsg, success: false },
            flags,
          ),
        );
      } else {
        this.error(`Error: ${errorMsg}`);
      }
    } finally {
      // Ensure client is closed even if cleanup promise didn't resolve
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
