import inquirer from "inquirer";
import type { ConfigManager, AccountConfig } from "./config-manager.js";
import type { App, ControlApi, Key } from "./control-api.js";

export interface InteractiveHelperOptions {
  logErrors?: boolean;
}

export class InteractiveHelper {
  private configManager: ConfigManager;
  private logErrors: boolean;

  constructor(
    configManager: ConfigManager,
    options: InteractiveHelperOptions = {},
  ) {
    this.configManager = configManager;
    this.logErrors = options.logErrors !== false; // Default to true
  }

  /**
   * Confirm an action with the user
   */
  async confirm(message: string): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([
      {
        default: false,
        message,
        name: "confirmed",
        type: "confirm",
      },
    ]);

    return confirmed;
  }

  /**
   * Interactively select an account from the list of configured accounts
   */
  async selectAccount(): Promise<{
    account: AccountConfig;
    alias: string;
  } | null> {
    try {
      const accounts = this.configManager.listAccounts();
      const currentAlias = this.configManager.getCurrentAccountAlias();

      if (accounts.length === 0) {
        console.log(
          'No accounts configured. Use "ably accounts login" to add an account.',
        );
        return null;
      }

      const { selectedAccount } = await inquirer.prompt([
        {
          choices: accounts.map((account) => {
            const isCurrent = account.alias === currentAlias;
            const accountInfo =
              account.account.accountName ||
              account.account.accountId ||
              "Unknown";
            const userInfo = account.account.userEmail || "Unknown";
            return {
              name: `${isCurrent ? "* " : "  "}${account.alias} (${accountInfo}, ${userInfo})`,
              value: account,
            };
          }),
          message: "Select an account:",
          name: "selectedAccount",
          type: "list",
        },
      ]);

      return selectedAccount;
    } catch (error) {
      if (this.logErrors) {
        console.error("Error selecting account:", error);
      }
      return null;
    }
  }

  /**
   * Interactively select an app from the list of available apps
   */
  async selectApp(controlApi: ControlApi): Promise<App | null> {
    try {
      const apps = await controlApi.listApps();

      if (apps.length === 0) {
        console.log(
          'No apps found. Create an app with "ably apps create" first.',
        );
        return null;
      }

      const { selectedApp } = await inquirer.prompt([
        {
          choices: apps.map((app) => ({
            name: `${app.name} (${app.id})`,
            value: app,
          })),
          message: "Select an app:",
          name: "selectedApp",
          type: "list",
        },
      ]);

      return selectedApp;
    } catch (error) {
      if (this.logErrors) {
        console.error("Error fetching apps:", error);
      }
      return null;
    }
  }

  /**
   * Interactively select a key from the list of available keys for an app
   */
  async selectKey(controlApi: ControlApi, appId: string): Promise<Key | null> {
    try {
      const keys = await controlApi.listKeys(appId);

      if (keys.length === 0) {
        console.log("No keys found for this app.");
        return null;
      }

      const { selectedKey } = await inquirer.prompt([
        {
          choices: keys.map((key) => ({
            name: `${key.name || "Unnamed key"} (${key.id})`,
            value: key,
          })),
          message: "Select a key:",
          name: "selectedKey",
          type: "list",
        },
      ]);

      return selectedKey;
    } catch (error) {
      if (this.logErrors) {
        console.error("Error fetching keys:", error);
      }
      return null;
    }
  }
}
