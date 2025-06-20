import { Args } from "@oclif/core";

import { AblyBaseCommand } from "../../../base-command.js";

interface OccupancyMetrics {
  connections: number;
  presenceConnections: number;
  presenceMembers: number;
  presenceSubscribers: number;
  publishers: number;
  subscribers: number;
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

    try {
      // Create the Ably REST client
      const client = await this.createAblyRestClient(flags);
      if (!client) {
        return;
      }

      const channelName = args.channel;

      // Use the REST API to get channel details with occupancy
      const channelDetails = await client.request(
        'get',
        `/channels/${encodeURIComponent(channelName)}`,
        2, // version
        { occupancy: 'metrics' }, // params
        null // body
      );

      const occupancyData = channelDetails.items?.[0] || channelDetails;
      const occupancyMetrics: OccupancyMetrics = occupancyData.occupancy?.metrics || {
        connections: 0,
        presenceConnections: 0,
        presenceMembers: 0,
        presenceSubscribers: 0,
        publishers: 0,
        subscribers: 0
      };

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
    }
  }
}
