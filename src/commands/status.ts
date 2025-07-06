import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import fetch from "node-fetch";
import open from "open";
import ora from "ora";
import { getCliVersion } from "../utils/version.js";

interface StatusResponse {
  status: boolean;
}

export default class StatusCommand extends Command {
  static description = "Check the status of the Ably service";

  static examples = ["<%= config.bin %> <%= command.id %>"];

  static flags = {
    help: Flags.help({ char: "h" }),
    open: Flags.boolean({
      char: "o",
      default: false,
      description: "Open the Ably status page in a browser",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StatusCommand);

    const isInteractive = process.env.ABLY_INTERACTIVE_MODE === 'true';
    const spinner = isInteractive ? null : ora("Checking Ably service status...").start();
    if (isInteractive) {
      this.log("Checking Ably service status...");
    }

    try {
      const response = await fetch("https://ably.com/status/up.json", {
        headers: {
          "Ably-Agent": `ably-cli/${getCliVersion()}`
        }
      });
      const data = (await response.json()) as StatusResponse;
      if (spinner) spinner.stop();

      if (data.status === undefined) {
        this.error(
          "Invalid response from status endpoint: status attribute is missing",
        );
      } else if (data.status) {
        this.log(
          `${chalk.green("✓")} Ably services are ${chalk.green("operational")}`,
        );
        this.log("No incidents currently reported");
      } else {
        this.log(
          `${chalk.red("⨯")} ${chalk.red("Incident detected")} - There are currently open incidents`,
        );
      }

      this.log(
        `\nFor detailed status information, visit ${chalk.cyan("https://status.ably.com")}`,
      );

      if (flags.open) {
        this.log(
          `\n${chalk.cyan("Opening")} https://status.ably.com ${chalk.cyan("in your browser")}...`,
        );
        await open("https://status.ably.com");
      }
    } catch (error) {
      if (spinner) {
        spinner.fail("Failed to check Ably service status");
      } else {
        this.log(chalk.red("Failed to check Ably service status"));
      }
      if (error instanceof Error) {
        this.error(error.message);
      } else {
        this.error("An unknown error occurred");
      }
    }
  }
}
