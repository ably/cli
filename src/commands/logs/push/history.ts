import { Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";
import { formatJson, isJsonData } from "../../../utils/json-formatter.js";

export default class LogsPushHistory extends AblyBaseCommand {
  static override description = "Retrieve push notification log history";

  static override examples = [
    "$ ably logs push history",
    "$ ably logs push history --limit 20",
    "$ ably logs push history --direction forwards",
    "$ ably logs push history --json",
    "$ ably logs push history --pretty-json",
  ];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    direction: Flags.string({
      default: "backwards",
      description: "Direction of log retrieval",
      options: ["backwards", "forwards"],
    }),
    limit: Flags.integer({
      default: 100,
      description: "Maximum number of logs to retrieve",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LogsPushHistory);

    try {
      // Get API key from flags or config
      const apiKey = flags["api-key"] || (await this.configManager.getApiKey());
      if (!apiKey) {
        await this.ensureAppAndKey(flags);
        return;
      }

      // Create the Ably REST client
      const options: Ably.ClientOptions = this.getClientOptions(flags);
      const client = new Ably.Rest(options);

      const channelName = "[meta]log:push";
      const channel = client.channels.get(channelName);

      // Get message history
      const historyOptions = {
        direction: flags.direction as "backwards" | "forwards",
        limit: flags.limit,
      };

      const historyPage = await channel.history(historyOptions);
      const messages = historyPage.items;

      // Output results based on format
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              messages: messages.map((msg) => ({
                channel: channelName,
                clientId: msg.clientId,
                connectionId: msg.connectionId,
                data: msg.data,
                encoding: msg.encoding,
                id: msg.id,
                name: msg.name,
                timestamp: msg.timestamp
                  ? new Date(msg.timestamp).toISOString()
                  : new Date().toISOString(),
              })),
              success: true,
            },
            flags,
          ),
        );
      } else {
        if (messages.length === 0) {
          this.log("No push log messages found in history.");
          return;
        }

        this.log(
          `Found ${chalk.cyan(messages.length.toString())} push log messages:`,
        );
        this.log("");

        for (const message of messages) {
          const timestamp = message.timestamp
            ? new Date(message.timestamp).toISOString()
            : "Unknown timestamp";
          const event = message.name || "unknown";

          // Color-code different event types based on severity
          let eventColor = chalk.blue;

          // For push log events - based on examples and severity
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
            this.log("Data:");
            if (isJsonData(message.data)) {
              this.log(formatJson(message.data));
            } else {
              this.log(String(message.data));
            }
          }

          this.log("");
        }

        if (messages.length === flags.limit) {
          this.log(
            chalk.yellow(
              `Showing maximum of ${flags.limit} logs. Use --limit to show more.`,
            ),
          );
        }
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              error: error instanceof Error ? error.message : String(error),
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(
          `Error retrieving push notification logs: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
