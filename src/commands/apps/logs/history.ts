import { Flags as _Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";

export default class AppsLogsHistory extends AblyBaseCommand {
  static override description = "Alias for `ably logs app history`";

  static override examples = [
    "$ ably apps logs history",
    "$ ably apps logs history --limit 20",
    "$ ably apps logs history --direction forwards",
    "$ ably apps logs history --json",
    "$ ably apps logs history --pretty-json",
  ];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    direction: _Flags.string({
      default: "backwards",
      description: "Direction of message retrieval",
      options: ["backwards", "forwards"],
    }),
    json: _Flags.boolean({
      default: false,
      description: "Output results in JSON format",
    }),
    limit: _Flags.integer({
      default: 100,
      description: "Maximum number of messages to retrieve",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppsLogsHistory);

    try {
      // Create a REST client
      const client = await this.createAblyRestClient(flags);
      if (!client) {
        return;
      }

      // Get the channel
      const channel = client.channels.get("[meta]log");

      // Build history query parameters
      const historyParams: Ably.RealtimeHistoryParams = {
        direction: flags.direction as "backwards" | "forwards",
        limit: flags.limit,
      };

      // Get history
      const history = await channel.history(historyParams);
      const messages = history.items;

      // Display results based on format
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ messages }, flags));
      } else {
        if (messages.length === 0) {
          this.log("No application log messages found.");
          return;
        }

        this.log(
          `Found ${chalk.cyan(messages.length.toString())} application log messages:`,
        );
        this.log("");

        for (const message of messages) {
          // Format timestamp
          const timestamp = new Date(message.timestamp).toISOString();
          this.log(
            `${chalk.gray(timestamp)} [${chalk.yellow(message.name || "message")}]`,
          );

          // Format data based on type
          if (typeof message.data === "object") {
            try {
              this.log(this.formatJsonOutput(message.data, flags));
            } catch {
              this.log(String(message.data));
            }
          } else {
            this.log(String(message.data));
          }

          this.log(""); // Add a blank line between messages
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
        `Error retrieving application logs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
