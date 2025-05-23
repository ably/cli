import chalk from "chalk";

import type { Namespace } from "../../../services/control-api.js";

import { ControlBaseCommand } from "../../../control-base-command.js";

interface ChannelRuleOutput {
  authenticated: boolean;
  batchingEnabled: boolean;
  batchingInterval: null | number;
  conflationEnabled: boolean;
  conflationInterval: null | number;
  conflationKey: null | string;
  created: string;
  exposeTimeSerial: boolean;
  id: string;
  modified: string;
  persistLast: boolean;
  persisted: boolean;
  populateChannelRegistry: boolean;
  pushEnabled: boolean;
  tlsOnly: boolean;
}

export default class ChannelRulesListCommand extends ControlBaseCommand {
  static description = "List channel rules for an app";

  static examples = [
    "$ ably apps:channel-rules:list",
    "$ ably apps:channel-rules:list --app-id my-app-id",
    "$ ably apps:channel-rules:list --json",
    "$ ably apps:channel-rules:list --pretty-json",
  ];

  static flags = {
    ...ControlBaseCommand.flags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ChannelRulesListCommand);
    const appId = await this.resolveAppId(flags);

    if (!appId) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              error:
                'No app specified. Use --app-id flag or select an app with "ably apps switch"',
              status: "error",
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(
          'No app specified. Use --app-id flag or select an app with "ably apps switch"',
        );
      }

      return;
    }

    try {
      const controlApi = await this.createControlApi(flags);
      const namespaces = await controlApi.listNamespaces(appId);

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              appId,
              rules: namespaces.map(
                (rule: Namespace): ChannelRuleOutput => ({
                  authenticated: rule.authenticated || false,
                  batchingEnabled: rule.batchingEnabled || false,
                  batchingInterval: rule.batchingInterval || null,
                  conflationEnabled: rule.conflationEnabled || false,
                  conflationInterval: rule.conflationInterval || null,
                  conflationKey: rule.conflationKey || null,
                  created: new Date(rule.created).toISOString(),
                  exposeTimeSerial: rule.exposeTimeSerial || false,
                  id: rule.id,
                  modified: new Date(rule.modified).toISOString(),
                  persistLast: rule.persistLast || false,
                  persisted: rule.persisted || false,
                  populateChannelRegistry:
                    rule.populateChannelRegistry || false,
                  pushEnabled: rule.pushEnabled || false,
                  tlsOnly: rule.tlsOnly || false,
                }),
              ),
              success: true,
              timestamp: new Date().toISOString(),
              total: namespaces.length,
            },
            flags,
          ),
        );
      } else {
        if (namespaces.length === 0) {
          this.log("No channel rules found");
          return;
        }

        this.log(`Found ${namespaces.length} channel rules:\n`);

        namespaces.forEach((namespace: Namespace) => {
          this.log(chalk.bold(`Channel Rule ID: ${namespace.id}`));
          this.log(
            `  Persisted: ${namespace.persisted ? chalk.bold.green("✓ Yes") : "No"}`,
          );
          this.log(
            `  Push Enabled: ${namespace.pushEnabled ? chalk.bold.green("✓ Yes") : "No"}`,
          );
          if (namespace.authenticated !== undefined) {
            this.log(
              `  Authenticated: ${namespace.authenticated ? chalk.bold.green("✓ Yes") : "No"}`,
            );
          }

          if (namespace.persistLast !== undefined) {
            this.log(
              `  Persist Last Message: ${namespace.persistLast ? chalk.bold.green("✓ Yes") : "No"}`,
            );
          }

          if (namespace.exposeTimeSerial !== undefined) {
            this.log(
              `  Expose Time Serial: ${namespace.exposeTimeSerial ? chalk.bold.green("✓ Yes") : "No"}`,
            );
          }

          if (namespace.populateChannelRegistry !== undefined) {
            this.log(
              `  Populate Channel Registry: ${namespace.populateChannelRegistry ? chalk.bold.green("✓ Yes") : "No"}`,
            );
          }

          if (namespace.batchingEnabled !== undefined) {
            this.log(
              `  Batching Enabled: ${namespace.batchingEnabled ? chalk.bold.green("✓ Yes") : "No"}`,
            );
          }

          if (
            namespace.batchingInterval !== undefined &&
            namespace.batchingInterval !== null &&
            namespace.batchingInterval !== 0
          ) {
            this.log(
              `  Batching Interval: ${chalk.bold.green(`✓ ${namespace.batchingInterval}`)}`,
            );
          }

          if (namespace.conflationEnabled !== undefined) {
            this.log(
              `  Conflation Enabled: ${namespace.conflationEnabled ? chalk.bold.green("✓ Yes") : "No"}`,
            );
          }

          if (
            namespace.conflationInterval !== undefined &&
            namespace.conflationInterval !== null &&
            namespace.conflationInterval !== 0
          ) {
            this.log(
              `  Conflation Interval: ${chalk.bold.green(`✓ ${namespace.conflationInterval}`)}`,
            );
          }

          if (
            namespace.conflationKey !== undefined &&
            namespace.conflationKey &&
            namespace.conflationKey !== ""
          ) {
            this.log(
              `  Conflation Key: ${chalk.bold.green(`✓ ${namespace.conflationKey}`)}`,
            );
          }

          if (namespace.tlsOnly !== undefined) {
            this.log(
              `  TLS Only: ${namespace.tlsOnly ? chalk.bold.green("✓ Yes") : "No"}`,
            );
          }

          this.log(`  Created: ${this.formatDate(namespace.created)}`);
          this.log(`  Updated: ${this.formatDate(namespace.modified)}`);
          this.log(""); // Add a blank line between rules
        });
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
          `Error listing channel rules: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
