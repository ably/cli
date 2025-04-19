import { Args, Flags } from "@oclif/core";
import * as readline from "node:readline";
import chalk from "chalk";

import { ControlBaseCommand } from "../../control-base-command.js";

export default class IntegrationsDeleteCommand extends ControlBaseCommand {
  static args = {
    ruleId: Args.string({
      description: "The rule ID to delete",
      required: true,
    }),
  };

  static description = "Delete an integration rule";

  static examples = [
    "$ ably integrations delete rule123",
    '$ ably integrations delete rule123 --app "My App"',
    "$ ably integrations delete rule123 --force",
  ];

  static flags = {
    ...ControlBaseCommand.globalFlags,
    app: Flags.string({
      description: "App ID or name to delete the integration rule from",
      required: false,
    }),
    force: Flags.boolean({
      char: "f",
      default: false,
      description: "Force deletion without confirmation",
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IntegrationsDeleteCommand);

    const controlApi = this.createControlApi(flags);

    try {
      // Get app ID from flags or config
      const appId = await this.resolveAppId(flags);

      if (!appId) {
        this.error(
          'No app specified. Use --app flag or select an app with "ably apps switch"',
        );
        return;
      }

      // Get rule details for confirmation
      const rule = await controlApi.getRule(appId, args.ruleId);

      // If not using force flag, prompt for confirmation
      if (!flags.force) {
        this.log(`\nYou are about to delete the following integration rule:`);
        this.log(`Rule ID: ${rule.id}`);
        this.log(`Type: ${rule.ruleType}`);
        this.log(`Request Mode: ${rule.requestMode}`);
        this.log(`Source Type: ${rule.source.type}`);
        this.log(`Channel Filter: ${rule.source.channelFilter || "(none)"}`);

        const confirmed = await this.promptForConfirmation(
          `\nAre you sure you want to delete integration rule "${rule.id}"? [y/N]`,
        );

        if (!confirmed) {
          this.log("Deletion cancelled");
          return;
        }
      }

      await controlApi.deleteRule(appId, args.ruleId);

      this.log(chalk.green("Integration Rule Deleted Successfully:"));
      this.log(`ID: ${rule.id}`);
      this.log(`App ID: ${rule.appId}`);
      this.log(`Rule Type: ${rule.ruleType}`);
      this.log(`Source Type: ${rule.source.type}`);
    } catch (error) {
      this.error(
        `Error deleting integration rule: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async promptForConfirmation(message: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y");
      });
    });
  }
}
