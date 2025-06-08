import { type Lock, type Space } from "@ably/spaces";
import { Args, Flags as _Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { SpacesBaseCommand } from "../../../spaces-base-command.js";
import { BaseFlags } from "../../../types/cli.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

export default class SpacesLocksSubscribe extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: "Space ID to subscribe to locks for",
      required: true,
    }),
  };

  static override description = "Subscribe to lock events in a space";

  static override examples = [
    "$ ably spaces locks subscribe my-space",
    "$ ably spaces locks subscribe my-space --json",
    "$ ably spaces locks subscribe my-space --pretty-json",
    "$ ably spaces locks subscribe my-space --duration 30",
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
  private listener: ((lock: Lock) => void) | null = null;

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
        await this.space.locks.unsubscribe(this.listener);
      } catch {
        /* ignore */
      }
    }
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
    const { args, flags } = await this.parse(SpacesLocksSubscribe);
    const { spaceId } = args;
    this.logCliEvent(flags, "subscribe.run", "start", `Starting spaces locks subscribe for space: ${spaceId}`);

    try {
      // Always show the readiness signal first, before attempting auth
      if (!this.shouldOutputJson(flags)) {
        this.log("Subscribing to lock events");
      }
      this.logCliEvent(flags, "subscribe.run", "initialSignalLogged", "Initial readiness signal logged.");

      // Create Spaces client using setupSpacesClient
      this.logCliEvent(flags, "subscribe.clientSetup", "attemptingClientCreation", "Attempting to create Spaces and Ably clients.");
      const setupResult = await this.setupSpacesClient(flags, spaceId);
      this.realtimeClient = setupResult.realtimeClient;
      this.spacesClient = setupResult.spacesClient;
      this.space = setupResult.space;
      if (!this.realtimeClient || !this.spacesClient || !this.space) {
        this.logCliEvent(flags, "subscribe.clientSetup", "clientCreationFailed", "Client or space setup failed.");
        this.error("Failed to initialize clients or space");
        return;
      }
      this.logCliEvent(flags, "subscribe.clientSetup", "clientCreationSuccess", "Spaces and Ably clients created.");

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

      if (!this.shouldOutputJson(flags)) {
        this.log(`Connecting to space: ${chalk.cyan(spaceId)}...`);
      }

      // Get current locks
      this.logCliEvent(
        flags,
        "lock",
        "gettingInitial",
        "Fetching initial locks",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(`Fetching current locks for space ${chalk.cyan(spaceId)}...`);
      }

      const locks = await this.space.locks.getAll();
      this.logCliEvent(
        flags,
        "lock",
        "gotInitial",
        `Fetched ${locks.length} initial locks`,
        { count: locks.length, locks },
      );

      // Output current locks
      if (locks.length === 0) {
        if (!this.shouldOutputJson(flags)) {
          this.log(chalk.yellow("No locks are currently active in this space."));
        }
      } else if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              locks: locks.map((lock) => ({
                id: lock.id,
                member: lock.member,
                status: lock.status,
              })),
              spaceId,
              status: "connected",
              success: true,
            },
            flags,
          ),
        );
      } else {
        this.log(
          `\n${chalk.cyan("Current locks")} (${chalk.bold(locks.length.toString())}):\n`,
        );

        for (const lock of locks) {
          this.log(`- Lock ID: ${chalk.blue(lock.id)}`);
          this.log(`  ${chalk.dim("Status:")} ${lock.status}`);
          this.log(
            `  ${chalk.dim("Member:")} ${lock.member?.clientId || "Unknown"}`,
          );

          if (lock.member?.connectionId) {
            this.log(
              `  ${chalk.dim("Connection ID:")} ${lock.member.connectionId}`,
            );
          }
        }
      }

      // Subscribe to lock events
      this.logCliEvent(
        flags,
        "lock",
        "subscribing",
        "Subscribing to lock events",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(
          `\n${chalk.dim("Subscribing to lock events. Press Ctrl+C to exit.")}\n`,
        );
      }
      this.logCliEvent(flags, "lock.subscribe", "readySignalLogged", "Final readiness signal 'Subscribing to lock events' logged.");

      // Define the listener function
      this.listener = (lock: Lock) => {
        const timestamp = new Date().toISOString();

        const eventData = {
          lock: {
            id: lock.id,
            member: lock.member,
            status: lock.status,
          },
          spaceId,
          timestamp,
          type: "lock_event",
        };

        this.logCliEvent(
          flags,
          "lock",
          "event-update",
          "Lock event received",
          eventData,
        );

        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput({ success: true, ...eventData }, flags),
          );
        } else {
          this.log(
            `[${timestamp}] 🔒 Lock ${chalk.blue(lock.id)} updated`,
          );
          this.log(
            `  ${chalk.dim("Status:")} ${lock.status}`,
          );
          this.log(
            `  ${chalk.dim("Member:")} ${lock.member?.clientId || "Unknown"}`,
          );

          if (lock.member?.connectionId) {
            this.log(
              `  ${chalk.dim("Connection ID:")} ${lock.member.connectionId}`,
            );
          }
        }
      };

      // Subscribe using the stored listener
      await this.space.locks.subscribe(this.listener);

      this.logCliEvent(
        flags,
        "lock",
        "subscribed",
        "Successfully subscribed to lock events",
      );

      this.logCliEvent(
        flags,
        "lock",
        "listening",
        "Listening for lock events...",
      );
      
      // Wait until the user interrupts or the optional duration elapses
      const effectiveDuration =
        typeof flags.duration === "number" && flags.duration > 0
          ? flags.duration
          : process.env.ABLY_CLI_DEFAULT_DURATION
          ? Number(process.env.ABLY_CLI_DEFAULT_DURATION)
          : undefined;

      const exitReason = await waitUntilInterruptedOrTimeout(effectiveDuration);
      this.logCliEvent(flags, "lock", "runComplete", "Exiting wait loop", { exitReason });
      this.cleanupInProgress = exitReason === "signal";

    } catch (error) {
      const errorMsg = `Error during execution: ${error instanceof Error ? error.message : String(error)}`;
      this.logCliEvent(flags, "lock", "executionError", errorMsg, { error: errorMsg });
      if (!this.shouldOutputJson(flags)) {
        this.log(chalk.red(errorMsg));
      }
    } finally {
      // Wrap all cleanup in a timeout to prevent hanging
      await Promise.race([
        this.performCleanup(flags || {}),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            this.logCliEvent(flags || {}, "lock", "cleanupTimeout", "Cleanup timed out after 5s, forcing completion");
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

  private async performCleanup(flags: BaseFlags): Promise<void> {
    // Unsubscribe from lock events with timeout
    if (this.listener && this.space) {
      try {
        await Promise.race([
          this.space.locks.unsubscribe(this.listener),
          new Promise<void>((resolve) => setTimeout(resolve, 1000))
        ]);
        this.logCliEvent(flags, "lock", "unsubscribedEventsFinally", "Unsubscribed lock listener.");
      } catch (error) {
        this.logCliEvent(flags, "lock", "unsubscribeErrorFinally", `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`);
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
