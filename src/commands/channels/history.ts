import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../base-command.js";
import { formatJson, isJsonData } from "../../utils/json-formatter.js";

export default class ChannelsHistory extends AblyBaseCommand {
  static override args = {
    channel: Args.string({
      description: "Channel name to retrieve history for",
      required: true,
    }),
  };

  static override description = "Retrieve message history for a channel";

  static override examples = [
    "$ ably channels history my-channel",
    "$ ably channels history my-channel --json",
    "$ ably channels history my-channel --pretty-json",
    '$ ably channels history my-channel --start "2023-01-01T00:00:00Z" --end "2023-01-02T00:00:00Z"',
    "$ ably channels history my-channel --limit 100",
    "$ ably channels history my-channel --direction forward",
  ];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    cipher: Flags.string({
      description: "Decryption key for encrypted messages (AES-128)",
    }),
    direction: Flags.string({
      default: "backwards",
      description: "Direction of message retrieval",
      options: ["backwards", "forwards"],
    }),

    end: Flags.string({
      description: "End time for the history query (ISO 8601 format)",
    }),
    limit: Flags.integer({
      default: 50,
      description: "Maximum number of messages to retrieve",
    }),
    start: Flags.string({
      description: "Start time for the history query (ISO 8601 format)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsHistory);
    const channelName = args.channel;
    let client: Ably.Rest;

    // Show authentication information
    this.showAuthInfoIfNeeded(flags);

    try {
      // Get API key from flags or config
      const apiKey = flags["api-key"] || (await this.configManager.getApiKey());
      if (!apiKey) {
        await this.ensureAppAndKey(flags);
        return;
      }

      // Create a REST client
      const options: Ably.ClientOptions = this.getClientOptions(flags);
      client = new Ably.Rest(options);

      // Setup channel options
      const channelOptions: Ably.ChannelOptions = {};

      // Add encryption if specified
      if (flags.cipher) {
        channelOptions.cipher = {
          key: flags.cipher,
        };
      }

      // Get the channel with options
      const channel = client.channels.get(channelName, channelOptions);

      // Build history query parameters
      const historyParams: Ably.RealtimeHistoryParams = {
        direction: flags.direction as "backwards" | "forwards",
        limit: flags.limit,
      };

      // Add time range if specified
      if (flags.start) {
        historyParams.start = new Date(flags.start).getTime();
      }

      if (flags.end) {
        historyParams.end = new Date(flags.end).getTime();
      }

      // Get history
      const history = await channel.history(historyParams);
      const messages = history.items;

      // Display results based on format
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ messages }, flags));
      } else {
        if (messages.length === 0) {
          this.log("No messages found in the channel history.");
          return;
        }

        this.log(
          `Found ${chalk.cyan(messages.length.toString())} messages in the history of channel ${chalk.green(channelName)}:`,
        );
        this.log("");

        for (const [index, message] of messages.entries()) {
          const timestamp = message.timestamp
            ? new Date(message.timestamp).toISOString()
            : "Unknown timestamp";

          this.log(chalk.dim(`[${index + 1}] ${timestamp}`));
          this.log(`Event: ${chalk.yellow(message.name || "(none)")}`);

          if (message.clientId) {
            this.log(`Client ID: ${chalk.blue(message.clientId)}`);
          }

          this.log("Data:");
          if (isJsonData(message.data)) {
            this.log(formatJson(message.data));
          } else {
            this.log(String(message.data));
          }

          this.log("");
        }

        if (messages.length === flags.limit) {
          this.log(
            chalk.yellow(
              `Showing maximum of ${flags.limit} messages. Use --limit to show more.`,
            ),
          );
        }
      }
    } catch (error) {
      this.error(
        `Error retrieving channel history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
