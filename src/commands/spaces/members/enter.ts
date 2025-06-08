import type { ProfileData, SpaceMember } from "@ably/spaces";

import { type Space } from "@ably/spaces";
import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { SpacesBaseCommand } from "../../../spaces-base-command.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

export default class SpacesMembersEnter extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: "Space ID to enter",
      required: true,
    }),
  };

  static override description =
    "Enter a space and remain present until terminated";

  static override examples = [
    "$ ably spaces members enter my-space",
    '$ ably spaces members enter my-space --profile \'{"name":"User","status":"active"}\'',
    "$ ably spaces members enter my-space --duration 30",
  ];

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    profile: Flags.string({
      description:
        "Optional profile data to include with the member (JSON format)",
      required: false,
    }),
    duration: Flags.integer({
      description: "Automatically exit after the given number of seconds (0 = run indefinitely)",
      char: "D",
      required: false,
    }),
  };

  private cleanupInProgress = false;
  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: unknown | null = null;
  private space: Space | null = null;
  private listener: ((member: SpaceMember) => void) | null = null;

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
        await this.space.members.unsubscribe(this.listener);
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
    const { args, flags } = await this.parse(SpacesMembersEnter);
    const { spaceId } = args;

    // Keep track of the last event we've seen for each client to avoid duplicates
    const lastSeenEvents = new Map<
      string,
      { action: string; timestamp: number }
    >();

    try {
      // Always show the readiness signal first, before attempting auth
      if (!this.shouldOutputJson(flags)) {
        this.log(`${chalk.dim("Entering space. Press Ctrl+C to exit.")}`);
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

      // Parse profile data if provided
      let profileData: ProfileData | undefined;
      if (flags.profile) {
        try {
          profileData = JSON.parse(flags.profile);
          this.logCliEvent(
            flags,
            "member",
            "profileParsed",
            "Profile data parsed successfully",
            { profileData },
          );
        } catch (error) {
          const errorMsg = `Invalid profile JSON: ${error instanceof Error ? error.message : String(error)}`;
          this.logCliEvent(flags, "member", "profileParseError", errorMsg, {
            error: errorMsg,
            spaceId,
          });
          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput(
                { error: errorMsg, spaceId, success: false },
                flags,
              ),
            );
          } else {
            this.error(errorMsg);
          }

          return;
        }
      }

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

      // Enter the space with optional profile
      this.logCliEvent(
        flags,
        "member",
        "enteringSpace",
        "Attempting to enter space",
        { profileData },
      );
      await this.space.enter(profileData);
      const enteredEventData = {
        connectionId: this.realtimeClient.connection.id,
        profile: profileData,
        spaceId,
        status: "connected",
      };
      this.logCliEvent(
        flags,
        "member",
        "enteredSpace",
        "Successfully entered space",
        enteredEventData,
      );

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput({ success: true, ...enteredEventData }, flags),
        );
      } else {
        this.log(
          `${chalk.green("Successfully entered space:")} ${chalk.cyan(spaceId)}`,
        );
        if (profileData) {
          this.log(
            `${chalk.dim("Profile:")} ${JSON.stringify(profileData, null, 2)}`,
          );
        } else {
          // No profile data provided
          this.logCliEvent(flags, "member", "noProfileData", "No profile data provided");
        }
      }

      // Subscribe to member presence events to show other members' activities
      this.logCliEvent(
        flags,
        "member",
        "subscribing",
        "Subscribing to member updates",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(
          `\n${chalk.dim("Watching for other members. Press Ctrl+C to exit.")}\n`,
        );
      }

      // Define the listener function
      this.listener = (member: SpaceMember) => {
        const timestamp = new Date().toISOString();
        const now = Date.now();

        // Determine the action from the member's lastEvent
        const action = member.lastEvent?.name || "unknown";
        const clientId = member.clientId || "Unknown";
        const connectionId = member.connectionId || "Unknown";

        // Skip self events - check connection ID
        const selfConnectionId = this.realtimeClient!.connection.id;
        if (member.connectionId === selfConnectionId) {
          return;
        }

        // Create a unique key for this client+connection combination
        const clientKey = `${clientId}:${connectionId}`;

        // Check if we've seen this exact event recently (within 500ms)
        // This helps avoid duplicate enter/leave events that might come through
        const lastEvent = lastSeenEvents.get(clientKey);

        if (
          lastEvent &&
          lastEvent.action === action &&
          now - lastEvent.timestamp < 500
        ) {
          this.logCliEvent(
            flags,
            "member",
            "duplicateEventSkipped",
            `Skipping duplicate event '${action}' for ${clientId}`,
            { action, clientId },
          );
          return; // Skip duplicate events within 500ms window
        }

        // Update the last seen event for this client+connection
        lastSeenEvents.set(clientKey, {
          action,
          timestamp: now,
        });

        const memberEventData = {
          action,
          member: {
            clientId: member.clientId,
            connectionId: member.connectionId,
            isConnected: member.isConnected,
            profileData: member.profileData,
          },
          spaceId,
          timestamp,
          type: "member_update",
        };
        this.logCliEvent(
          flags,
          "member",
          `update-${action}`,
          `Member event '${action}' received`,
          memberEventData,
        );

        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput({ success: true, ...memberEventData }, flags),
          );
        } else {
          let actionSymbol = "•";
          let actionColor = chalk.white;

          switch (action) {
            case "enter": {
              actionSymbol = "✓";
              actionColor = chalk.green;
              break;
            }

            case "leave": {
              actionSymbol = "✗";
              actionColor = chalk.red;
              break;
            }

            case "update": {
              actionSymbol = "⟲";
              actionColor = chalk.yellow;
              break;
            }
          }

          this.log(
            `[${timestamp}] ${actionColor(actionSymbol)} ${chalk.blue(clientId)} ${actionColor(action)}`,
          );

          const hasProfileData = member.profileData && Object.keys(member.profileData).length > 0;
          
          if (hasProfileData) {
            this.log(
              `  ${chalk.dim("Profile:")} ${JSON.stringify(member.profileData, null, 2)}`,
            );
          } else {
            // No profile data available
            this.logCliEvent(flags, "member", "noProfileDataForMember", "No profile data available for member");
          }

          if (connectionId === "Unknown") {
            // Connection ID is unknown
            this.logCliEvent(flags, "member", "unknownConnectionId", "Connection ID is unknown for member");
          } else {
            this.log(`  ${chalk.dim("Connection ID:")} ${connectionId}`);
          }

          if (member.isConnected === false) {
            this.log(`  ${chalk.dim("Status:")} Not connected`);
          } else {
            // Member is connected
            this.logCliEvent(flags, "member", "memberConnected", "Member is connected");
          }
        }
      };

      // Subscribe using the stored listener
      await this.space.members.subscribe("update", this.listener);

      this.logCliEvent(
        flags,
        "member",
        "subscribed",
        "Successfully subscribed to member updates",
      );

      this.logCliEvent(
        flags,
        "member",
        "listening",
        "Listening for member updates...",
      );
      
      // Wait until the user interrupts or the optional duration elapses
      const effectiveDuration =
        typeof flags.duration === "number" && flags.duration > 0
          ? flags.duration
          : process.env.ABLY_CLI_DEFAULT_DURATION
          ? Number(process.env.ABLY_CLI_DEFAULT_DURATION)
          : undefined;

      const exitReason = await waitUntilInterruptedOrTimeout(effectiveDuration);
      this.logCliEvent(flags, "member", "runComplete", "Exiting wait loop", { exitReason });
      this.cleanupInProgress = exitReason === "signal";

    } catch (error) {
      const errorMsg = `Error: ${error instanceof Error ? error.message : String(error)}`;
      this.logCliEvent(flags, "error", "unhandledError", errorMsg, {
        error: errorMsg,
      });
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput({ error: errorMsg, success: false }, flags),
        );
      } else {
        this.error(errorMsg);
      }
    } finally {
      // Wrap all cleanup in a timeout to prevent hanging
      await Promise.race([
        this.performCleanup(flags || {}),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            this.logCliEvent(flags || {}, "member", "cleanupTimeout", "Cleanup timed out after 5s, forcing completion");
            resolve();
          }, 5000);
        })
      ]);

      if (!this.shouldOutputJson(flags || {})) {
        if (this.cleanupInProgress) {
          this.log(chalk.green("Graceful shutdown complete (user interrupt)."));
        } else {
          // Normal completion without user interrupt
          this.logCliEvent(flags || {}, "member", "completedNormally", "Command completed normally");
        }
      }
    }
  }

  private async performCleanup(flags: Record<string, unknown>): Promise<void> {
    // Unsubscribe from member events with timeout
    if (this.listener && this.space) {
      try {
        await Promise.race([
          this.space.members.unsubscribe(this.listener),
          new Promise<void>((resolve) => setTimeout(resolve, 1000))
        ]);
        this.logCliEvent(flags, "member", "unsubscribedEventsFinally", "Unsubscribed member listener.");
      } catch (error) {
        this.logCliEvent(flags, "member", "unsubscribeErrorFinally", `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`);
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
