import { Args, Flags } from "@oclif/core";
import * as readline from "node:readline";

import { ControlBaseCommand } from "../../control-base-command.js";
import AppsSwitch from "./switch.js";

export default class AppsDeleteCommand extends ControlBaseCommand {
  static args = {
    id: Args.string({
      description: "App ID to delete (uses current app if not specified)",
      required: false,
    }),
  };

  static description = "Delete an app";

  static examples = [
    "$ ably apps delete",
    "$ ably apps delete app-id",
    '$ ably apps delete app-id --access-token "YOUR_ACCESS_TOKEN"',
    "$ ably apps delete app-id --force",
    "$ ably apps delete app-id --json",
    "$ ably apps delete app-id --pretty-json",
  ];

  static flags = {
    ...ControlBaseCommand.globalFlags,
    force: Flags.boolean({
      char: "f",
      default: false,
      description: "Skip confirmation prompt",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsDeleteCommand);

    const controlApi = this.createControlApi(flags);

    // Use current app ID if none is provided
    let appIdToDelete = args.id;
    if (!appIdToDelete) {
      appIdToDelete = this.configManager.getCurrentAppId();
      if (!appIdToDelete) {
        const error =
          'No app ID provided and no current app selected. Please provide an app ID or select a default app with "ably apps switch".';
        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput(
              {
                error,
                status: "error",
                success: false,
              },
              flags,
            ),
          );
        } else {
          this.error(error);
        }

        return;
      }
    }

    // Check if we're deleting the current app
    const isDeletingCurrentApp =
      appIdToDelete === this.configManager.getCurrentAppId();

    try {
      // Get app details
      const app = await controlApi.getApp(appIdToDelete);

      // If not using force flag or JSON mode, get app details and prompt for confirmation
      if (!flags.force && !this.shouldOutputJson(flags)) {
        this.log(`\nYou are about to delete the following app:`);
        this.log(`App ID: ${app.id}`);
        this.log(`Name: ${app.name}`);
        this.log(`Status: ${app.status}`);
        this.log(`Account ID: ${app.accountId}`);
        this.log(`Created: ${this.formatDate(app.created)}`);

        // For additional confirmation, prompt user to enter the app name
        const nameConfirmed = await this.promptForAppName(app.name);
        if (!nameConfirmed) {
          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput(
                {
                  appId: app.id,
                  error: "Deletion cancelled - app name did not match",
                  status: "cancelled",
                  success: false,
                },
                flags,
              ),
            );
          } else {
            this.log("Deletion cancelled - app name did not match");
          }

          return;
        }

        const confirmed = await this.promptForConfirmation(
          `\nAre you sure you want to delete app "${app.name}" (${app.id})? This action cannot be undone. [y/N]`,
        );

        if (!confirmed) {
          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput(
                {
                  appId: app.id,
                  error: "Deletion cancelled by user",
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

      if (!this.shouldOutputJson(flags)) {
        this.log(`Deleting app ${appIdToDelete}...`);
      }

      await controlApi.deleteApp(appIdToDelete);

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              app: {
                id: app.id,
                name: app.name,
              },
              success: true,
              timestamp: new Date().toISOString(),
            },
            flags,
          ),
        );
      } else {
        this.log("App deleted successfully");
      }

      // If we deleted the current app, run switch command to select a new one
      if (isDeletingCurrentApp && !this.shouldOutputJson(flags)) {
        this.log("\nThe current app was deleted. Switching to another app...");

        // Create a new instance of AppsSwitch and run it
        const switchCommand = new AppsSwitch(this.argv, this.config);
        await switchCommand.run();
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              appId: appIdToDelete,
              error: error instanceof Error ? error.message : String(error),
              status: "error",
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(
          `Error deleting app: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private promptForAppName(appName: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise<boolean>((resolve) => {
      rl.question(
        `For confirmation, please enter the app name (${appName}): `,
        (answer) => {
          rl.close();
          resolve(answer === appName);
        },
      );
    });
  }

  private promptForConfirmation(message: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise<boolean>((resolve) => {
      rl.question(message + " ", (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
      });
    });
  }
}
