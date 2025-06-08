import type { SpaceMember } from "@ably/spaces";

import { type Space } from "@ably/spaces";
import { Args, Flags as _Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { SpacesBaseCommand } from "../../../spaces-base-command.js";
import { BaseFlags } from "../../../types/cli.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

export default class SpacesMembersSubscribe extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: "Space ID to subscribe to members for",
      required: true,
    }),
  };

  static override description =
    "Subscribe to member presence events in a space";

  static override examples = [
    "$ ably spaces members subscribe my-space",
    "$ ably spaces members subscribe my-space --json",
    "$ ably spaces members subscribe my-space --pretty-json",
    "$ ably spaces members subscribe my-space --duration 30",
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
    const { args, flags } = await this.parse(SpacesMembersSubscribe);
    const { spaceId } = args;

    // Keep track of the last event we've seen for each client to avoid duplicates
    const lastSeenEvents = new Map<
      string,
      { action: string; timestamp: number }
    >();

    try {
      // Always show the readiness signal first, before attempting auth
      if (!this.shouldOutputJson(flags)) {
        this.log("Subscribing to member updates");
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

      // Set up connection state logging
      this.setupConnectionStateLogging(this.realtimeClient!, flags, {
        includeUserFriendlyMessages: true
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

      // Enter the space to subscribe
      this.logCliEvent(flags, "spaces", "entering", "Entering space...");
      if (!this.space) {
        this.error("Space object is null before entering");
        return;
      }
      await this.space.enter();
      this.logCliEvent(
        flags,
        "spaces",
        "entered",
        "Successfully entered space",
        { clientId: this.realtimeClient!.auth.clientId },
      );

      // Get current members
      this.logCliEvent(
        flags,
        "member",
        "gettingInitial",
        "Fetching initial members",
      );
      if (!this.space) {
        this.error("Space object is null before getting members");
        return;
      }
      const members = await this.space.members.getAll();
      const initialMembers = members.map((member) => ({
        clientId: member.clientId,
        connectionId: member.connectionId,
        isConnected: member.isConnected,
        profileData: member.profileData,
      }));
      this.logCliEvent(
        flags,
        "member",
        "gotInitial",
        `Fetched ${members.length} initial members`,
        { count: members.length, members: initialMembers },
      );

      // Output current members
      if (members.length === 0) {
        if (!this.shouldOutputJson(flags)) {
          this.log(
            chalk.yellow("No members are currently present in this space."),
          );
        }
      } else if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              members: initialMembers,
              spaceId,
              status: "connected",
              success: true,
            },
            flags,
          ),
        );
      } else {
        this.log(
          `\n${chalk.cyan("Current members")} (${chalk.bold(members.length.toString())}):\n`,
        );

        for (const member of members) {
          this.log(`- ${chalk.blue(member.clientId || "Unknown")}`);

          if (
            member.profileData &&
            Object.keys(member.profileData).length > 0
          ) {
            this.log(
              `  ${chalk.dim("Profile:")} ${JSON.stringify(member.profileData, null, 2)}`,
            );
          }

          if (member.connectionId) {
            this.log(`  ${chalk.dim("Connection ID:")} ${member.connectionId}`);
          }

          if (member.isConnected === false) {
            this.log(`  ${chalk.dim("Status:")} Not connected`);
          }
        }
      }

      if (!this.shouldOutputJson(flags)) {
        this.log(
          `\n${chalk.dim("Subscribing to member events. Press Ctrl+C to exit.")}\n`,
        );
      }

      // Subscribe to member presence events
      this.logCliEvent(
        flags,
        "member",
        "subscribing",
        "Subscribing to member updates",
      );
      if (!this.space) {
        this.error("Space object is null before subscribing to members");
        return;
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

          if (
            member.profileData &&
            Object.keys(member.profileData).length > 0
          ) {
            this.log(
              `  ${chalk.dim("Profile:")} ${JSON.stringify(member.profileData, null, 2)}`,
            );
          }

          if (connectionId !== "Unknown") {
            this.log(`  ${chalk.dim("Connection ID:")} ${connectionId}`);
          }

          if (member.isConnected === false) {
            this.log(`  ${chalk.dim("Status:")} Not connected`);
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
      const errorMsg = `Error during execution: ${error instanceof Error ? error.message : String(error)}`;
      this.logCliEvent(flags, "member", "executionError", errorMsg, {
        error: errorMsg,
      });
      if (!this.shouldOutputJson(flags)) {
        this.log(chalk.red(errorMsg));
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
          this.log(chalk.green("Duration elapsed – command finished cleanly."));
        }
      }
    }
  }

  private async performCleanup(flags: BaseFlags): Promise<void> {
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
