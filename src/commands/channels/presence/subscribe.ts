import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";
import { BaseFlags } from "../../../types/cli.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

export default class ChannelsPresenceSubscribe extends AblyBaseCommand {
  static override args = {
    channel: Args.string({
      description: "Channel name to subscribe to presence events",
      required: true,
    }),
  };

  static override description =
    "Subscribe to presence events on a channel";

  static override examples = [
    "$ ably channels presence subscribe my-channel",
    '$ ably channels presence subscribe my-channel --client-id "filter123"',
    '$ ably channels presence subscribe my-channel --api-key "YOUR_API_KEY"',
    '$ ably channels presence subscribe my-channel --token "YOUR_ABLY_TOKEN"',
    "$ ably channels presence subscribe my-channel --json",
    "$ ably channels presence subscribe my-channel --pretty-json",
    "$ ably channels presence subscribe my-channel --duration 30",
  ];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    duration: Flags.integer({
      description: "Automatically exit after the given number of seconds (0 = run indefinitely)",
      char: "D",
      required: false,
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
    const { args, flags } = await this.parse(ChannelsPresenceSubscribe);
    let channel: Ably.RealtimeChannel | null = null;

    try {
      this.client = await this.createAblyClient(flags);
      if (!this.client) return;

      const client = this.client;
      const channelName = args.channel;

      channel = client.channels.get(channelName);

      // Setup connection state change handler
      client.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(
          flags,
          "connection",
          stateChange.current,
          `Connection state changed to ${stateChange.current}`,
          { reason: stateChange.reason },
        );
        if (!this.shouldOutputJson(flags)) {
          switch (stateChange.current) {
            case "connected": {
              this.log("Successfully connected to Ably");
              break;
            }
            case "disconnected": {
              this.log("Disconnected from Ably");
              break;
            }
            case "failed": {
              this.error(
                `Connection failed: ${stateChange.reason?.message || "Unknown error"}`,
              );
              break;
            }
          }
        }
      });

      // Setup channel state change handler
      channel.on((stateChange: Ably.ChannelStateChange) => {
        this.logCliEvent(
          flags,
          "channel",
          stateChange.current,
          `Channel '${channelName}' state changed to ${stateChange.current}`,
          { reason: stateChange.reason },
        );
        if (!this.shouldOutputJson(flags)) {
          switch (stateChange.current) {
            case "attached": {
              this.log(
                `${chalk.green("✓")} Successfully attached to channel: ${chalk.cyan(channelName)}`,
              );
              break;
            }
            case "failed": {
              this.log(
                `${chalk.red("✗")} Failed to attach to channel ${chalk.cyan(channelName)}: ${stateChange.reason?.message || "Unknown error"}`,
              );
              break;
            }
            case "detached": {
              this.log(
                `${chalk.yellow("!")} Detached from channel: ${chalk.cyan(channelName)}`,
              );
              break;
            }
          }
        }
      });

      // Subscribe to presence events
      this.logCliEvent(
        flags,
        "presence",
        "subscribing",
        `Subscribing to presence events on channel: ${channelName}`,
        { channel: channelName },
      );

      if (!this.shouldOutputJson(flags)) {
        this.log(
          `${chalk.green("Subscribing to presence events on channel:")} ${chalk.cyan(channelName)}`,
        );
      }

      channel.presence.subscribe((presenceMessage: Ably.PresenceMessage) => {
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
          const action = presenceMessage.action || "unknown";
          const clientId = presenceMessage.clientId || "Unknown";

          this.log(
            `${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`Channel: ${channelName}`)} | ${chalk.yellow(`Action: ${action}`)} | ${chalk.blue(`Client: ${clientId}`)}`,
          );

          if (presenceMessage.data !== null && presenceMessage.data !== undefined) {
            this.log(`${chalk.green("Data:")} ${JSON.stringify(presenceMessage.data, null, 2)}`);
          }

          this.log(""); // Empty line for better readability
        }
      });

      this.logCliEvent(
        flags,
        "presence",
        "listening",
        "Listening for presence events. Press Ctrl+C to exit.",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log("Listening for presence events. Press Ctrl+C to exit.");
      }

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
        `Error during presence subscription: ${errorMsg}`,
        { channel: args.channel, error: errorMsg },
      );
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { channel: args.channel, error: errorMsg, success: false },
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
    // Unsubscribe from presence events with timeout
    if (channel) {
      try {
        await Promise.race([
          Promise.resolve(channel.presence.unsubscribe()),
          new Promise<void>((resolve) => setTimeout(resolve, 1000))
        ]);
        this.logCliEvent(flags, "presence", "unsubscribedPresence", "Unsubscribed from presence events");
      } catch (error) {
        this.logCliEvent(flags, "presence", "unsubscribeError", `Error unsubscribing from presence: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Close Ably client (already has internal timeout)
    this.logCliEvent(flags, "connection", "closingClientFinally", "Closing Ably client.");
    await this.properlyCloseAblyClient();
    this.logCliEvent(flags, "connection", "clientClosedFinally", "Ably client close attempt finished.");
  }
}
