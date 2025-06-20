import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";
import { BaseFlags } from "../../../types/cli.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

export default class ChannelsOccupancySubscribe extends AblyBaseCommand {
  static override args = {
    channel: Args.string({
      description: "Channel name to subscribe to occupancy events",
      required: true,
    }),
  };

  static override description =
    "Subscribe to occupancy events on a channel";

  static override examples = [
    "$ ably channels occupancy subscribe my-channel",
    '$ ably channels occupancy subscribe my-channel --api-key "YOUR_API_KEY"',
    '$ ably channels occupancy subscribe my-channel --token "YOUR_ABLY_TOKEN"',
    "$ ably channels occupancy subscribe my-channel --json",
    "$ ably channels occupancy subscribe my-channel --pretty-json",
    "$ ably channels occupancy subscribe my-channel --duration 30",
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
    const { args, flags } = await this.parse(ChannelsOccupancySubscribe);
    let channel: Ably.RealtimeChannel | null = null;

    try {
      this.client = await this.createAblyRealtimeClient(flags);
      if (!this.client) return;

      const client = this.client;
      const channelName = args.channel;

      // Get channel with occupancy option enabled
      channel = client.channels.get(channelName, {
        params: {
          occupancy: 'metrics'
        }
      });

      // Set up connection state logging
      this.setupConnectionStateLogging(client, flags, {
        includeUserFriendlyMessages: true
      });

      // Set up channel state logging
      this.setupChannelStateLogging(channel, flags, {
        includeUserFriendlyMessages: true
      });

      // Subscribe to occupancy events - these are delivered as channel events
      // According to docs, occupancy updates come as [meta]occupancy events
      const occupancyEventName = "[meta]occupancy";
      this.logCliEvent(
        flags,
        "occupancy",
        "subscribing",
        `Subscribing to occupancy events on channel: ${channelName}`,
        { channel: channelName },
      );

      if (!this.shouldOutputJson(flags)) {
        this.log(
          `${chalk.green("Subscribing to occupancy events on channel:")} ${chalk.cyan(channelName)}`,
        );
      }

      channel.subscribe(occupancyEventName, (message: Ably.Message) => {
        const timestamp = message.timestamp
          ? new Date(message.timestamp).toISOString()
          : new Date().toISOString();
        const event = {
          channel: channelName,
          event: occupancyEventName,
          data: message.data,
          timestamp,
        };
        this.logCliEvent(
          flags,
          "occupancy",
          "occupancyUpdate",
          `Occupancy update received for channel ${channelName}`,
          event,
        );

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput(event, flags));
        } else {
          this.log(
            `${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`Channel: ${channelName}`)} | ${chalk.yellow("Occupancy Update")}`,
          );

          if (message.data !== null && message.data !== undefined) {
            this.log(`${chalk.green("Occupancy Data:")} ${JSON.stringify(message.data, null, 2)}`);
          }

          this.log(""); // Empty line for better readability
        }
      });

      this.logCliEvent(
        flags,
        "occupancy",
        "listening",
        "Listening for occupancy events. Press Ctrl+C to exit.",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log("Listening for occupancy events. Press Ctrl+C to exit.");
      }

      // Wait until the user interrupts or the optional duration elapses
      const effectiveDuration =
        typeof flags.duration === "number" && flags.duration > 0
          ? flags.duration
          : process.env.ABLY_CLI_DEFAULT_DURATION
          ? Number(process.env.ABLY_CLI_DEFAULT_DURATION)
          : undefined;

      const exitReason = await waitUntilInterruptedOrTimeout(effectiveDuration);
      this.logCliEvent(flags, "occupancy", "runComplete", "Exiting wait loop", { exitReason });
      this.cleanupInProgress = exitReason === "signal";

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "occupancy",
        "fatalError",
        `Error during occupancy subscription: ${errorMsg}`,
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
            this.logCliEvent(flags || {}, "occupancy", "cleanupTimeout", "Cleanup timed out after 5s, forcing completion");
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
    // Unsubscribe from occupancy events with timeout
    if (channel) {
      try {
        await Promise.race([
          Promise.resolve(channel.unsubscribe("[meta]occupancy")),
          new Promise<void>((resolve) => setTimeout(resolve, 1000))
        ]);
        this.logCliEvent(flags, "occupancy", "unsubscribedOccupancy", "Unsubscribed from occupancy events");
      } catch (error) {
        this.logCliEvent(flags, "occupancy", "unsubscribeError", `Error unsubscribing from occupancy: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Close Ably client (already has internal timeout)
    this.logCliEvent(flags, "connection", "closingClientFinally", "Closing Ably client.");
    await this.properlyCloseAblyClient();
    this.logCliEvent(flags, "connection", "clientClosedFinally", "Ably client close attempt finished.");
  }
}
