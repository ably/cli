import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";
import { BaseFlags } from "../../../types/cli.js";
import { isJsonData } from "../../../utils/json-formatter.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

export default class ChannelsPresenceEnter extends AblyBaseCommand {
  static override args = {
    channelName: Args.string({
      description: "Channel name to enter presence on",
      required: true,
    }),
  };

  static override description =
    "Enter presence on a channel and listen for presence events";

  static override examples = [
    '$ ably channels presence enter my-channel --client-id "client123"',
    '$ ably channels presence enter my-channel --client-id "client123" --data \'{"name":"John","status":"online"}\'',
    '$ ably channels presence enter my-channel --api-key "YOUR_API_KEY"',
    '$ ably channels presence enter my-channel --token "YOUR_ABLY_TOKEN"',
    "$ ably channels presence enter my-channel --json",
    "$ ably channels presence enter my-channel --pretty-json",
    "$ ably channels presence enter my-channel --duration 30",
  ];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    duration: Flags.integer({
      description: "Automatically exit after the given number of seconds (0 = run indefinitely)",
      char: "D",
      required: false,
    }),
    data: Flags.string({
      description: "Optional JSON data to associate with the presence",
    }),
  };

  private cleanupInProgress = false;
  private client: Ably.Realtime | null = null;

  private async properlyCloseAblyClient(): Promise<void> {
    if (!this.client || this.client.connection.state === 'closed' || this.client.connection.state === 'failed') {
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

      this.client!.connection.once('closed', onClosedOrFailed);
      this.client!.connection.once('failed', onClosedOrFailed);
      this.client!.close();
    });
  }

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    await this.properlyCloseAblyClient();
    return super.finally(err);
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsPresenceEnter);
    let channel: Ably.RealtimeChannel | null = null;

    try {
      this.client = await this.createAblyRealtimeClient(flags);
      if (!this.client) return;

      const client = this.client;
      const { channelName } = args;

      // Parse data if provided
      let data: unknown = undefined;
      if (flags.data) {
        try {
          let trimmed = (flags.data as string).trim();
          if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
            trimmed = trimmed.slice(1, -1);
          }
          data = JSON.parse(trimmed);
        } catch (error) {
          const errorMsg = `Invalid data JSON: ${error instanceof Error ? error.message : String(error)}`;
          this.logCliEvent(
            flags,
            "presence",
            "parseError",
            errorMsg,
            { data: flags.data, error: errorMsg },
          );
          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput({ error: errorMsg, success: false }, flags),
            );
          } else {
            this.error(errorMsg);
          }

          return;
        }
      }

      channel = client.channels.get(channelName);

      // Set up connection state logging
      this.setupConnectionStateLogging(client, flags, {
        includeUserFriendlyMessages: true
      });

      // Set up channel state logging
      this.setupChannelStateLogging(channel, flags, {
        includeUserFriendlyMessages: true
      });

      // Subscribe to presence events before entering
      channel.presence.subscribe((presenceMessage) => {
        const timestamp = presenceMessage.timestamp
          ? new Date(presenceMessage.timestamp).toISOString()
          : new Date().toISOString();
        const event = {
          action: presenceMessage.action,
          channel: channelName,
          clientId: presenceMessage.clientId,
          connectionId: presenceMessage.connectionId,
          data: presenceMessage.data,
          id: presenceMessage.id,
          timestamp,
        };
        this.logCliEvent(
          flags,
          "presence",
          presenceMessage.action!,
          `Presence event: ${presenceMessage.action} by ${presenceMessage.clientId}`,
          event,
        );

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput(event, flags));
        } else {
          this.log(
            `${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`Channel: ${channelName}`)} | ${chalk.yellow(`Action: ${presenceMessage.action}`)} | ${chalk.blue(`Client: ${presenceMessage.clientId || "N/A"}`)}`,
          );

          if (presenceMessage.data !== null && presenceMessage.data !== undefined) {
            if (isJsonData(presenceMessage.data)) {
              this.log(chalk.green("Data:"));
              this.log(JSON.stringify(presenceMessage.data, null, 2));
            } else {
              this.log(`${chalk.green("Data:")} ${presenceMessage.data}`);
            }
          }

          this.log(""); // Empty line for better readability
        }
      });

      // Enter presence
      this.logCliEvent(
        flags,
        "presence",
        "entering",
        `Entering presence on channel ${channelName}`,
        { channel: channelName, clientId: client.auth.clientId, data: data },
      );

      await channel.presence.enter(data);

      const enterEvent = {
        action: "enter",
        channel: channelName,
        clientId: client.auth.clientId,
        data: data,
        timestamp: new Date().toISOString(),
      };
      this.logCliEvent(
        flags,
        "presence",
        "entered",
        `Successfully entered presence on channel ${channelName}`,
        enterEvent,
      );

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput(enterEvent, flags));
      } else {
        this.log(
          `${chalk.green("✓")} Entered channel ${chalk.cyan(channelName)} as client ${chalk.blue(client.auth.clientId)}`,
        );
      }

      // Get current presence members
      const presenceMembers = await channel.presence.get();
      this.logCliEvent(
        flags,
        "presence",
        "membersRetrieved",
        `Retrieved ${presenceMembers.length} presence members`,
        { channel: channelName, count: presenceMembers.length },
      );

      if (!this.shouldOutputJson(flags)) {
        if (presenceMembers.length > 0) {
          this.log(`\nCurrent presence members (${presenceMembers.length}):`);
          for (const member of presenceMembers) {
            this.log(
              `  ${chalk.blue(`Client: ${member.clientId || "N/A"}`)} ${member.data ? `| Data: ${JSON.stringify(member.data)}` : ""}`,
            );
          }
        } else {
          this.log("\nNo other users are present in this channel");
        }

        this.log("\nListening for presence events until terminated. Press Ctrl+C to exit.");
      }

      this.logCliEvent(
        flags,
        "presence",
        "listening",
        "Listening for presence events. Press Ctrl+C to exit.",
      );

      // Wait until the user interrupts or the optional duration elapses
      const effectiveDuration =
        typeof flags.duration === "number" && flags.duration > 0
          ? flags.duration
          : process.env.ABLY_CLI_DEFAULT_DURATION
          ? Number(process.env.ABLY_CLI_DEFAULT_DURATION)
          : undefined;

      const exitReason = await waitUntilInterruptedOrTimeout(effectiveDuration);
      this.logCliEvent(flags, "presence", "runComplete", "Exiting wait loop", { exitReason });
      this.cleanupInProgress = exitReason === "signal";

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "presence",
        "fatalError",
        `Error during presence operation: ${errorMsg}`,
        { channel: args.channelName, error: errorMsg },
      );
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { channel: args.channelName, error: errorMsg, success: false },
            flags,
          ),
        );
      } else {
        this.error(`Error: ${errorMsg}`);
      }
    } finally {
      // Wrap all cleanup in a timeout to prevent hanging
      await Promise.race([
        this.performCleanup(flags || {}, channel),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            this.logCliEvent(flags || {}, "presence", "cleanupTimeout", "Cleanup timed out after 5s, forcing completion");
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

  private async performCleanup(flags: BaseFlags, channel: Ably.RealtimeChannel | null): Promise<void> {
    // Leave presence with timeout
    if (channel && this.client) {
      try {
        await Promise.race([
          channel.presence.leave(),
          new Promise<void>((resolve) => setTimeout(resolve, 2000))
        ]);
        this.logCliEvent(flags, "presence", "leftPresence", "Left presence successfully");
      } catch (error) {
        this.logCliEvent(flags, "presence", "leaveError", `Error leaving presence: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Close Ably client (already has internal timeout)
    this.logCliEvent(flags, "connection", "closingClientFinally", "Closing Ably client.");
    await this.properlyCloseAblyClient();
    this.logCliEvent(flags, "connection", "clientClosedFinally", "Ably client close attempt finished.");
  }
}
