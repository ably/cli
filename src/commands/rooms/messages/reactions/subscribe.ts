import { ChatClient, RoomStatus, Subscription, MessageReactionRawEvent, MessageReactionEvents, MessageReactionSummaryEvent } from "@ably/chat";
import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { ChatBaseCommand } from "../../../../chat-base-command.js";

interface ReactionSummary {
  messageSerial: string;
  unique?: Record<string, { total: number; clientIds: string[] }>;
  distinct?: Record<string, { total: number; clientIds: string[] }>;
  multiple?: Record<string, { total: number; clientIds: Record<string, number> }>;
}

export default class MessagesReactionsSubscribe extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: "Room ID to subscribe to message reactions in",
      required: true,
    }),
  };

  static override description = "Subscribe to message reactions in a chat room";

  static override examples = [
    "$ ably rooms messages reactions subscribe my-room",
    "$ ably rooms messages reactions subscribe my-room --raw",
    "$ ably rooms messages reactions subscribe my-room --json",
    "$ ably rooms messages reactions subscribe my-room --pretty-json",
  ];

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    raw: Flags.boolean({
      description: "Subscribe to raw individual reaction events instead of summaries",
      default: false,
    }),
  };

  private chatClient: ChatClient | null = null;
  private ablyClient: Ably.Realtime | null = null;
  private unsubscribeReactionsFn: Subscription | null = null;
  private unsubscribeRawReactionsFn: Subscription | null = null;
  private unsubscribeStatusFn: (() => void) | null = null;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.unsubscribeReactionsFn) {
      try {
        this.unsubscribeReactionsFn.unsubscribe();
      } catch {
        /* ignore */
      }
    }
    if (this.unsubscribeRawReactionsFn) {
      try {
        this.unsubscribeRawReactionsFn.unsubscribe();
      } catch {
        /* ignore */
      }
    }
    if (this.unsubscribeStatusFn) {
      try {
        this.unsubscribeStatusFn();
      } catch {
        /* ignore */
      }
    }
    if (
      this.ablyClient &&
      this.ablyClient.connection.state !== "closed" &&
      this.ablyClient.connection.state !== "failed"
    ) {
      this.ablyClient.close();
    }

    return super.finally(err);
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(MessagesReactionsSubscribe);

    try {
      // Create Chat client
      this.chatClient = await this.createChatClient(flags);
      this.ablyClient = await this.createAblyClient(flags);
      
      if (!this.chatClient || !this.ablyClient) {
        this.error("Failed to initialize clients");
        return;
      }

      const { roomId } = args;

      // Add listeners for connection state changes
      this.ablyClient.connection.on(
        (stateChange: Ably.ConnectionStateChange) => {
          this.logCliEvent(
            flags,
            "connection",
            stateChange.current,
            `Realtime connection state changed to ${stateChange.current}`,
            { reason: stateChange.reason },
          );
        },
      );

      this.logCliEvent(
        flags,
        "subscribe",
        "connecting",
        `Connecting to Ably and subscribing to message reactions in room ${roomId}...`,
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(
          `Connecting to Ably and subscribing to message reactions in room ${chalk.cyan(roomId)}...`,
        );
      }

      // Get the room
      this.logCliEvent(
        flags,
        "room",
        "gettingRoom",
        `Getting room handle for ${roomId}`,
      );
      
      // Set room options to receive raw reactions if requested
      const roomOptions = flags.raw ? {
        messages: {
          rawMessageReactions: true,
        },
      } : {};
      
      const room = await this.chatClient.rooms.get(roomId, roomOptions);
      this.logCliEvent(
        flags,
        "room",
        "gotRoom",
        `Got room handle for ${roomId}`,
      );

      // Subscribe to room status changes
      this.logCliEvent(
        flags,
        "room",
        "subscribingToStatus",
        "Subscribing to room status changes",
      );
      const { off: unsubscribeStatus } = room.onStatusChange((statusChange) => {
        let reason: Error | null | string | undefined;
        if (statusChange.current === RoomStatus.Failed) {
          reason = room.error; // Get reason from room.error on failure
        }

        const reasonMsg = reason instanceof Error ? reason.message : reason;
        this.logCliEvent(
          flags,
          "room",
          `status-${statusChange.current}`,
          `Room status changed to ${statusChange.current}`,
          { reason: reasonMsg },
        );

        switch (statusChange.current) {
          case RoomStatus.Attached: {
            if (!this.shouldOutputJson(flags)) {
              this.log(chalk.green("Successfully connected to Ably"));
              this.log(
                `Listening for message reactions in room ${chalk.cyan(roomId)}. Press Ctrl+C to exit.`,
              );
            }

            break;
          }

          case RoomStatus.Detached: {
            if (!this.shouldOutputJson(flags)) {
              this.log(chalk.yellow("Disconnected from Ably"));
            }

            break;
          }

          case RoomStatus.Failed: {
            if (!this.shouldOutputJson(flags)) {
              this.error(
                `${chalk.red("Connection failed:")} ${reasonMsg || "Unknown error"}`,
              );
            }

            break;
          }
          // No default
        }
      });
      this.unsubscribeStatusFn = unsubscribeStatus;
      this.logCliEvent(
        flags,
        "room",
        "subscribedToStatus",
        "Successfully subscribed to room status changes",
      );

      // Attach to the room
      this.logCliEvent(
        flags,
        "room",
        "attaching",
        `Attaching to room ${roomId}`,
      );
      await room.attach();
      // Successful attach logged by onStatusChange handler

      // Subscribe to message reactions based on the flag
      if (flags.raw) {
        // Subscribe to raw reaction events
        this.logCliEvent(
          flags,
          "reactions",
          "subscribingRaw",
          "Subscribing to raw reaction events",
        );
        this.unsubscribeRawReactionsFn = room.messages.reactions.subscribeRaw((event: MessageReactionRawEvent) => {
          const timestamp = new Date().toISOString();
          const eventData = {
            type: event.type,
            serial: event.reaction.messageSerial,
            reaction: event.reaction,
            roomId,
            timestamp,
          };
          this.logCliEvent(
            flags,
            "reactions",
            "rawReceived",
            "Raw reaction event received",
            eventData,
          );

          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput({ success: true, ...eventData }, flags),
            );
          } else {
            this.log(
              `[${chalk.dim(timestamp)}] ${chalk.green("⚡")} ${chalk.blue(event.reaction.clientId || "Unknown")} [${event.reaction.type}] ${event.type}: ${chalk.yellow(event.reaction.name || "unknown")} to message ${chalk.cyan(event.reaction.messageSerial)}`,
            );
          }
        });
        this.logCliEvent(
          flags,
          "reactions",
          "subscribedRaw",
          "Successfully subscribed to raw reaction events",
        );
      } else {
        // Subscribe to reaction summaries
        this.logCliEvent(
          flags,
          "reactions",
          "subscribing",
          "Subscribing to reaction summaries",
        );
        this.unsubscribeReactionsFn = room.messages.reactions.subscribe((event: MessageReactionSummaryEvent) => {
          const timestamp = new Date().toISOString();
          
          // Format the summary for display
          const summaryData: ReactionSummary = event.summary;
          
          this.logCliEvent(
            flags,
            "reactions",
            "summaryReceived",
            "Reaction summary received",
            {
              roomId,
              timestamp,
              summary: summaryData,
            }
          );

          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput({ 
                success: true, 
                roomId,
                timestamp,
                summary: summaryData 
              }, flags),
            );
          } else {
            this.log(
              `[${chalk.dim(timestamp)}] ${chalk.green("📊")} Reaction summary for message ${chalk.cyan(event.summary.messageSerial)}:`,
            );

            // Display the summaries by type if they exist
            if (event.summary.unique && Object.keys(event.summary.unique).length > 0) {
              this.log(`  ${chalk.blue("Unique reactions:")}`);
              this.displayReactionSummary(event.summary.unique, flags);
            }
            
            if (event.summary.distinct && Object.keys(event.summary.distinct).length > 0) {
              this.log(`  ${chalk.blue("Distinct reactions:")}`);
              this.displayReactionSummary(event.summary.distinct, flags);
            }
            
            if (event.summary.multiple && Object.keys(event.summary.multiple).length > 0) {
              this.log(`  ${chalk.blue("Multiple reactions:")}`);
              this.displayMultipleReactionSummary(event.summary.multiple, flags);
            }
          }
        });
        this.logCliEvent(
          flags,
          "reactions",
          "subscribed",
          "Successfully subscribed to reaction summaries",
        );
      }

      this.logCliEvent(
        flags,
        "reactions",
        "listening",
        "Listening for message reactions...",
      );
      
      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        let cleanupInProgress = false;
        const cleanup = async () => {
          if (cleanupInProgress) return;
          cleanupInProgress = true;
          this.logCliEvent(
            flags,
            "reactions",
            "cleanupInitiated",
            "Cleanup initiated (Ctrl+C pressed)",
          );
          if (!this.shouldOutputJson(flags)) {
            this.log(
              `\n${chalk.yellow("Unsubscribing and closing connection...")}`,
            );
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            const errorMsg = "Force exiting after timeout during cleanup";
            this.logCliEvent(flags, "reactions", "forceExit", errorMsg, {
              roomId,
            });
            if (!this.shouldOutputJson(flags)) {
              this.log(chalk.red("Force exiting after timeout..."));
            }
          }, 5000);

          // Unsubscribe from reactions
          if (this.unsubscribeReactionsFn) {
            try {
              this.logCliEvent(
                flags,
                "reactions",
                "unsubscribing",
                "Unsubscribing from reaction summaries",
              );
              this.unsubscribeReactionsFn.unsubscribe();
              this.logCliEvent(
                flags,
                "reactions",
                "unsubscribed",
                "Unsubscribed from reaction summaries",
              );
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              this.logCliEvent(
                flags,
                "reactions",
                "unsubscribeError",
                `Error unsubscribing from reactions: ${errorMsg}`,
                { error: errorMsg },
              );
            }
          }

          // Unsubscribe from raw reactions
          if (this.unsubscribeRawReactionsFn) {
            try {
              this.logCliEvent(
                flags,
                "reactions",
                "unsubscribingRaw",
                "Unsubscribing from raw reaction events",
              );
              this.unsubscribeRawReactionsFn.unsubscribe();
              this.logCliEvent(
                flags,
                "reactions",
                "unsubscribedRaw",
                "Unsubscribed from raw reaction events",
              );
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              this.logCliEvent(
                flags,
                "reactions",
                "unsubscribeRawError",
                `Error unsubscribing from raw reactions: ${errorMsg}`,
                { error: errorMsg },
              );
            }
          }

          // Unsubscribe from status changes
          if (this.unsubscribeStatusFn) {
            try {
              this.logCliEvent(
                flags,
                "room",
                "unsubscribingStatus",
                "Unsubscribing from room status",
              );
              this.unsubscribeStatusFn();
              this.logCliEvent(
                flags,
                "room",
                "unsubscribedStatus",
                "Unsubscribed from room status",
              );
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              this.logCliEvent(
                flags,
                "room",
                "unsubscribeStatusError",
                `Error unsubscribing from status: ${errorMsg}`,
                { error: errorMsg },
              );
            }
          }

          try {
            this.logCliEvent(
              flags,
              "room",
              "releasing",
              `Releasing room ${roomId}`,
            );
            if (this.chatClient) {
              await this.chatClient.rooms.release(roomId);
              this.logCliEvent(
                flags,
                "room",
                "released",
                `Room ${roomId} released`,
              );
            } else {
              this.logCliEvent(
                flags,
                "room",
                "releaseError",
                "Chat client was null during cleanup",
                { error: "Chat client null" },
              );
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            this.logCliEvent(
              flags,
              "room",
              "releaseError",
              `Error releasing room: ${errorMsg}`,
              { error: errorMsg },
            );
            if (this.shouldOutputJson(flags)) {
              this.log(
                this.formatJsonOutput(
                  { error: errorMsg, roomId, success: false },
                  flags,
                ),
              );
            } else {
              this.log(`Error releasing room: ${errorMsg}`);
            }
          }

          if (this.ablyClient) {
            this.logCliEvent(
              flags,
              "connection",
              "closing",
              "Closing Realtime connection",
            );
            this.ablyClient.close();
            this.logCliEvent(
              flags,
              "connection",
              "closed",
              "Realtime connection closed",
            );
          }

          if (!this.shouldOutputJson(flags)) {
            this.log(chalk.green("Successfully disconnected."));
          }

          clearTimeout(forceExitTimeout);
          resolve();

          process.exit(0);
        };

        process.on("SIGINT", () => void cleanup());
        process.on("SIGTERM", () => void cleanup());
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, "reactions", "fatalError", `Error: ${errorMsg}`, {
        error: errorMsg,
        roomId: args.roomId,
      });
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { error: errorMsg, roomId: args.roomId, success: false },
            flags,
          ),
        );
      } else {
        this.error(`Error: ${errorMsg}`);
      }
    } finally {
      // Ensure client is closed even if cleanup promise didn't resolve
      if (
        this.ablyClient &&
        this.ablyClient.connection.state !== "closed" &&
        this.ablyClient.connection.state !== "failed"
      ) {
        this.logCliEvent(
          flags || {},
          "connection",
          "finalCloseAttempt",
          "Ensuring connection is closed in finally block.",
        );
        this.ablyClient.close();
      }
    }
  }

  private displayReactionSummary(
    summary: Record<string, { total: number; clientIds: string[] }>,
    flags: any
  ): void {
    for (const [reaction, data] of Object.entries(summary)) {
      this.log(
        `    ${chalk.yellow(reaction)}: ${chalk.white(data.total.toString())} from ${chalk.cyan(data.clientIds.join(", "))}`
      );
    }
  }

  private displayMultipleReactionSummary(
    summary: Record<string, { total: number; clientIds: Record<string, number> }>,
    flags: any
  ): void {
    for (const [reaction, data] of Object.entries(summary)) {
      this.log(
        `    ${chalk.yellow(reaction)}: ${chalk.white(data.total.toString())} total`
      );
      
      // Display client details for multiple reactions
      for (const [clientId, count] of Object.entries(data.clientIds)) {
        this.log(
          `      ${chalk.cyan(clientId)}: ${chalk.white(count.toString())}`
        );
      }
    }
  }
}
