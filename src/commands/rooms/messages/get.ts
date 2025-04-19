import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { ChatBaseCommand } from "../../../chat-base-command.js";

export default class MessagesGet extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: "The room ID to get messages from",
      required: true,
    }),
  };

  static override description =
    "Get historical messages from an Ably Chat room";

  static override examples = [
    "$ ably rooms messages get my-room",
    '$ ably rooms messages get --api-key "YOUR_API_KEY" my-room',
    "$ ably rooms messages get --limit 50 my-room",
    "$ ably rooms messages get --show-metadata my-room",
    "$ ably rooms messages get my-room --json",
    "$ ably rooms messages get my-room --pretty-json",
  ];

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    limit: Flags.integer({
      char: "l",
      default: 20,
      description: "Maximum number of messages to retrieve",
    }),
    "show-metadata": Flags.boolean({
      default: false,
      description: "Display message metadata if available",
    }),
  };

  private ablyClient: Ably.Realtime | null = null;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(MessagesGet);

    try {
      // Create Chat client
      const chatClient = await this.createChatClient(flags);
      // Also get the underlying Ably client for cleanup
      this.ablyClient = await this.createAblyClient(flags);

      if (!chatClient) {
        this.error("Failed to create Chat client");
        return;
      }

      // Get the room
      const room = await chatClient.rooms.get(args.roomId, {});

      // Attach to the room
      await room.attach();

      if (!this.shouldSuppressOutput(flags)) {
        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput(
              {
                limit: flags.limit,
                roomId: args.roomId,
                status: "fetching",
                success: true,
              },
              flags,
            ),
          );
        } else {
          this.log(
            `${chalk.green("Fetching")} ${chalk.yellow(flags.limit.toString())} ${chalk.green("most recent messages from room:")} ${chalk.bold(args.roomId)}`,
          );
        }
      }

      // Get historical messages
      const messagesResult = await room.messages.get({ limit: flags.limit });
      const { items } = messagesResult;

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              messages: items.map((message) => ({
                clientId: message.clientId,
                text: message.text,
                timestamp: message.timestamp,
                ...(flags["show-metadata"] && message.metadata
                  ? { metadata: message.metadata }
                  : {}),
              })),
              roomId: args.roomId,
              success: true,
            },
            flags,
          ),
        );
      } else {
        // Display messages count
        this.log(
          `${chalk.green("Retrieved")} ${chalk.yellow(items.length.toString())} ${chalk.green("messages.")}`,
        );

        if (items.length === 0) {
          this.log(chalk.dim("No messages found in this room."));
        } else {
          this.log(chalk.dim("---"));

          // Display messages in chronological order (oldest first)
          const messagesInOrder = [...items].reverse();
          for (const message of messagesInOrder) {
            // Format message with timestamp, author and content
            const timestamp = new Date(message.timestamp).toLocaleTimeString();
            const author = message.clientId || "Unknown";

            this.log(
              `${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`${author}:`)} ${message.text}`,
            );

            // Show metadata if enabled and available
            if (flags["show-metadata"] && message.metadata) {
              this.log(
                `${chalk.gray("  Metadata:")} ${chalk.yellow(this.formatJsonOutput(message.metadata, flags))}`,
              );
            }
          }
        }
      }

      // Release the room
      await chatClient.rooms.release(args.roomId);
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              error: error instanceof Error ? error.message : String(error),
              roomId: args.roomId,
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(
          `Failed to get messages: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      // Close the underlying Ably connection
      if (this.ablyClient && this.ablyClient.connection.state !== "closed") {
        this.ablyClient.close();
      }
    }
  }
}
