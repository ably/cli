import Spaces, { type CursorUpdate, type Space } from "@ably/spaces";
import { Args, Flags as _Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { SpacesBaseCommand } from "../../../spaces-base-command.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

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
    "$ ably spaces cursors subscribe my-space --duration 30",
  ];

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    duration: _Flags.integer({
      description: "Automatically exit after the given number of seconds (0 = run indefinitely)",
      char: "D",
      required: false,
    }),
  };

  private cleanupInProgress = false;
  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: unknown | null = null;
  private space: Space | null = null;
  private listener: ((update: CursorUpdate) => void) | null = null;

  private async properlyCloseAblyClient(): Promise<void> {
    if (!this.realtimeClient || this.realtimeClient.connection.state === 'closed' || this.realtimeClient.connection.state === 'failed') {
      return;
    }

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 2000);

      const onClosedOrFailed = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.realtimeClient!.connection.once('closed', onClosedOrFailed);
      this.realtimeClient!.connection.once('failed', onClosedOrFailed);
      this.realtimeClient!.close();
    });
  }

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
    if (!this.cleanupInProgress && this.space) {
      try {
        await this.space.leave();
      } catch {
        /* ignore */
      } // Best effort
    }

    await this.properlyCloseAblyClient();
    return super.finally(err);
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesCursorsSubscribe);
    const { spaceId } = args;

    try {
      // Always show the readiness signal first, before attempting auth
      if (!this.shouldOutputJson(flags)) {
        this.log("Subscribing to cursor updates");
      }

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
      
      // Wait until the user interrupts or the optional duration elapses
      const effectiveDuration =
        typeof flags.duration === "number" && flags.duration > 0
          ? flags.duration
          : process.env.ABLY_CLI_DEFAULT_DURATION
          ? Number(process.env.ABLY_CLI_DEFAULT_DURATION)
          : undefined;

      const exitReason = await waitUntilInterruptedOrTimeout(effectiveDuration);
      this.logCliEvent(flags, "cursor", "runComplete", "Exiting wait loop", { exitReason });
      this.cleanupInProgress = exitReason === "signal";

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
    } finally {
      // Wrap all cleanup in a timeout to prevent hanging
      await Promise.race([
        this.performCleanup(flags || {}),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            this.logCliEvent(flags || {}, "cursor", "cleanupTimeout", "Cleanup timed out after 5s, forcing completion");
            resolve();
          }, 5000);
        })
      ]);

      if (!this.shouldOutputJson(flags || {})) {
        if (this.cleanupInProgress) {
          this.log(chalk.green("Graceful shutdown complete (user interrupt)."));
        } else {
          this.log(chalk.green("Duration elapsed – command finished cleanly."));
        }
      }
    }
  }

  private async performCleanup(flags: any): Promise<void> {
    // Unsubscribe from cursor events with timeout
    if (this.listener && this.space) {
      try {
        await Promise.race([
          this.space.cursors.unsubscribe(this.listener),
          new Promise<void>((resolve) => setTimeout(resolve, 1000))
        ]);
        this.logCliEvent(flags, "cursor", "unsubscribedEventsFinally", "Unsubscribed cursor listener.");
      } catch (error) {
        this.logCliEvent(flags, "cursor", "unsubscribeErrorFinally", `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Leave space with timeout
    if (this.space) {
      try {
        this.logCliEvent(flags, "spaces", "leavingFinally", "Leaving space.");
        await Promise.race([
          this.space.leave(),
          new Promise<void>((resolve) => setTimeout(resolve, 2000))
        ]);
        this.logCliEvent(flags, "spaces", "leftFinally", "Successfully left space.");
      } catch (error) {
        this.logCliEvent(flags, "spaces", "leaveErrorFinally", `Error leaving space: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Close Ably client (already has internal timeout)
    this.logCliEvent(flags, "connection", "closingClientFinally", "Closing Ably client.");
    await this.properlyCloseAblyClient();
    this.logCliEvent(flags, "connection", "clientClosedFinally", "Ably client close attempt finished.");
  }
}
