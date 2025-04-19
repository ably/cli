import { Args } from "@oclif/core";
import * as Ably from "ably";

import { AblyBaseCommand } from "../../../base-command.js";

interface OccupancyMetrics {
  connections?: number;
  presenceConnections?: number;
  presenceMembers?: number;
  presenceSubscribers?: number;
  publishers?: number;
  subscribers?: number;
}

export default class ChannelsOccupancyGet extends AblyBaseCommand {
  static args = {
    channel: Args.string({
      description: "Channel name to get occupancy for",
      required: true,
    }),
  };

  static description = "Get current occupancy metrics for a channel";

  static examples = [
    "$ ably channels occupancy get my-channel",
    '$ ably channels occupancy get --api-key "YOUR_API_KEY" my-channel',
    "$ ably channels occupancy get my-channel --json",
    "$ ably channels occupancy get my-channel --pretty-json",
  ];

  static flags = {
    ...AblyBaseCommand.globalFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsOccupancyGet);

    let client: Ably.Realtime | null = null;

    try {
      // Create the Ably Realtime client
      client = await this.createAblyClient(flags);
      if (!client) return;

      const channelName = args.channel;

      // Use the realtime client to get channel details
      const channel = client.channels.get(channelName, {
        params: {
          occupancy: "metrics",
        },
      });

      // Attach to the channel to get occupancy metrics
      await new Promise<void>((resolve) => {
        channel.once("attached", () => {
          resolve();
        });

        channel.attach();
      });

      // Listen for the first occupancy update
      const occupancyMetrics = await new Promise<OccupancyMetrics>(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            channel.unsubscribe("[meta]occupancy");
            reject(new Error("Timed out waiting for occupancy metrics"));
          }, 5000); // 5 second timeout

          channel.subscribe("[meta]occupancy", (message: Ably.Message) => {
            clearTimeout(timeout);
            channel.unsubscribe("[meta]occupancy");

            const metrics = message.data?.metrics;
            if (metrics) {
              resolve(metrics);
            } else {
              reject(new Error("No occupancy metrics received"));
            }
          });
        },
      );

      // Output the occupancy metrics based on format
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              channel: channelName,
              metrics: occupancyMetrics,
              success: true,
            },
            flags,
          ),
        );
      } else {
        this.log(`Occupancy metrics for channel '${channelName}':\n`);
        this.log(`Connections: ${occupancyMetrics.connections ?? 0}`);
        this.log(`Publishers: ${occupancyMetrics.publishers ?? 0}`);
        this.log(`Subscribers: ${occupancyMetrics.subscribers ?? 0}`);

        if (occupancyMetrics.presenceConnections !== undefined) {
          this.log(
            `Presence Connections: ${occupancyMetrics.presenceConnections}`,
          );
        }

        if (occupancyMetrics.presenceMembers !== undefined) {
          this.log(`Presence Members: ${occupancyMetrics.presenceMembers}`);
        }

        if (occupancyMetrics.presenceSubscribers !== undefined) {
          this.log(
            `Presence Subscribers: ${occupancyMetrics.presenceSubscribers}`,
          );
        }
      }

      // Clean up
      await channel.detach();
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              channel: args.channel,
              error: error instanceof Error ? error.message : String(error),
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(
          `Error fetching channel occupancy: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      if (client) client.close();
    }
  }
}
