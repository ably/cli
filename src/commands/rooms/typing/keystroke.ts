import { RoomStatus, ChatClient, RoomStatusChange } from "@ably/chat";
import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { ChatBaseCommand } from "../../../chat-base-command.js";

// The heartbeats are throttled to one every 10 seconds. There's a 2 second
// leeway to send a keystroke/heartbeat after the 10 second mark so the
// typing indicator won't flicker for others. The 2 second leeway is at the
// recipient side, we have 2 second window to publish the heartbeat and it
// should also arrive within this interval.
//
// The best thing to do to keep the indicator on is to keystroke() often.
const KEYSTROKE_INTERVAL = 450; // ms


export default class TypingStart extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: "The room ID to start typing in",
      required: true,
    }),
  };

  static override description =
    "Send a typing indicator in an Ably Chat room (use --autoType to keep typing automatically until terminated)";

  static override examples = [
    "$ ably rooms typing keystroke my-room",
    "$ ably rooms typing keystroke my-room --autoType",
    '$ ably rooms typing keystroke --api-key "YOUR_API_KEY" my-room',
    "$ ably rooms typing keystroke my-room --json",
    "$ ably rooms typing keystroke my-room --pretty-json",
  ];

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    autoType: Flags.boolean({
      description: "Automatically keep typing indicator active",
      default: false,
    }),
  };

  private chatClient: ChatClient | null = null;
  private ablyClient: Ably.Realtime | null = null;
  private typingIntervalId: NodeJS.Timeout | null = null;
  private unsubscribeStatusFn: (() => void) | null = null;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.typingIntervalId) {
      clearInterval(this.typingIntervalId);
      this.typingIntervalId = null;
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
    const { args, flags } = await this.parse(TypingStart);

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
            }

            // Start typing immediately
            this.logCliEvent(
              flags,
              "typing",
              "startAttempt",
              "Attempting to start typing...",
            );
            room.typing
              .keystroke()
              .then(() => {
                this.logCliEvent(
                  flags,
                  "typing",
                  "started",
                  "Successfully started typing",
                );
                if (!this.shouldOutputJson(flags)) {
                  this.log(`${chalk.green("Started typing in room.")}`);
                  if (flags.autoType) {
                    this.log(
                      `${chalk.dim("Will automatically remain typing until this command is terminated. Press Ctrl+C to exit.")}`,
                    );
                  } else {
                    this.log(
                      `${chalk.dim("Sent a single typing indicator. Use --autoType flag to keep typing automatically. Press Ctrl+C to exit.")}`,
                    );
                  }
                }

                // Keep typing active by calling keystroke() periodically if autoType is enabled
                if (this.typingIntervalId) clearInterval(this.typingIntervalId);

                if (flags.autoType) {
                  this.typingIntervalId = setInterval(() => {
                    room.typing.keystroke().catch((error: Error) => {
                      this.logCliEvent(
                        flags,
                        "typing",
                        "startErrorPeriodic",
                        `Error refreshing typing state: ${error.message}`,
                        { error: error.message },
                      );
                    });
                  }, KEYSTROKE_INTERVAL);
                }
              })
              .catch((error: Error) => {
                this.logCliEvent(
                  flags,
                  "typing",
                  "startErrorInitial",
                  `Failed to start typing initially: ${error.message}`,
                  { error: error.message },
                );
                if (!this.shouldOutputJson(flags)) {
                  this.error(`Failed to start typing: ${error.message}`);
                }
              });
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

      // Attach to the room
      this.logCliEvent(
        flags,
        "room",
        "attaching",
        `Attaching to room ${roomId}`,
      );
      await room.attach();
      // Successful attach and initial typing start logged by onStatusChange handler

      this.logCliEvent(
        flags,
        "typing",
        "listening",
        "Maintaining typing status...",
      );

      // Keep the process running until Ctrl+C
      await new Promise<void>((resolve) => {
        // This promise intentionally never resolves
        process.on("SIGINT", async () => {
          this.logCliEvent(
            flags,
            "typing",
            "cleanupInitiated",
            "Cleanup initiated (Ctrl+C pressed)",
          );
          if (!this.shouldOutputJson(flags)) {
            this.log("");
            this.log(
              `${chalk.yellow("Stopping typing and disconnecting from room...")}`,
            );
          }

          // Clear the typing interval
          if (this.typingIntervalId) {
            this.logCliEvent(
              flags,
              "typing",
              "clearingInterval",
              "Clearing typing refresh interval",
            );
            clearInterval(this.typingIntervalId);
            this.typingIntervalId = null;
          }

          // Clean up subscriptions
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

          // Stop typing explicitly (optional, but good practice)
          try {
            this.logCliEvent(
              flags,
              "typing",
              "stopAttempt",
              "Attempting to stop typing indicator",
            );
            await room.typing.stop();
            this.logCliEvent(
              flags,
              "typing",
              "stopped",
              "Stopped typing indicator",
            );
          } catch (error) {
            this.logCliEvent(
              flags,
              "typing",
              "stopError",
              "Error stopping typing",
              { error: error instanceof Error ? error.message : String(error) },
            );
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
            this.ablyClient.connection.off(); // unsubscribe connection events
            this.ablyClient.close(); // close client
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

          resolve();
          process.exit(0); // Explicitly exit to ensure process terminates
        });
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "typing",
        "fatalError",
        `Failed to start typing: ${errorMsg}`,
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
        this.error(`Failed to start typing: ${errorMsg}`);
      }
    }
  }
}
