import { Args, Flags } from "@oclif/core";
import chalk from "chalk";

import { ControlBaseCommand } from "../../control-base-command.js";

export default class IntegrationsGetCommand extends ControlBaseCommand {
  static args = {
    ruleId: Args.string({
      description: "The rule ID to get",
      required: true,
    }),
  };

  static description = "Get an integration rule by ID";

  static examples = [
    "$ ably integrations get rule123",
    "$ ably integrations get rule123 --json",
    '$ ably integrations get rule123 --app "My App" --pretty-json',
  ];

  static flags = {
    ...ControlBaseCommand.globalFlags,

    app: Flags.string({
      description: "App ID or name to get the integration rule from",
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IntegrationsGetCommand);

    // Display authentication information
    this.showAuthInfoIfNeeded(flags);

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

      const rule = await controlApi.getRule(appId, args.ruleId);

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            structuredClone(rule) as unknown as Record<string, unknown>,
            flags,
          ),
        );
      } else {
        this.log(chalk.green("Integration Rule Details:"));
        this.log(`ID: ${rule.id}`);
        this.log(`App ID: ${rule.appId}`);
        this.log(`Rule Type: ${rule.ruleType}`);
        this.log(`Request Mode: ${rule.requestMode}`);
        this.log(`Source Channel Filter: ${rule.source.channelFilter}`);
        this.log(`Source Type: ${rule.source.type}`);
        this.log(
          `Target: ${this.formatJsonOutput(structuredClone(rule.target) as unknown as Record<string, unknown>, flags).replaceAll("\n", "\n  ")}`,
        );
        this.log(`Version: ${rule.version}`);
        this.log(`Created: ${this.formatDate(rule.created)}`);
        this.log(`Updated: ${this.formatDate(rule.modified)}`);
      }
    } catch (error) {
      this.error(
        `Error getting integration rule: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
