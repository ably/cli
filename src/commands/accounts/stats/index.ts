import { Flags } from "@oclif/core";
import chalk from "chalk";

import { ControlBaseCommand } from "../../../control-base-command.js";
import { StatsDisplay } from "../../../services/stats-display.js";
import type { BaseFlags } from "../../../types/cli.js";
import type { ControlApi } from "../../../services/control-api.js";

export default class AccountsStatsCommand extends ControlBaseCommand {
  static description = "Get account stats with optional live updates";

  static examples = [
    "$ ably accounts stats",
    "$ ably accounts stats --unit hour",
    "$ ably accounts stats --start 1618005600000 --end 1618091999999",
    "$ ably accounts stats --limit 10",
    "$ ably accounts stats --json",
    "$ ably accounts stats --pretty-json",
    "$ ably accounts stats --live",
    "$ ably accounts stats --live --interval 15",
  ];

  static flags = {
    ...ControlBaseCommand.globalFlags,
    debug: Flags.boolean({
      default: false,
      description: "Show debug information for live stats polling",
    }),
    end: Flags.integer({
      description: "End time in milliseconds since epoch",
    }),
    interval: Flags.integer({
      default: 6,
      description: "Polling interval in seconds (only used with --live)",
    }),
    limit: Flags.integer({
      default: 10,
      description: "Maximum number of stats records to return",
    }),

    live: Flags.boolean({
      default: false,
      description: "Subscribe to live stats updates (uses minute interval)",
    }),
    start: Flags.integer({
      description: "Start time in milliseconds since epoch",
    }),
    unit: Flags.string({
      default: "minute",
      description: "Time unit for stats",
      options: ["minute", "hour", "day", "month"],
    }),
  };

  private isPolling = false;
  private pollInterval: NodeJS.Timeout | undefined = undefined;
  private statsDisplay: StatsDisplay | null = null; // Track when we're already fetching stats

  async run(): Promise<void> {
    const { flags } = await this.parse(AccountsStatsCommand);

    // For live stats, enforce minute interval
    if (flags.live && flags.unit !== "minute") {
      this.warn(
        "Live stats only support minute intervals. Using minute interval.",
      );
      flags.unit = "minute";
    }

    // Display authentication information
    this.showAuthInfoIfNeeded(flags);

    const controlApi = this.createControlApi(flags);

    // Create stats display
    this.statsDisplay = new StatsDisplay({
      intervalSeconds: flags.interval as number,
      isAccountStats: true,
      json: this.shouldOutputJson(flags),
      live: flags.live,
      startTime: flags.live ? new Date() : undefined,
      unit: flags.unit as "day" | "hour" | "minute" | "month",
    });

    await (flags.live
      ? this.runLiveStats(flags, controlApi)
      : this.runOneTimeStats(flags, controlApi));
  }

  private async fetchAndDisplayStats(
    flags: BaseFlags,
    controlApi: ControlApi,
  ): Promise<void> {
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

      const stats = await controlApi.getAccountStats({
        end: now.getTime(),
        limit: 1, // Only get the most recent stats for live updates
        start: start.getTime(),
        unit: flags.unit as string,
      });

      if (stats.length > 0) {
        this.statsDisplay!.display(stats[0]);
      }
    } catch (error) {
      this.error(
        `Error fetching stats: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async pollStats(
    flags: BaseFlags,
    controlApi: ControlApi,
  ): Promise<void> {
    try {
      this.isPolling = true;
      if (flags.debug) {
        console.log(
          chalk.dim(`\n[${new Date().toISOString()}] Polling for new stats...`),
        );
      }

      await this.fetchAndDisplayStats(flags, controlApi);
    } catch (error) {
      if (flags.debug) {
        console.error(
          chalk.red(
            `Error during stats polling: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async runLiveStats(
    flags: BaseFlags,
    controlApi: ControlApi,
  ): Promise<void> {
    try {
      // Get account info to display the name
      const { account } = await controlApi.getMe();
      this.log(
        `Subscribing to live stats for account ${account.name} (${account.id})...`,
      );

      // Setup graceful shutdown
      const cleanup = () => {
        if (this.pollInterval) {
          clearInterval(this.pollInterval);
          this.pollInterval = undefined;
        }

        this.log("\nUnsubscribed from live stats");
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      // Show stats immediately before starting polling
      await this.fetchAndDisplayStats(flags, controlApi);

      // Poll for stats at the specified interval
      this.pollInterval = setInterval(
        () => {
          // Use non-blocking polling - don't wait for previous poll to complete
          if (!this.isPolling) {
            this.pollStats(flags, controlApi);
          } else if (flags.debug) {
            // Only show this message if debug flag is enabled
            console.log(
              chalk.yellow(
                "Skipping poll - previous request still in progress",
              ),
            );
          }
        },
        (flags.interval as number) * 1000,
      );

      // Keep the process running
      await new Promise<void>(() => {
        // This promise is intentionally never resolved
        // The process will exit via the SIGINT/SIGTERM handlers
      });
    } catch (error) {
      this.error(
        `Error setting up live stats: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
      }
    }
  }

  private async runOneTimeStats(
    flags: BaseFlags,
    controlApi: ControlApi,
  ): Promise<void> {
    try {
      // If no start/end time provided, use the last 24 hours
      if (!flags.start && !flags.end) {
        const now = new Date();
        flags.end = now.getTime();
        flags.start = now.getTime() - 24 * 60 * 60 * 1000; // 24 hours ago
      }

      const stats = await controlApi.getAccountStats({
        end: flags.end as number,
        limit: flags.limit as number,
        start: flags.start as number,
        unit: flags.unit as string,
      });

      if (stats.length === 0) {
        this.log("No stats found for the specified period");
        return;
      }

      // Display each stat interval
      for (const stat of stats) {
        this.statsDisplay!.display(stat);
      }
    } catch (error) {
      this.error(
        `Error fetching account stats: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
