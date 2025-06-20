import { Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";
import { BaseFlags } from "../../../types/cli.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

export default class LogsAppSubscribe extends AblyBaseCommand {
  static override description = "Subscribe to live app logs";

  static override examples = [
    "$ ably logs app subscribe",
    "$ ably logs app subscribe --type channel.lifecycle",
    "$ ably logs app subscribe --json",
    "$ ably logs app subscribe --pretty-json",
    "$ ably logs app subscribe --duration 30",
  ];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    duration: Flags.integer({
      description: "Automatically exit after the given number of seconds (0 = run indefinitely)",
      char: "D",
      required: false,
    }),
    type: Flags.string({
      description: "Filter by log type",
      options: [
        "channel.lifecycle",
        "channel.occupancy",
        "channel.presence",
        "connection.lifecycle",
        "push.publish",
      ],
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
    const { flags } = await this.parse(LogsAppSubscribe);
    let channel: Ably.RealtimeChannel | null = null;
    let subscribedEvents: string[] = [];

    try {
      this.client = await this.createAblyRealtimeClient(flags);
      if (!this.client) return;

      const client = this.client;

      // Set up connection state logging
      this.setupConnectionStateLogging(client, flags, {
        includeUserFriendlyMessages: true
      });

      // Get the logs channel
      const appConfig = await this.ensureAppAndKey(flags);
      if (!appConfig) {
        this.error("Unable to determine app configuration");
        return;
      }
      const logsChannelName = `[meta]log`;
      channel = client.channels.get(logsChannelName);

      // Set up channel state logging
      this.setupChannelStateLogging(channel, flags, {
        includeUserFriendlyMessages: true
      });

      // Determine which log types to subscribe to
      const logTypes = flags.type ? [flags.type] : [
        "channel.lifecycle",
        "channel.occupancy",
        "channel.presence",
        "connection.lifecycle",
        "push.publish",
      ];

      this.logCliEvent(
        flags,
        "logs",
        "subscribing",
        `Subscribing to log events: ${logTypes.join(", ")}`,
        { logTypes, channel: logsChannelName },
      );

      if (!this.shouldOutputJson(flags)) {
        this.log(
          `${chalk.green("Subscribing to app logs:")} ${chalk.cyan(logTypes.join(", "))}`,
        );
      }

      // Subscribe to specified log types
      for (const logType of logTypes) {
        channel.subscribe(logType, (message: Ably.Message) => {
          const timestamp = message.timestamp
            ? new Date(message.timestamp).toISOString()
            : new Date().toISOString();
          const event = {
            type: logType,
            timestamp,
            data: message.data,
            id: message.id,
          };
          this.logCliEvent(
            flags,
            "logs",
            "logReceived",
            `Log received: ${logType}`,
            event,
          );

          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput(event, flags));
          } else {
            this.log(
              `${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`Type: ${logType}`)}`,
            );

            if (message.data !== null && message.data !== undefined) {
              this.log(`${chalk.green("Data:")} ${JSON.stringify(message.data, null, 2)}`);
            }

            this.log(""); // Empty line for better readability
          }
        });
        subscribedEvents.push(logType);
      }

      this.logCliEvent(
        flags,
        "logs",
        "listening",
        "Listening for log events. Press Ctrl+C to exit.",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log("Listening for log events. Press Ctrl+C to exit.");
      }

      // Wait until the user interrupts or the optional duration elapses
      const effectiveDuration =
        typeof flags.duration === "number" && flags.duration > 0
          ? flags.duration
          : process.env.ABLY_CLI_DEFAULT_DURATION
          ? Number(process.env.ABLY_CLI_DEFAULT_DURATION)
          : undefined;

      const exitReason = await waitUntilInterruptedOrTimeout(effectiveDuration);
      this.logCliEvent(flags, "logs", "runComplete", "Exiting wait loop", { exitReason });
      this.cleanupInProgress = exitReason === "signal";

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "logs",
        "fatalError",
        `Error during logs subscription: ${errorMsg}`,
        { error: errorMsg },
      );
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { error: errorMsg, success: false },
            flags,
          ),
        );
      } else {
        this.error(`Error: ${errorMsg}`);
      }
    } finally {
      // Wrap all cleanup in a timeout to prevent hanging
      await Promise.race([
        this.performCleanup(flags || {}, channel, subscribedEvents),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            this.logCliEvent(flags || {}, "logs", "cleanupTimeout", "Cleanup timed out after 5s, forcing completion");
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

  private async performCleanup(flags: BaseFlags, channel: Ably.RealtimeChannel | null, subscribedEvents: string[]): Promise<void> {
    // Unsubscribe from log events with timeout
    if (channel && subscribedEvents.length > 0) {
      for (const eventType of subscribedEvents) {
        try {
          await Promise.race([
            Promise.resolve(channel.unsubscribe(eventType)),
            new Promise<void>((resolve) => setTimeout(resolve, 1000))
          ]);
          this.logCliEvent(flags, "logs", "unsubscribedEvent", `Unsubscribed from ${eventType}`);
        } catch (error) {
          this.logCliEvent(flags, "logs", "unsubscribeError", `Error unsubscribing from ${eventType}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Close Ably client (already has internal timeout)
    this.logCliEvent(flags, "connection", "closingClientFinally", "Closing Ably client.");
    await this.properlyCloseAblyClient();
    this.logCliEvent(flags, "connection", "clientClosedFinally", "Ably client close attempt finished.");
  }
}
