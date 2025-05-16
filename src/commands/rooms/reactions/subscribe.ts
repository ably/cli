import { ChatClient, RoomStatus, Subscription } from "@ably/chat";
import { Args } from "@oclif/core";
import * as Ably from "ably"; // Import Ably
import chalk from "chalk";

import { ChatBaseCommand } from "../../../chat-base-command.js";

export default class RoomsReactionsSubscribe extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: "Room ID to subscribe to reactions in",
      required: true,
    }),
  };

  static override description = "Subscribe to reactions in a chat room";

  static override examples = [
    "$ ably rooms reactions subscribe my-room",
    "$ ably rooms reactions subscribe my-room --json",
    "$ ably rooms reactions subscribe my-room --pretty-json",
  ];

  static override flags = {
    ...ChatBaseCommand.globalFlags,
  };

  // private clients: ChatClients | null = null; // Replace with chatClient and ablyClient
  private chatClient: ChatClient | null = null;
  private ablyClient: Ably.Realtime | null = null;
  private unsubscribeReactionsFn: Subscription | null = null;
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
    const { args, flags } = await this.parse(RoomsReactionsSubscribe);

    try {
      // Create Chat client
      // this.clients = await this.createChatClient(flags) // Assign to chatClient
      this.chatClient = await this.createChatClient(flags);
      this.ablyClient = await this.createAblyClient(flags); // Also create Ably client
      // if (!this.clients) return // Check both clients
      if (!this.chatClient || !this.ablyClient) {
        this.error("Failed to initialize clients");
        return;
      }

      // const { chatClient, realtimeClient } = this.clients // Remove deconstruction
      const { roomId } = args;

      // Add listeners for connection state changes
      // realtimeClient.connection.on((stateChange: any) => { // Use ablyClient
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
        `Connecting to Ably and subscribing to reactions in room ${roomId}...`,
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(
          `Connecting to Ably and subscribing to reactions in room ${chalk.cyan(roomId)}...`,
        );
      }

      // Get the room
      this.logCliEvent(
        flags,
        "room",
        "gettingRoom",
        `Getting room handle for ${roomId}`,
      );
      // const room = await chatClient.rooms.get(roomId, { // Use this.chatClient
      const room = await this.chatClient.rooms.get(roomId);
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
                `Listening for reactions in room ${chalk.cyan(roomId)}. Press Ctrl+C to exit.`,
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

      // Subscribe to room reactions
      this.logCliEvent(
        flags,
        "reactions",
        "subscribing",
        "Subscribing to reactions",
      );
      this.unsubscribeReactionsFn = room.reactions.subscribe((reaction) => {
        const timestamp = new Date().toISOString(); // Chat SDK doesn't provide timestamp in event
        const eventData = {
          clientId: reaction.clientId,
          metadata: reaction.metadata,
          roomId,
          timestamp,
          type: reaction.type,
        };
        this.logCliEvent(
          flags,
          "reactions",
          "received",
          "Reaction received",
          eventData,
        );

        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput({ success: true, ...eventData }, flags),
          );
        } else {
          this.log(
            `[${chalk.dim(timestamp)}] ${chalk.green("⚡")} ${chalk.blue(reaction.clientId || "Unknown")} reacted with ${chalk.yellow(reaction.type || "unknown")}`,
          );

          // Show any additional metadata in the reaction
          if (reaction.metadata && Object.keys(reaction.metadata).length > 0) {
            this.log(
              `  ${chalk.dim("Metadata:")} ${this.formatJsonOutput(reaction.metadata, flags)}`,
            );
          }
        }
      });
      this.logCliEvent(
        flags,
        "reactions",
        "subscribed",
        "Successfully subscribed to reactions",
      );

      this.logCliEvent(
        flags,
        "reactions",
        "listening",
        "Listening for reactions...",
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
                "Unsubscribing from reactions",
              );
              this.unsubscribeReactionsFn.unsubscribe();
              this.logCliEvent(
                flags,
                "reactions",
                "unsubscribed",
                "Unsubscribed from reactions",
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
            // await chatClient.rooms.release(roomId); // Use this.chatClient
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

          // if (this.clients?.realtimeClient) { // Use this.ablyClient
          if (this.ablyClient) {
            this.logCliEvent(
              flags,
              "connection",
              "closing",
              "Closing Realtime connection",
            );
            // this.clients.realtimeClient.close(); // Use this.ablyClient
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

          process.exit(0); // Reinstated: Explicit exit after cleanup
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
}
