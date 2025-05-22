import {
  ChatClient,
  RoomStatus,
  Subscription,
  RoomStatusChange,
} from "@ably/chat";
import { Args } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { ChatBaseCommand } from "../../../chat-base-command.js";

export default class TypingSubscribe extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: "The room ID to subscribe to typing indicators from",
      required: true,
    }),
  };

  static override description =
    "Subscribe to typing indicators in an Ably Chat room";

  static override examples = [
    "$ ably rooms typing subscribe my-room",
    '$ ably rooms typing subscribe --api-key "YOUR_API_KEY" my-room',
    "$ ably rooms typing subscribe my-room --json",
    "$ ably rooms typing subscribe my-room --pretty-json",
  ];

  static override flags = {
    ...ChatBaseCommand.globalFlags,
  };

  private chatClient: ChatClient | null = null;
  private ablyClient: Ably.Realtime | null = null;
  private unsubscribeStatusFn: (() => void) | null = null;
  private unsubscribeTypingFn: Subscription | null = null;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.unsubscribeTypingFn) {
      try {
        this.unsubscribeTypingFn.unsubscribe();
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
    const { args, flags } = await this.parse(TypingSubscribe);

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

      // Get the room with typing enabled
      this.logCliEvent(
        flags,
        "room",
        "gettingRoom",
        `Getting room handle for ${roomId}`,
      );
      const room = await this.chatClient.rooms.get(roomId, {});
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
      const { off: unsubscribeStatus } = room.onStatusChange(
        (statusChange: RoomStatusChange) => {
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

          if (statusChange.current === RoomStatus.Attached) {
            if (!this.shouldOutputJson(flags)) {
              this.log(
                `${chalk.green("Connected to room:")} ${chalk.bold(roomId)}`,
              );
              this.log(
                `${chalk.dim("Listening for typing indicators. Press Ctrl+C to exit.")}`,
              );
            }
          } else if (
            statusChange.current === RoomStatus.Failed &&
            !this.shouldOutputJson(flags)
          ) {
            this.error(
              `Failed to attach to room: ${reasonMsg || "Unknown error"}`,
            );
          }
        },
      );
      this.unsubscribeStatusFn = unsubscribeStatus;
      this.logCliEvent(
        flags,
        "room",
        "subscribedToStatus",
        "Successfully subscribed to room status changes",
      );

      // Set up typing indicators
      this.logCliEvent(
        flags,
        "typing",
        "subscribing",
        "Subscribing to typing indicators",
      );
      this.unsubscribeTypingFn = room.typing.subscribe(
        (typingSetEvent) => {
          const timestamp = new Date().toISOString();
          const currentlyTyping = [...(typingSetEvent.currentlyTyping || [])];
          const eventData = {
            currentlyTyping,
            roomId,
            timestamp,
          };
          this.logCliEvent(
            flags,
            "typing",
            "update",
            "Typing status update received",
            eventData,
          );

          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput({ success: true, ...eventData }, flags),
            );
          } else {
            // Clear the line and show who's typing
            process.stdout.write("\r\u001B[K"); // Clear line, move cursor to beginning

            if (currentlyTyping.length > 0) {
              const memberNames = currentlyTyping.join(", ");
              process.stdout.write(
                chalk.yellow(
                  `${memberNames} ${currentlyTyping.length === 1 ? "is" : "are"} typing...`,
                ),
              );
            }
          }
        },
      );
      this.logCliEvent(
        flags,
        "typing",
        "subscribed",
        "Successfully subscribed to typing indicators",
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

      this.logCliEvent(
        flags,
        "typing",
        "listening",
        "Listening for typing indicators...",
      );
      // Keep the process running until Ctrl+C
      await new Promise(() => {
        // This promise intentionally never resolves
        process.on("SIGINT", async () => {
          this.logCliEvent(
            flags,
            "typing",
            "cleanupInitiated",
            "Cleanup initiated (Ctrl+C pressed)",
          );
          if (!this.shouldOutputJson(flags)) {
            // Move to a new line to not override typing status
            this.log("\n");
            this.log(`${chalk.yellow("Disconnecting from room...")}`);
          }

          // Clean up subscriptions
          if (this.unsubscribeTypingFn) {
            try {
              this.logCliEvent(
                flags,
                "typing",
                "unsubscribing",
                "Unsubscribing from typing indicators",
              );
              this.unsubscribeTypingFn.unsubscribe();
              this.logCliEvent(
                flags,
                "typing",
                "unsubscribed",
                "Unsubscribed from typing indicators",
              );
            } catch (error) {
              this.logCliEvent(
                flags,
                "typing",
                "unsubscribeError",
                "Error unsubscribing typing",
                {
                  error: error instanceof Error ? error.message : String(error),
                },
              );
            }
          }

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
              this.logCliEvent(
                flags,
                "room",
                "unsubscribeStatusError",
                "Error unsubscribing status",
                {
                  error: error instanceof Error ? error.message : String(error),
                },
              );
            }
          }

          // Release the room and close connection
          try {
            this.logCliEvent(
              flags,
              "room",
              "releasing",
              `Releasing room ${roomId}`,
            );
            await this.chatClient?.rooms.release(roomId);
            this.logCliEvent(
              flags,
              "room",
              "released",
              `Room ${roomId} released`,
            );
          } catch (error) {
            this.logCliEvent(
              flags,
              "room",
              "releaseError",
              "Error releasing room",
              { error: error instanceof Error ? error.message : String(error) },
            );
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
            this.log(`${chalk.green("Successfully disconnected.")}`);
          }

          process.exit(0); // Reinstated: Explicit exit
        });
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "typing",
        "fatalError",
        `Failed to subscribe to typing indicators: ${errorMsg}`,
        { error: errorMsg, roomId: args.roomId },
      );
      // Close the connection in case of error
      if (this.ablyClient) {
        this.ablyClient.close();
      }

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { error: errorMsg, roomId: args.roomId, success: false },
            flags,
          ),
        );
      } else {
        this.error(`Failed to subscribe to typing indicators: ${errorMsg}`);
      }
    }
  }
}
