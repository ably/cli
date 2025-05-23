import Spaces, { type CursorUpdate, type Space } from "@ably/spaces";
import { Args, Flags as _Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { SpacesBaseCommand } from "../../../spaces-base-command.js";

export default class SpacesCursorsSubscribe extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: "Space ID to subscribe to cursors for",
      required: true,
    }),
  };

  static override description = "Subscribe to cursor movements in a space";

  static override examples = [
    "$ ably spaces cursors subscribe my-space",
    "$ ably spaces cursors subscribe my-space --json",
    "$ ably spaces cursors subscribe my-space --pretty-json",
  ];

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
  };

  private cleanupInProgress = false;
  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: Spaces | null = null;
  private space: Space | null = null;
  private listener: ((update: CursorUpdate) => void) | null = null;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.listener && this.space) {
      try {
        await this.space.cursors.unsubscribe(this.listener);
      } catch {
        /* ignore */
      }
    }
    // No need to explicitly leave space here as cleanup handles it
    if (
      this.realtimeClient &&
      this.realtimeClient.connection.state !== "closed" &&
      this.realtimeClient.connection.state !== "failed"
    ) {
      this.realtimeClient.close();
    }

    return super.finally(err);
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesCursorsSubscribe);
    const { spaceId } = args;

    try {
      // Create Spaces client using setupSpacesClient
      const setupResult = await this.setupSpacesClient(flags, spaceId);
      this.realtimeClient = setupResult.realtimeClient;
      this.spacesClient = setupResult.spacesClient;
      this.space = setupResult.space;
      if (!this.realtimeClient || !this.spacesClient || !this.space) {
        this.error("Failed to initialize clients or space");
        return;
      }

      // Add listeners for connection state changes
      this.realtimeClient.connection.on(
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

      // Make sure we have a connection before proceeding
      this.logCliEvent(
        flags,
        "connection",
        "waiting",
        "Waiting for connection to establish...",
      );
      await new Promise<void>((resolve, reject) => {
        const checkConnection = () => {
          const { state } = this.realtimeClient!.connection;
          if (state === "connected") {
            this.logCliEvent(
              flags,
              "connection",
              "connected",
              "Realtime connection established.",
            );
            resolve();
          } else if (
            state === "failed" ||
            state === "closed" ||
            state === "suspended"
          ) {
            const errorMsg = `Connection failed with state: ${state}`;
            this.logCliEvent(flags, "connection", "failed", errorMsg, {
              state,
            });
            reject(new Error(errorMsg));
          } else {
            // Still connecting, check again shortly
            setTimeout(checkConnection, 100);
          }
        };

        checkConnection();
      });

      // Get the space
      this.logCliEvent(
        flags,
        "spaces",
        "gettingSpace",
        `Getting space: ${spaceId}...`,
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(`Connecting to space: ${chalk.cyan(spaceId)}...`);
      }

      this.logCliEvent(
        flags,
        "spaces",
        "gotSpace",
        `Successfully got space handle: ${spaceId}`,
      );

      // Enter the space
      this.logCliEvent(flags, "spaces", "entering", "Entering space...");
      await this.space.enter();
      this.logCliEvent(
        flags,
        "spaces",
        "entered",
        "Successfully entered space",
        { clientId: this.realtimeClient!.auth.clientId },
      );

      // Subscribe to cursor updates
      this.logCliEvent(
        flags,
        "cursor",
        "subscribing",
        "Subscribing to cursor updates",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(
          `\n${chalk.dim("Subscribing to cursor movements. Press Ctrl+C to exit.")}\n`,
        );
      }

      try {
        // Define the listener function
        this.listener = (cursorUpdate: CursorUpdate) => {
          try {
            const timestamp = new Date().toISOString();
            const eventData = {
              member: {
                clientId: cursorUpdate.clientId,
                connectionId: cursorUpdate.connectionId,
              },
              position: cursorUpdate.position,
              spaceId,
              timestamp,
              type: "cursor_update",
            };
            this.logCliEvent(
              flags,
              "cursor",
              "updateReceived",
              "Cursor update received",
              eventData,
            );

            if (this.shouldOutputJson(flags)) {
              this.log(
                this.formatJsonOutput({ success: true, ...eventData }, flags),
              );
            } else {
              this.log(
                `[${timestamp}] ${chalk.blue(cursorUpdate.clientId)} ${chalk.dim("position:")} ${JSON.stringify(cursorUpdate.position)}`,
              );
            }
          } catch (error) {
            const errorMsg = `Error processing cursor update: ${error instanceof Error ? error.message : String(error)}`;
            this.logCliEvent(flags, "cursor", "updateProcessError", errorMsg, {
              error: errorMsg,
              spaceId,
            });
            if (this.shouldOutputJson(flags)) {
              this.log(
                this.formatJsonOutput(
                  { error: errorMsg, spaceId, status: "error", success: false },
                  flags,
                ),
              );
            } else {
              this.log(chalk.red(errorMsg));
            }
          }
        };

        // Subscribe using the listener
        await this.space.cursors.subscribe("update", this.listener);

        this.logCliEvent(
          flags,
          "cursor",
          "subscribed",
          "Successfully subscribed to cursor updates",
        );
      } catch (error) {
        const errorMsg = `Error subscribing to cursor updates: ${error instanceof Error ? error.message : String(error)}`;
        this.logCliEvent(flags, "cursor", "subscribeError", errorMsg, {
          error: errorMsg,
          spaceId,
        });
        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput(
              { error: errorMsg, spaceId, status: "error", success: false },
              flags,
            ),
          );
        } else {
          this.log(chalk.red(errorMsg));
          this.log(
            chalk.yellow(
              "Will continue running, but may not receive cursor updates.",
            ),
          );
        }
      }

      this.logCliEvent(
        flags,
        "cursor",
        "listening",
        "Listening for cursor updates...",
      );
      // Keep the process running until interrupted
      await new Promise<void>((resolve, reject) => {
        const cleanup = async () => {
          if (this.cleanupInProgress) return;
          this.cleanupInProgress = true;
          this.logCliEvent(
            flags,
            "cursor",
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
            this.logCliEvent(flags, "cursor", "forceExit", errorMsg, {
              spaceId,
            });
            if (!this.shouldOutputJson(flags)) {
              this.log(chalk.red("Force exiting after timeout..."));
            }

            this.exit(1);
          }, 5000);

          try {
            // Unsubscribe from cursor events
            if (this.listener && this.space) {
              try {
                this.logCliEvent(
                  flags,
                  "cursor",
                  "unsubscribing",
                  "Unsubscribing from cursor events",
                );
                await this.space.cursors.unsubscribe(this.listener);
                this.logCliEvent(
                  flags,
                  "cursor",
                  "unsubscribed",
                  "Successfully unsubscribed from cursor events",
                );
              } catch (error) {
                const errorMsg = `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`;
                this.logCliEvent(
                  flags,
                  "cursor",
                  "unsubscribeError",
                  errorMsg,
                  { error: errorMsg, spaceId },
                );
                if (this.shouldOutputJson(flags)) {
                  this.log(
                    this.formatJsonOutput(
                      {
                        error: errorMsg,
                        spaceId,
                        status: "error",
                        success: false,
                      },
                      flags,
                    ),
                  );
                } else {
                  this.log(`Note: ${errorMsg}`);
                  this.log("Continuing with cleanup.");
                }
              }
            }

            if (this.space) {
              try {
                // Leave the space
                this.logCliEvent(
                  flags,
                  "spaces",
                  "leaving",
                  "Leaving space...",
                );
                await this.space.leave();
                this.logCliEvent(
                  flags,
                  "spaces",
                  "left",
                  "Successfully left space",
                );
              } catch (error) {
                const errorMsg = `Error leaving space: ${error instanceof Error ? error.message : String(error)}`;
                this.logCliEvent(flags, "spaces", "leaveError", errorMsg, {
                  error: errorMsg,
                  spaceId,
                });
                if (this.shouldOutputJson(flags)) {
                  this.log(
                    this.formatJsonOutput(
                      {
                        error: errorMsg,
                        spaceId,
                        status: "error",
                        success: false,
                      },
                      flags,
                    ),
                  );
                } else {
                  this.log(`Error leaving space: ${errorMsg}`);
                  this.log("Continuing with cleanup.");
                }
              }
            }

            try {
              if (
                this.realtimeClient &&
                this.realtimeClient.connection.state !== "closed"
              ) {
                this.logCliEvent(
                  flags,
                  "connection",
                  "closing",
                  "Closing Realtime connection",
                );
                this.realtimeClient.close();
                this.logCliEvent(
                  flags,
                  "connection",
                  "closed",
                  "Realtime connection closed",
                );
              }
            } catch (error) {
              const errorMsg = `Error closing client: ${error instanceof Error ? error.message : String(error)}`;
              this.logCliEvent(flags, "connection", "closeError", errorMsg, {
                error: errorMsg,
                spaceId,
              });
              if (this.shouldOutputJson(flags)) {
                this.log(
                  this.formatJsonOutput(
                    {
                      error: errorMsg,
                      spaceId,
                      status: "error",
                      success: false,
                    },
                    flags,
                  ),
                );
              } else {
                this.log(errorMsg);
              }
            }

            clearTimeout(forceExitTimeout);
            this.logCliEvent(
              flags,
              "cursor",
              "cleanupComplete",
              "Cleanup complete",
            );
            if (!this.shouldOutputJson(flags)) {
              this.log(chalk.green("\nDisconnected."));
            }

            resolve();
          } catch (error) {
            const errorMsg = `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`;
            this.logCliEvent(flags, "cursor", "cleanupError", errorMsg, {
              error: errorMsg,
              spaceId,
            });
            if (this.shouldOutputJson(flags)) {
              this.log(
                this.formatJsonOutput(
                  { error: errorMsg, spaceId, status: "error", success: false },
                  flags,
                ),
              );
            } else {
              this.log(`Error during cleanup: ${errorMsg}`);
            }

            clearTimeout(forceExitTimeout);
            reject(new Error(errorMsg));
          }
        };

        process.once("SIGINT", cleanup);
        process.once("SIGTERM", cleanup);
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "cursor",
        "fatalError",
        `Failed to subscribe to cursors: ${errorMsg}`,
        { error: errorMsg, spaceId },
      );
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { error: errorMsg, spaceId, status: "error", success: false },
            flags,
          ),
        );
      } else {
        this.error(`Failed to subscribe to cursors: ${errorMsg}`);
      }
    }
  }
}
