import { OccupancyEvent, RoomStatus, Subscription } from "@ably/chat";
import { Args } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { ChatBaseCommand } from "../../../chat-base-command.js";

export interface OccupancyMetrics {
  connections?: number;
  presenceMembers?: number;
}

export default class RoomsOccupancySubscribe extends ChatBaseCommand {
  static args = {
    roomId: Args.string({
      description: "Room ID to subscribe to occupancy for",
      required: true,
    }),
  };

  static description = "Subscribe to real-time occupancy metrics for a room";

  static examples = [
    "$ ably rooms occupancy subscribe my-room",
    "$ ably rooms occupancy subscribe my-room --json",
    "$ ably rooms occupancy subscribe --pretty-json my-room",
  ];

  static flags = {
    ...ChatBaseCommand.globalFlags,
  };

  private cleanupInProgress = false;
  private ablyClient: Ably.Realtime | null = null;
  private unsubscribeOccupancyFn: Subscription | null = null;
  private unsubscribeStatusFn: (() => void) | null = null;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.unsubscribeOccupancyFn) {
      try {
        this.unsubscribeOccupancyFn.unsubscribe();
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
    const { args, flags } = await this.parse(RoomsOccupancySubscribe);
    const { roomId } = args;

    try {
      this.logCliEvent(
        flags,
        "subscribe",
        "connecting",
        "Connecting to Ably...",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log("Connecting to Ably...");
      }

      // Create Chat client
      const chatClient = await this.createChatClient(flags);
      // Also get the underlying Ably client for cleanup and state listeners
      this.ablyClient = await this.createAblyClient(flags);

      if (!chatClient) {
        this.error("Failed to create Chat client");
        return;
      }
      if (!this.ablyClient) {
        this.error("Failed to create Ably client"); // Should not happen if chatClient created
        return;
      }

      // Add listeners for connection state changes
      this.ablyClient.connection.on(
        (stateChange: Ably.ConnectionStateChange) => {
          this.logCliEvent(
            flags,
            "connection",
            stateChange.current,
            `Connection state changed to ${stateChange.current}`,
            { reason: stateChange.reason },
          );
        },
      );

      // Get the room with occupancy option enabled
      this.logCliEvent(
        flags,
        "room",
        "gettingRoom",
        `Getting room handle for ${roomId}`,
      );
      const room = await chatClient.rooms.get(roomId, {
        occupancy: {},
      });
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
              this.log("Successfully connected to Ably");
              this.log(
                `Subscribing to occupancy events for room '${roomId}'...`,
              );
            }

            break;
          }

          case RoomStatus.Detached: {
            if (!this.shouldOutputJson(flags)) {
              this.log("Disconnected from Ably");
            }

            break;
          }

          case RoomStatus.Failed: {
            if (!this.shouldOutputJson(flags)) {
              this.error(`Connection failed: ${reasonMsg || "Unknown error"}`);
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

      this.logCliEvent(
        flags,
        "occupancy",
        "listening",
        "Listening for occupancy updates...",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log("Listening for occupancy updates. Press Ctrl+C to exit.");
      }

      // Get the initial occupancy metrics
      this.logCliEvent(
        flags,
        "occupancy",
        "gettingInitial",
        "Fetching initial occupancy metrics",
      );
      try {
        const initialOccupancy = await room.occupancy.get();
        this.logCliEvent(
          flags,
          "occupancy",
          "gotInitial",
          "Initial occupancy metrics fetched",
          { metrics: initialOccupancy },
        );
        this.displayOccupancyMetrics(initialOccupancy, roomId, flags, true);
      } catch (error) {
        const errorMsg = `Failed to fetch initial occupancy: ${error instanceof Error ? error.message : String(error)}`;
        this.logCliEvent(flags, "occupancy", "getInitialError", errorMsg, {
          error: errorMsg,
        });
        if (!this.shouldOutputJson(flags)) {
          this.log(chalk.yellow(errorMsg));
        }
      }

      // Subscribe to occupancy events
      this.logCliEvent(
        flags,
        "occupancy",
        "subscribing",
        "Subscribing to occupancy updates",
      );
      this.unsubscribeOccupancyFn = room.occupancy.subscribe(
        (occupancyMetrics: OccupancyEvent) => {
          this.logCliEvent(
            flags,
            "occupancy",
            "updateReceived",
            "Occupancy update received",
            { metrics: occupancyMetrics },
          );
          this.displayOccupancyMetrics(occupancyMetrics, roomId, flags);
        },
      );
      this.logCliEvent(
        flags,
        "occupancy",
        "subscribed",
        "Successfully subscribed to occupancy updates",
      );

      // Keep the process running until interrupted
      await new Promise<void>((resolve, _reject) => {
        const cleanup = () => {
          if (this.cleanupInProgress) {
            return;
          }
          this.cleanupInProgress = true;
          this.logCliEvent(
            flags,
            "occupancy",
            "cleanupInitiated",
            "Cleanup initiated (Ctrl+C pressed)",
          );
          if (!this.shouldOutputJson(flags)) {
            this.log("\nUnsubscribing and closing connection...");
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            const errorMsg = "Force exiting after timeout during cleanup";
            this.logCliEvent(flags, "occupancy", "forceExit", errorMsg, {
              roomId,
            });
            if (!this.shouldOutputJson(flags)) {
              this.log(chalk.red("Force exiting after timeout..."));
            }

            // SIGINT/SIGTERM received, or fatal error
            this.log(chalk.yellow("Closing connection..."));
            this.ablyClient?.close();

            process.exit(0);
          }, 5000);

          // Unsubscribe from occupancy events
          if (this.unsubscribeOccupancyFn) {
            try {
              this.logCliEvent(
                flags,
                "occupancy",
                "unsubscribing",
                "Unsubscribing from occupancy events",
              );
              this.unsubscribeOccupancyFn.unsubscribe();
              this.logCliEvent(
                flags,
                "occupancy",
                "unsubscribed",
                "Unsubscribed from occupancy events",
              );
            } catch (error) {
              this.logCliEvent(
                flags,
                "occupancy",
                "unsubscribeError",
                "Error unsubscribing occupancy",
                {
                  error: error instanceof Error ? error.message : String(error),
                },
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

          const releaseAndClose = async () => {
            try {
              this.logCliEvent(
                flags,
                "room",
                "releasing",
                `Releasing room ${roomId}`,
              );
              await chatClient.rooms.release(roomId);
              this.logCliEvent(
                flags,
                "room",
                "released",
                `Room ${roomId} released`,
              );
            } catch (error) {
              const errorMsg = `Error releasing room: ${error instanceof Error ? error.message : String(error)}`;
              this.logCliEvent(flags, "room", "releaseError", errorMsg, {
                error: errorMsg,
              });
              if (this.shouldOutputJson(flags)) {
                this.log(
                  this.formatJsonOutput(
                    { error: errorMsg, roomId, success: false },
                    flags,
                  ),
                );
              } else {
                this.log(errorMsg);
              }
            }

            if (
              this.ablyClient &&
              this.ablyClient.connection.state !== "closed"
            ) {
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

            clearTimeout(forceExitTimeout);
            this.logCliEvent(
              flags,
              "occupancy",
              "cleanupComplete",
              "Cleanup complete",
            );
            if (!this.shouldOutputJson(flags)) {
              this.log(chalk.green("\nSuccessfully disconnected."));
            }

            resolve();
          };

          void releaseAndClose();
        };

        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
      });
    } catch (error) {
      const errorMsg = `Error: ${error instanceof Error ? error.message : String(error)}`;
      this.logCliEvent(flags, "occupancy", "fatalError", errorMsg, {
        error: errorMsg,
        roomId,
      });
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { error: errorMsg, roomId, success: false },
            flags,
          ),
        );
      } else {
        this.error(errorMsg);
      }
    } finally {
      // Ensure client is closed even if cleanup promise didn't resolve
      if (this.ablyClient && this.ablyClient.connection.state !== "closed") {
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

  private displayOccupancyMetrics(
    occupancyMetrics: OccupancyMetrics,
    roomId: string,
    flags: Record<string, unknown>,
    isInitial = false,
  ): void {
    const timestamp = new Date().toISOString();
    const logData = {
      metrics: occupancyMetrics,
      roomId,
      timestamp,
      type: isInitial ? "initialSnapshot" : "update",
    };
    this.logCliEvent(
      flags,
      "occupancy",
      isInitial ? "initialMetrics" : "updateReceived",
      isInitial ? "Initial occupancy metrics" : "Occupancy update received",
      logData,
    );

    if (this.shouldOutputJson(flags)) {
      this.log(this.formatJsonOutput({ success: true, ...logData }, flags));
    } else {
      const prefix = isInitial ? "Initial occupancy" : "Occupancy update";
      this.log(`[${timestamp}] ${prefix} for room '${roomId}'`);
      this.log(`  Connections: ${occupancyMetrics.connections ?? 0}`);

      if (occupancyMetrics.presenceMembers !== undefined) {
        this.log(`  Presence Members: ${occupancyMetrics.presenceMembers}`);
      }

      this.log(""); // Empty line for better readability
    }
  }
}
