import type { LocationsEvents } from "@ably/spaces";

import { type Space } from "@ably/spaces";
import { Args, Flags as _Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { SpacesBaseCommand } from "../../../spaces-base-command.js";
import { BaseFlags } from "../../../types/cli.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

// Define interfaces for location types
interface SpaceMember {
  clientId: string;
  connectionId: string;
  isConnected: boolean;
  profileData: Record<string, unknown> | null;
}

interface LocationData {
  [key: string]: unknown;
}

interface LocationItem {
  location: LocationData;
  member: SpaceMember;
}

// Define type for subscription
interface LocationSubscription {
  unsubscribe: () => void;
}

export default class SpacesLocationsSubscribe extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: "Space ID to subscribe to locations for",
      required: true,
    }),
  };

  static override description = "Subscribe to location updates for members in a space";

  static override examples = [
    "$ ably spaces locations subscribe my-space",
    "$ ably spaces locations subscribe my-space --json",
    "$ ably spaces locations subscribe my-space --pretty-json",
    "$ ably spaces locations subscribe my-space --duration 30",
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
  private subscription: LocationSubscription | null = null;
  private locationHandler:
    | ((update: LocationsEvents.UpdateEvent) => void)
    | null = null;

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
    this.unsubscribeFromLocation();
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

  private unsubscribeFromLocation(): void {
    if (this.locationHandler && this.space) {
      try {
        this.space.locations.unsubscribe("update", this.locationHandler);
        this.locationHandler = null;
      } catch {
        // Ignore unsubscribe errors during cleanup
      }
    }

    if (this.subscription) {
      try {
        this.subscription.unsubscribe();
        this.subscription = null;
      } catch {
        // Ignore unsubscribe errors during cleanup
      }
    }
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocationsSubscribe);
    const { spaceId } = args;
    this.logCliEvent(flags, "subscribe.run", "start", `Starting spaces locations subscribe for space: ${spaceId}`);

    try {
      // Always show the readiness signal first, before attempting auth
      if (!this.shouldOutputJson(flags)) {
        this.log("Subscribing to location updates");
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

      // Get current locations
      this.logCliEvent(
        flags,
        "location",
        "gettingInitial",
        `Fetching initial locations for space ${spaceId}`,
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(
          `Fetching current locations for space ${chalk.cyan(spaceId)}...`,
        );
      }

      let locations: LocationItem[] = [];
      try {
        const result = await this.space.locations.getAll();
        this.logCliEvent(
          flags,
          "location",
          "gotInitial",
          `Fetched initial locations`,
          { locations: result },
        );

        if (result && typeof result === "object") {
          if (Array.isArray(result)) {
            // Unlikely based on current docs, but handle if API changes
            // Need to map Array result to LocationItem[] if structure differs
            this.logCliEvent(
              flags,
              "location",
              "initialFormatWarning",
              "Received array format for initial locations, expected object",
            );
            // Assuming array elements match expected structure for now:
            locations = result.map(
              (item: { location: LocationData; member: SpaceMember }) => ({
                location: item.location,
                member: item.member,
              }),
            );
          } else if (Object.keys(result).length > 0) {
            // Standard case: result is an object { connectionId: locationData }
            locations = Object.entries(result).map(
              ([connectionId, locationData]) => ({
                location: locationData as LocationData,
                member: {
                  // Construct a partial SpaceMember as SDK doesn't provide full details here
                  clientId: "unknown", // clientId not directly available in getAll response
                  connectionId,
                  isConnected: true, // Assume connected for initial state
                  profileData: null,
                },
              }),
            );
          }
        }

        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput(
              {
                locations: locations.map((item) => ({
                  // Map to a simpler structure for output if needed
                  connectionId: item.member.connectionId,
                  location: item.location,
                })),
                spaceId,
                success: true,
                type: "locations_snapshot",
              },
              flags,
            ),
          );
        } else if (locations.length === 0) {
          this.log(
            chalk.yellow("No locations are currently set in this space."),
          );
        } else {
          this.log(
            `\n${chalk.cyan("Current locations")} (${chalk.bold(locations.length.toString())}):\n`,
          );
          for (const item of locations) {
            this.log(
              `- Connection ID: ${chalk.blue(item.member.connectionId || "Unknown")}`,
            ); // Use connectionId as key
            this.log(
              `  ${chalk.dim("Location:")} ${JSON.stringify(item.location)}`,
            );
          }
        }
      } catch (error) {
        const errorMsg = `Error fetching locations: ${error instanceof Error ? error.message : String(error)}`;
        this.logCliEvent(flags, "location", "getInitialError", errorMsg, {
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
          this.log(chalk.yellow(errorMsg));
        }
      }

      this.logCliEvent(
        flags,
        "location",
        "subscribing",
        "Subscribing to location updates",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(
          `\n${chalk.dim("Subscribing to location updates. Press Ctrl+C to exit.")}\n`,
        );
      }
      this.logCliEvent(flags, "location.subscribe", "readySignalLogged", "Final readiness signal 'Subscribing to location updates' logged.");

      try {
        // Define the location update handler
        this.locationHandler = (update: LocationsEvents.UpdateEvent) => {
          try {
            const timestamp = new Date().toISOString();
            const eventData = {
              action: "update",
              location: update.currentLocation,
              member: {
                clientId: update.member.clientId,
                connectionId: update.member.connectionId,
              },
              previousLocation: update.previousLocation,
              timestamp,
            };
            this.logCliEvent(
              flags,
              "location",
              "updateReceived",
              "Location update received",
              { spaceId, ...eventData },
            );

            if (this.shouldOutputJson(flags)) {
              this.log(
                this.formatJsonOutput(
                  {
                    spaceId,
                    success: true,
                    type: "location_update",
                    ...eventData,
                  },
                  flags,
                ),
              );
            } else {
              this.log(
                `[${timestamp}] ${chalk.blue(update.member.clientId)} ${chalk.yellow("updated")} location:`,
              );
              this.log(
                `  ${chalk.dim("Current:")} ${JSON.stringify(update.currentLocation)}`,
              );
              this.log(
                `  ${chalk.dim("Previous:")} ${JSON.stringify(update.previousLocation)}`,
              );
            }
          } catch (error) {
            const errorMsg = `Error processing location update: ${error instanceof Error ? error.message : String(error)}`;
            this.logCliEvent(
              flags,
              "location",
              "updateProcessError",
              errorMsg,
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
              this.log(chalk.red(errorMsg));
            }
          }
        };

        // Subscribe to location updates
        this.space.locations.subscribe("update", this.locationHandler);

        // Create our subscription object for cleanup
        this.subscription = {
          unsubscribe: () => {
            if (this.locationHandler && this.space) {
              this.space.locations.unsubscribe("update", this.locationHandler);
              this.locationHandler = null;
            }
          },
        };

        this.logCliEvent(
          flags,
          "location",
          "subscribed",
          "Successfully subscribed to location updates",
        );
      } catch (error) {
        const errorMsg = `Error subscribing to location updates: ${error instanceof Error ? error.message : String(error)}`;
        this.logCliEvent(flags, "location", "subscribeError", errorMsg, {
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

      this.logCliEvent(
        flags,
        "location",
        "listening",
        "Listening for location updates...",
      );
      
      // Wait until the user interrupts or the optional duration elapses
      const effectiveDuration =
        typeof flags.duration === "number" && flags.duration > 0
          ? flags.duration
          : process.env.ABLY_CLI_DEFAULT_DURATION
          ? Number(process.env.ABLY_CLI_DEFAULT_DURATION)
          : undefined;

      const exitReason = await waitUntilInterruptedOrTimeout(effectiveDuration);
      this.logCliEvent(flags, "location", "runComplete", "Exiting wait loop", { exitReason });
      this.cleanupInProgress = exitReason === "signal";

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, "location", "fatalError", `Failed to subscribe to location updates: ${errorMsg}`, { error: errorMsg, spaceId });
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { error: errorMsg, spaceId, status: "error", success: false },
            flags,
          ),
        );
      } else {
        this.error(`Failed to subscribe to location updates: ${errorMsg}`);
      }
    } finally {
      // Wrap all cleanup in a timeout to prevent hanging
      await Promise.race([
        this.performCleanup(flags || {}),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            this.logCliEvent(flags || {}, "location", "cleanupTimeout", "Cleanup timed out after 5s, forcing completion");
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
    // Unsubscribe from location events with timeout
    this.unsubscribeFromLocation();

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
