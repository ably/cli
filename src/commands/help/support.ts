import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import open from "open";

export default class SupportCommand extends Command {
  static description = "Get support from Ably";

  static examples = ["<%= config.bin %> <%= command.id %>"];

  static flags = {
    help: Flags.help({ char: "h" }),
  };

  async run(): Promise<void> {
    await this.parse(SupportCommand);

    this.log(
      `${chalk.cyan("Opening")} https://ably.com/support ${chalk.cyan("in your browser")}...`,
    );
    await open("https://ably.com/support");
  }
}
