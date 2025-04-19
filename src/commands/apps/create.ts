import { Flags } from "@oclif/core";

import { ControlBaseCommand } from "../../control-base-command.js";

export default class AppsCreateCommand extends ControlBaseCommand {
  static description = "Create a new app";

  static examples = [
    '$ ably apps create --name "My New App"',
    '$ ably apps create --name "My New App" --tls-only',
    '$ ably apps create --name "My New App" --access-token "YOUR_ACCESS_TOKEN"',
  ];

  static flags = {
    ...ControlBaseCommand.globalFlags,
    name: Flags.string({
      description: "Name of the app",
      required: true,
    }),
    "tls-only": Flags.boolean({
      default: false,
      description: "Whether the app should accept TLS connections only",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppsCreateCommand);

    const controlApi = this.createControlApi(flags);

    try {
      if (!this.shouldOutputJson(flags)) {
        this.log(`Creating app "${flags.name}"...`);
      }

      const app = await controlApi.createApp({
        name: flags.name,
        tlsOnly: flags["tls-only"],
      });

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              app: {
                accountId: app.accountId,
                created: new Date(app.created).toISOString(),
                id: app.id,
                modified: new Date(app.modified).toISOString(),
                name: app.name,
                status: app.status,
                tlsOnly: app.tlsOnly,
              },
              success: true,
              timestamp: new Date().toISOString(),
            },
            flags,
          ),
        );
      } else {
        this.log(`\nApp created successfully!`);
        this.log(`App ID: ${app.id}`);
        this.log(`Name: ${app.name}`);
        this.log(`Status: ${app.status}`);
        this.log(`Account ID: ${app.accountId}`);
        this.log(`TLS Only: ${app.tlsOnly ? "Yes" : "No"}`);
        this.log(`Created: ${this.formatDate(app.created)}`);
        this.log(`Updated: ${this.formatDate(app.modified)}`);
      }

      // Automatically switch to the newly created app
      this.configManager.setCurrentApp(app.id);
      this.configManager.storeAppInfo(app.id, { appName: app.name });

      if (!this.shouldOutputJson(flags)) {
        this.log(`\nAutomatically switched to app: ${app.name} (${app.id})`);
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              error: error instanceof Error ? error.message : String(error),
              status: "error",
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(
          `Error creating app: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
