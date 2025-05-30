import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import * as readline from "node:readline";

import { ControlBaseCommand } from "../../../control-base-command.js";

export default class ChannelRulesDeleteCommand extends ControlBaseCommand {
  static args = {
    nameOrId: Args.string({
      description: "Name or ID of the channel rule to delete",
      required: true,
    }),
  };

  static description = "Delete a channel rule";

  static examples = [
    "$ ably apps channel-rules delete chat",
    '$ ably apps channel-rules delete events --app "My App"',
    "$ ably apps channel-rules delete notifications --force",
    "$ ably apps channel-rules delete chat --json",
    "$ ably apps channel-rules delete chat --pretty-json",
  ];

  static flags = {
    ...ControlBaseCommand.globalFlags,
    app: Flags.string({
      description: "App ID or name to delete the channel rule from",
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
    const { args, flags } = await this.parse(ChannelRulesDeleteCommand);

    const controlApi = this.createControlApi(flags);
    let appId: string | undefined;

    try {
      let appId = flags.app;
      if (!appId) {
        appId = await this.resolveAppId(flags);
      }

      if (!appId) {
        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput(
              {
                error:
                  'No app specified. Use --app flag or select an app with "ably apps switch"',
                status: "error",
                success: false,
              },
              flags,
            ),
          );
        } else {
          this.error(
            'No app specified. Use --app flag or select an app with "ably apps switch"',
          );
        }

        return;
      }

      // Find the namespace by name or ID
      const namespaces = await controlApi.listNamespaces(appId);
      const namespace = namespaces.find((n) => n.id === args.nameOrId);

      if (!namespace) {
        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput(
              {
                appId,
                error: `Channel rule "${args.nameOrId}" not found`,
                status: "error",
                success: false,
              },
              flags,
            ),
          );
        } else {
          this.error(`Channel rule "${args.nameOrId}" not found`);
        }

        return;
      }

      // If not using force flag or JSON mode, prompt for confirmation
      if (!flags.force && !this.shouldOutputJson(flags)) {
        this.log(`\nYou are about to delete the following channel rule:`);
        this.log(`ID: ${namespace.id}`);
        this.log(
          `Persisted: ${namespace.persisted ? chalk.green("Yes") : "No"}`,
        );
        this.log(
          `Push Enabled: ${namespace.pushEnabled ? chalk.green("Yes") : "No"}`,
        );

        if (namespace.authenticated !== undefined) {
          this.log(
            `Authenticated: ${namespace.authenticated ? chalk.green("Yes") : "No"}`,
          );
        }

        if (namespace.persistLast !== undefined) {
          this.log(
            `Persist Last: ${namespace.persistLast ? chalk.green("Yes") : "No"}`,
          );
        }

        if (namespace.exposeTimeSerial !== undefined) {
          this.log(
            `Expose Time Serial: ${namespace.exposeTimeSerial ? chalk.green("Yes") : "No"}`,
          );
        }

        if (namespace.populateChannelRegistry !== undefined) {
          this.log(
            `Populate Channel Registry: ${namespace.populateChannelRegistry ? chalk.green("Yes") : "No"}`,
          );
        }

        if (namespace.batchingEnabled !== undefined) {
          this.log(
            `Batching Enabled: ${namespace.batchingEnabled ? chalk.green("Yes") : "No"}`,
          );
        }

        if (namespace.batchingInterval !== undefined) {
          this.log(
            `Batching Interval: ${chalk.green(namespace.batchingInterval.toString())}`,
          );
        }

        if (namespace.conflationEnabled !== undefined) {
          this.log(
            `Conflation Enabled: ${namespace.conflationEnabled ? chalk.green("Yes") : "No"}`,
          );
        }

        if (namespace.conflationInterval !== undefined) {
          this.log(
            `Conflation Interval: ${chalk.green(namespace.conflationInterval.toString())}`,
          );
        }

        if (namespace.conflationKey !== undefined) {
          this.log(`Conflation Key: ${chalk.green(namespace.conflationKey)}`);
        }

        if (namespace.tlsOnly !== undefined) {
          this.log(
            `TLS Only: ${namespace.tlsOnly ? chalk.green("Yes") : "No"}`,
          );
        }

        this.log(`Created: ${this.formatDate(namespace.created)}`);

        const confirmed = await this.promptForConfirmation(
          `\nAre you sure you want to delete channel rule with ID "${namespace.id}"? [y/N]`,
        );

        if (!confirmed) {
          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput(
                {
                  appId,
                  error: "Deletion cancelled by user",
                  ruleId: namespace.id,
                  status: "cancelled",
                  success: false,
                },
                flags,
              ),
            );
          } else {
            this.log("Deletion cancelled");
          }

          return;
        }
      }

      await controlApi.deleteNamespace(appId, namespace.id);

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              appId,
              rule: {
                id: namespace.id,
              },
              success: true,
              timestamp: new Date().toISOString(),
            },
            flags,
          ),
        );
      } else {
        this.log(`Channel rule with ID "${namespace.id}" deleted successfully`);
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              appId,
              error: error instanceof Error ? error.message : String(error),
              status: "error",
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(
          `Error deleting channel rule: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private promptForConfirmation(prompt: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y");
      });
    });
  }
}
