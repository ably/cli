import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";

export default class ChannelsPresenceEnter extends AblyBaseCommand {
  static override args = {
    channel: Args.string({
      description: "Channel name to enter presence on",
      required: true,
    }),
  };

  static override description =
    "Enter presence on a channel and remain present until terminated";

  static override examples = [
    "$ ably channels presence enter my-channel",
    '$ ably channels presence enter my-channel --data \'{"status":"online"}\'',
    '$ ably channels presence enter my-channel --client-id "user123"',
  ];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    data: Flags.string({
      default: "{}",
      description: "Presence data to publish (JSON string)",
    }),
    "show-others": Flags.boolean({
      default: true,
      description: "Show other presence events while present",
    }),
  };

  private client: Ably.Realtime | null = null;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (
      this.client &&
      this.client.connection.state !== "closed" && // Check state before closing to avoid errors if already closed
      this.client.connection.state !== "failed"
    ) {
      this.client.close();
    }

    return super.finally(err);
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsPresenceEnter);

    try {
      const { channel, client } = await this.setupClientAndChannel(
        flags,
        args.channel,
      );
      if (!client || !channel) return;

      const presenceData = this.parsePresenceData(flags);
      if (presenceData === null) return; // Error handled in helper

      if (flags["show-others"]) {
        this.setupPresenceSubscriptions(channel, client, flags);
      }

      await this.enterAndDisplayPresence(channel, client, flags, presenceData);

      // Keep the process running indefinitely until SIGINT/SIGTERM
      await this.setupCleanupHandler(() =>
        this._cleanupPresence(channel, client, flags),
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags || {},
        "presence",
        "fatalError",
        `Error entering presence: ${errorMsg}`,
        { error: errorMsg },
      );
      this.error(`Error entering presence: ${errorMsg}`);
    } finally {
      // Cleanup handled by the override and the cleanup handler
    }
  }

  // --- Refactored Helper Methods ---

  private async displayCurrentMembers(
    channel: Ably.RealtimeChannel,
    client: Ably.Realtime,
    flags: Record<string, unknown>,
  ): Promise<void> {
    this.logCliEvent(
      flags,
      "presence",
      "gettingMembers",
      "Fetching current presence members",
    );
    const members = await channel.presence.get();
    this.logCliEvent(
      flags,
      "presence",
      "membersFetched",
      `Fetched ${members.length} presence members`,
      { count: members.length },
    );

    if (!this.shouldOutputJson(flags)) {
      const otherMembers = members.filter(
        (member) => member.clientId !== client?.auth.clientId,
      );
      if (otherMembers.length > 0) {
        this.log(
          `\nCurrent presence members (${otherMembers.length} others):\n`,
        );
        for (const member of otherMembers) {
          this.log(`- ${chalk.blue(member.clientId || "Unknown")}`);
          if (member.data && Object.keys(member.data).length > 0) {
            this.log(`  Data: ${JSON.stringify(member.data, null, 2)}`);
          }
        }
      } else {
        this.log("\nNo other clients are present in this channel");
      }
    }
  }

  private async enterAndDisplayPresence(
    channel: Ably.RealtimeChannel,
    client: Ably.Realtime,
    flags: Record<string, unknown>,
    presenceData: Record<string, unknown>,
  ): Promise<void> {
    this.logCliEvent(
      flags,
      "presence",
      "entering",
      `Attempting to enter presence on ${channel.name}`,
      { data: presenceData },
    );
    this.logCliEvent(
      flags,
      "presence",
      "entered",
      `Successfully entered presence on ${channel.name}`,
      { clientId: client.auth.clientId },
    );

    // Add JSON output block if missing or enhance existing
    if (this.shouldOutputJson(flags)) { // Use the original check
      this.log(
        this.formatJsonOutput(
          {
            success: true,
            message: `Entered presence on channel ${channel.name} as ${client.auth.clientId}`,
            channel: channel.name,
            clientId: client.auth.clientId,
            data: presenceData,
            timestamp: new Date().toISOString(),
          },
          flags,
        ),
      );
    }
    // Modify the existing non-JSON log block to be conditional
    else { // Use the original check (implicitly !this.shouldOutputJson(flags))
        this.log(
            `${chalk.green("✓")} Entered presence on channel ${chalk.cyan(channel.name)} as ${chalk.blue(client.auth.clientId)}`,
        );
    }

    if (flags["show-others"]) { // Use the original check
      await this.displayCurrentMembers(channel, client, flags);
      this.logCliEvent(
        flags,
        "presence",
        "listening",
        "Listening for presence events until terminated",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(
          "\nListening for presence events until terminated. Press Ctrl+C to exit.",
        );
      }
    } else {
      this.logCliEvent(
        flags,
        "presence",
        "present",
        "Staying present until terminated",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log("\nStaying present until terminated. Press Ctrl+C to exit.");
      }
    }
  }

  private parsePresenceData(
    flags: Record<string, unknown>,
  ): Record<string, unknown> | null {
    try {
      const data = JSON.parse(flags.data as string);
      this.logCliEvent(
        flags,
        "presence",
        "dataParsed",
        "Presence data parsed successfully",
        { data },
      );
      return data;
    } catch (error) {
      const errorMsg =
        "Invalid JSON data format. Please provide a valid JSON string.";
      this.logCliEvent(flags, "presence", "dataParseError", errorMsg, {
        error: error instanceof Error ? error.message : String(error),
      });
      this.error(errorMsg);
      return null;
    }
  }

  private async setupClientAndChannel(
    flags: Record<string, unknown>,
    channelName: string,
  ): Promise<{
    channel: Ably.RealtimeChannel | null;
    client: Ably.Realtime | null;
  }> {
    this.client = await this.createAblyClient(flags);
    if (!this.client) return { channel: null, client: null };

    const { client } = this;

    client.connection.on((stateChange: Ably.ConnectionStateChange) => {
      this.logCliEvent(
        flags,
        "connection",
        stateChange.current,
        `Connection state changed to ${stateChange.current}`,
        { reason: stateChange.reason },
      );
    });

    const channel = client.channels.get(channelName);
    channel.on((stateChange: Ably.ChannelStateChange) => {
      this.logCliEvent(
        flags,
        "channel",
        stateChange.current,
        `Channel '${channelName}' state changed to ${stateChange.current}`,
        { reason: stateChange.reason },
      );
    });

    await channel.attach().catch((error) => {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "presence",
        "attachError",
        `Error attaching to channel: ${errorMsg}`,
        { channel: channelName, error: errorMsg },
      );
      throw new Error(
        `Failed to attach to channel ${channelName}: ${errorMsg}`,
      );
    });
    this.logCliEvent(
      flags,
      "presence",
      "attachSuccess",
      "Successfully attached to channel",
      { channel: channelName },
    );

    return { channel, client };
  }

  private setupPresenceSubscriptions(
    channel: Ably.RealtimeChannel,
    client: Ably.Realtime,
    flags: Record<string, unknown>,
  ): void {
    this.logCliEvent(
      flags,
      "presence",
      "subscribingToOthers",
      "Subscribing to other presence events",
    );

    const logOtherPresence = (
      eventType: string,
      eventDesc: string,
      chalkColor: (text: string) => string,
      icon: string,
      presenceMessage: Ably.PresenceMessage,
    ) => {
      if (presenceMessage.clientId !== client?.auth.clientId) {
        this.logCliEvent(
          flags,
          "presence",
          eventType,
          `${presenceMessage.clientId || "Unknown"} ${eventDesc}`,
          { clientId: presenceMessage.clientId, data: presenceMessage.data },
        );
        if (!this.shouldOutputJson(flags)) {
          this.log(
            `${icon} ${chalkColor(presenceMessage.clientId || "Unknown")} ${eventDesc}`,
          );
          if (eventType === "memberUpdated" && presenceMessage.data) {
            this.log(`  ${this.formatJsonOutput(presenceMessage.data, flags)}`);
          }
        }
      }
    };

    channel.presence.subscribe("enter", (msg) =>
      logOtherPresence(
        "memberEntered",
        "entered presence",
        chalk.blue,
        chalk.green("✓"),
        msg,
      ),
    );
    channel.presence.subscribe("leave", (msg) =>
      logOtherPresence(
        "memberLeft",
        "left presence",
        chalk.blue,
        chalk.red("✗"),
        msg,
      ),
    );
    channel.presence.subscribe("update", (msg) =>
      logOtherPresence(
        "memberUpdated",
        "updated presence data",
        chalk.blue,
        chalk.yellow("⟲"),
        msg,
      ),
    );
  }

  // This method contains the specific cleanup logic for this command.
  private async _cleanupPresence(
    channel: Ably.RealtimeChannel,
    client: Ably.Realtime,
    flags: Record<string, unknown>,
  ): Promise<void> {
    this.logCliEvent(
      flags,
      "presence",
      "cleanupInitiated",
      "Cleanup initiated (Signal received)",
    );
    if (!this.shouldOutputJson(flags)) {
      this.log("\nLeaving presence and closing connection...");
    }

    try {
      // Try to leave presence first
      this.logCliEvent(
        flags,
        "presence",
        "leaving",
        "Attempting to leave presence",
      );
      await channel.presence.leave();
      this.logCliEvent(flags, "presence", "left", "Successfully left presence");
      if (!this.shouldOutputJson(flags)) {
        this.log(chalk.green("Successfully left presence."));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "presence",
        "leaveError",
        `Error leaving presence: ${errorMsg}`,
        { error: errorMsg },
      );
      if (!this.shouldOutputJson(flags)) {
        this.log(`Note: ${errorMsg}`);
        this.log("Continuing with connection close.");
      }
    } finally {
      // Ensure connection close happens even if leave fails
      try {
        if (client && client.connection.state !== "closed") {
          this.logCliEvent(
            flags,
            "connection",
            "closing",
            "Closing Ably connection.",
          );
          client.close();
          // Wait for close event might be better, but for CLI, immediate exit is okay
          this.logCliEvent(
            flags,
            "connection",
            "closed",
            "Ably connection closed.",
          );
          if (!this.shouldOutputJson(flags)) {
            this.log(chalk.green("Successfully closed connection."));
          }
        }
      } catch (closeError) {
        const errorMsg =
          closeError instanceof Error ? closeError.message : String(closeError);
        this.logCliEvent(
          flags,
          "connection",
          "closeError",
          `Error closing connection: ${errorMsg}`,
          { error: errorMsg },
        );
        if (!this.shouldOutputJson(flags)) {
          this.log(chalk.red(`Error closing connection: ${errorMsg}`));
        }
        // Error during close is logged, but cleanup continues
      }
    }
  }
}
