import { Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { AblyBaseCommand } from "../../../base-command.js";
import { BaseFlags } from "../../../types/cli.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

export default class LogsConnectionLifecycleSubscribe extends AblyBaseCommand {
  static override description = "Subscribe to live connection lifecycle logs";

  static override examples = [
    "$ ably logs connection-lifecycle subscribe",
    "$ ably logs connection-lifecycle subscribe --json",
    "$ ably logs connection-lifecycle subscribe --pretty-json",
    "$ ably logs connection-lifecycle subscribe --duration 30",
  ];

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    duration: Flags.integer({
      description: "Automatically exit after the given number of seconds (0 = run indefinitely)",
      char: "D",
      required: false,
    }),
    rewind: Flags.integer({
      description: "Number of messages to replay from history when subscribing",
      default: 0,
      required: false,
    }),
  };

  private cleanupInProgress = false;
  private client: Ably.Realtime | null = null;
  private cleanupChannelStateLogging: (() => void) | null = null;

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
    const { flags } = await this.parse(LogsConnectionLifecycleSubscribe);
    let channel: Ably.RealtimeChannel | null = null;

    try {
      this.client = await this.createAblyClient(flags);
      if (!this.client) return;

      const client = this.client;

      // Set up connection state logging
      this.setupConnectionStateLogging(client, flags, {
        includeUserFriendlyMessages: true
      });

      // Get the logs channel with optional rewind
      const logsChannelName = `[meta]connection.lifecycle`;
      const channelOptions = flags.rewind ? { params: { rewind: String(flags.rewind) } } : undefined;
      channel = client.channels.get(logsChannelName, channelOptions);

      // Set up channel state logging
      this.cleanupChannelStateLogging = this.setupChannelStateLogging(channel, flags, {
        includeUserFriendlyMessages: true
      });

      this.logCliEvent(
        flags,
        "logs",
        "subscribing",
        `Subscribing to connection lifecycle logs`,
        { channel: logsChannelName },
      );

      if (!this.shouldOutputJson(flags)) {
        this.log(`${chalk.green("Subscribing to connection lifecycle logs")}`);
      }

      // Subscribe to connection lifecycle logs
      channel.subscribe((message: Ably.Message) => {
        const timestamp = message.timestamp
          ? new Date(message.timestamp).toISOString()
          : new Date().toISOString();
        const event = {
          timestamp,
          event: message.name || "connection.lifecycle",
          data: message.data,
          id: message.id,
        };
        this.logCliEvent(
          flags,
          "logs",
          "logReceived",
          `Connection lifecycle log received`,
          event,
        );

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput(event, flags));
        } else {
          this.log(
            `${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`Event: ${event.event}`)}`,
          );

          if (message.data !== null && message.data !== undefined) {
            this.log(`${chalk.green("Data:")} ${JSON.stringify(message.data, null, 2)}`);
          }

          this.log(""); // Empty line for better readability
        }
      });

      this.logCliEvent(
        flags,
        "logs",
        "listening",
        "Listening for connection lifecycle log events. Press Ctrl+C to exit.",
      );
      if (!this.shouldOutputJson(flags)) {
        this.log("Listening for connection lifecycle log events. Press Ctrl+C to exit.");
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
        `Error during connection lifecycle logs subscription: ${errorMsg}`,
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
        this.performCleanup(flags || {}, channel),
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

  private async performCleanup(flags: BaseFlags, channel: Ably.RealtimeChannel | null): Promise<void> {
    // Clean up channel state logging
    if (this.cleanupChannelStateLogging) {
      this.cleanupChannelStateLogging();
      this.cleanupChannelStateLogging = null;
    }
    
    // Unsubscribe from connection lifecycle logs with timeout
    if (channel) {
      try {
        await Promise.race([
          Promise.resolve(channel.unsubscribe()),
          new Promise<void>((resolve) => setTimeout(resolve, 1000))
        ]);
        this.logCliEvent(flags, "logs", "unsubscribedLogs", "Unsubscribed from connection lifecycle logs");
      } catch (error) {
        this.logCliEvent(flags, "logs", "unsubscribeError", `Error unsubscribing from connection lifecycle logs: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Close Ably client (already has internal timeout)
    this.logCliEvent(flags, "connection", "closingClientFinally", "Closing Ably client.");
    await this.properlyCloseAblyClient();
    this.logCliEvent(flags, "connection", "clientClosedFinally", "Ably client close attempt finished.");
  }
}
