import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import { execSync } from "node:child_process";
import * as readline from "node:readline";

import { ControlBaseCommand } from "../../control-base-command.js";
import { ControlApi } from "../../services/control-api.js";
import { BaseFlags } from "../../types/cli.js";
import { displayLogo } from "../../utils/logo.js";

// Moved function definition outside the class
function validateAndGetAlias(
  input: string,
  logFn: (msg: string) => void,
): null | string {
  const trimmedAlias = input.trim();
  if (!trimmedAlias) {
    return null;
  }

  // Convert to lowercase for case-insensitive comparison
  const lowercaseAlias = trimmedAlias.toLowerCase();

  // First character must be a letter
  if (!/^[a-z]/.test(lowercaseAlias)) {
    logFn("Error: Alias must start with a letter");
    return null;
  }

  // Only allow letters, numbers, dashes, and underscores after first character
  if (!/^[a-z][\d_a-z-]*$/.test(lowercaseAlias)) {
    logFn(
      "Error: Alias can only contain letters, numbers, dashes, and underscores",
    );
    return null;
  }

  return lowercaseAlias;
}

export default class AccountsLogin extends ControlBaseCommand {
  static override args = {
    token: Args.string({
      description: "Access token (if not provided, will prompt for it)",
      required: false,
    }),
  };

  static override description = "Log in to your Ably account";

  static override examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --alias mycompany",
    "<%= config.bin %> <%= command.id %> --json",
    "<%= config.bin %> <%= command.id %> --pretty-json",
    "<%= config.bin %> <%= command.id %> --non-interactive",
    "<%= config.bin %> <%= command.id %> TOKEN --alias mycompany --non-interactive",
  ];

  static override flags = {
    ...ControlBaseCommand.globalFlags,
    alias: Flags.string({
      char: "a",
      description: "Alias for this account (default account if not specified)",
    }),
    "no-browser": Flags.boolean({
      default: false,
      description: "Do not open a browser",
    }),
    "non-interactive": Flags.boolean({
      default: false,
      description: "Run in non-interactive mode with defaults",
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AccountsLogin);

    // Display ASCII art logo if not in JSON mode
    if (!this.shouldOutputJson(flags)) {
      displayLogo(this.log.bind(this));
    }

    let accessToken: string;
    if (args.token) {
      accessToken = args.token;
    } else {
      let obtainTokenPath = "https://ably.com/users/access_tokens";
      if (flags["control-host"]) {
        if (!this.shouldOutputJson(flags)) {
          this.log("Using control host:", flags["control-host"]);
        }

        obtainTokenPath = flags["control-host"].includes("local")
          ? `http://${flags["control-host"]}/users/access_tokens`
          : `https://${flags["control-host"]}/users/access_tokens`;
      }

      // Prompt the user to get a token
      if (!flags["no-browser"]) {
        if (!this.shouldOutputJson(flags)) {
          this.log("Opening browser to get an access token...");
        }

        this.openBrowser(obtainTokenPath);
      } else if (!this.shouldOutputJson(flags)) {
        this.log(`Please visit ${obtainTokenPath} to create an access token`);
      }

      accessToken = await this.promptForToken();
    }

    // If no alias flag provided, prompt the user if they want to provide one
    let { alias } = flags;
    if (!alias && !this.shouldOutputJson(flags)) {
      // In non-interactive mode, use "default" alias
      if (this.isNonInteractive(flags)) {
        alias = "default";
        if (!this.shouldOutputJson(flags)) {
          this.log("Using default alias in non-interactive mode");
        }
      } else {
        // Check if the default account already exists
        const accounts = this.configManager.listAccounts();
        const hasDefaultAccount = accounts.some(
          (account) => account.alias === "default",
        );

        if (hasDefaultAccount) {
          // Explain to the user the implications of not providing an alias
          this.log("\nYou have not specified an alias for this account.");
          this.log(
            "If you continue without an alias, your existing default account configuration will be overwritten.",
          );
          this.log(
            "To maintain multiple account profiles, please provide an alias.",
          );

          // Ask if they want to provide an alias
          const shouldProvideAlias = await this.promptYesNo(
            "Would you like to provide an alias for this account?",
          );

          if (shouldProvideAlias) {
            alias = await this.promptForAlias();
          } else {
            alias = "default";
            this.log(
              "No alias provided. The default account configuration will be overwritten.",
            );
          }
        } else {
          // No default account exists yet, but still offer to set an alias
          this.log("\nYou have not specified an alias for this account.");
          this.log(
            "Using an alias allows you to maintain multiple account profiles that you can switch between.",
          );

          // Ask if they want to provide an alias
          const shouldProvideAlias = await this.promptYesNo(
            "Would you like to provide an alias for this account?",
          );

          if (shouldProvideAlias) {
            alias = await this.promptForAlias();
          } else {
            alias = "default";
            this.log(
              "No alias provided. This will be set as your default account.",
            );
          }
        }
      }
    } else if (!alias) {
      alias = "default";
    }

    try {
      // Fetch account information
      const controlApi = new ControlApi({
        accessToken,
        controlHost: flags["control-host"],
      });

      const { account, user } = await controlApi.getMe();

      // Store the account information
      this.configManager.storeAccount(accessToken, alias, {
        accountId: account.id,
        accountName: account.name,
        tokenId: "unknown", // Token ID is not returned by getMe(), would need additional API if needed
        userEmail: user.email,
      });

      // Switch to this account
      this.configManager.switchAccount(alias);

      // Handle app selection based on available apps
      let selectedApp = null;
      let isAutoSelected = false;
      try {
        const apps = await controlApi.listApps();

        if (apps.length === 1) {
          // Auto-select the only app
          selectedApp = apps[0];
          isAutoSelected = true;
          this.configManager.setCurrentApp(selectedApp.id);
          this.configManager.storeAppInfo(selectedApp.id, {
            appName: selectedApp.name,
          });
        } else if (apps.length > 1 && !this.shouldOutputJson(flags)) {
          if (this.isNonInteractive(flags)) {
            // In non-interactive mode, select the first app
            selectedApp = apps[0];
            this.configManager.setCurrentApp(selectedApp.id);
            this.configManager.storeAppInfo(selectedApp.id, {
              appName: selectedApp.name,
            });
            this.log(`Selected first available app in non-interactive mode: ${selectedApp.name} (${selectedApp.id})`);
          } else {
            // Prompt user to select an app when multiple exist
            this.log("\nSelect an app to use:");

            selectedApp = await this.interactiveHelper.selectApp(controlApi);

            if (selectedApp) {
              this.configManager.setCurrentApp(selectedApp.id);
              this.configManager.storeAppInfo(selectedApp.id, {
                appName: selectedApp.name,
              });
            }
          }
        } else if (apps.length === 0 && !this.shouldOutputJson(flags)) {
          if (this.isNonInteractive(flags)) {
            // In non-interactive mode, skip app creation
            this.log("No apps found. Skipping app creation in non-interactive mode.");
            this.log("You can create an app later with: ably apps create --name 'My App'");
          } else {
            // No apps exist - offer to create one
            this.log("\nNo apps found in your account.");

            const shouldCreateApp = await this.promptYesNo(
              "Would you like to create your first app now?"
            );

            if (shouldCreateApp) {
              const appName = await this.promptForAppName();

              try {
                this.log(`\nCreating app "${appName}"...`);

                const app = await controlApi.createApp({
                  name: appName,
                  tlsOnly: false, // Default to false for simplicity
                });

                selectedApp = app;
                isAutoSelected = true; // Consider this auto-selected since it's the only one

                // Set as current app
                this.configManager.setCurrentApp(app.id);
                this.configManager.storeAppInfo(app.id, { appName: app.name });

                this.log(`${chalk.green("✓")} App created successfully!`);
              } catch (createError) {
                this.warn(`Failed to create app: ${createError instanceof Error ? createError.message : String(createError)}`);
                // Continue with login even if app creation fails
              }
            }
          }
        }
        // If apps.length === 0 and JSON mode, or user declined to create app, do nothing
      } catch (error) {
        // Don't fail login if app fetching fails, just log for debugging
        if (!this.shouldOutputJson(flags)) {
          this.warn(`Could not fetch apps: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // If we have a selected app, also handle API key selection
      let selectedKey = null;
      let isKeyAutoSelected = false;
      if (selectedApp && !this.shouldOutputJson(flags)) {
        try {
          const keys = await controlApi.listKeys(selectedApp.id);

          if (keys.length === 1) {
            // Auto-select the only key
            selectedKey = keys[0];
            isKeyAutoSelected = true;
            this.configManager.storeAppKey(selectedApp.id, selectedKey.key, {
              keyId: selectedKey.id,
              keyName: selectedKey.name || "Unnamed key",
            });
          } else if (keys.length > 1) {
            if (this.isNonInteractive(flags)) {
              // In non-interactive mode, select the first key (usually the root key)
              selectedKey = keys[0];
              this.configManager.storeAppKey(selectedApp.id, selectedKey.key, {
                keyId: selectedKey.id,
                keyName: selectedKey.name || "Unnamed key",
              });
              this.log(`Selected first available API key in non-interactive mode: ${selectedKey.name || "Unnamed key"} (${selectedKey.id})`);
            } else {
              // Prompt user to select a key when multiple exist
              this.log("\nSelect an API key to use:");

              selectedKey = await this.interactiveHelper.selectKey(controlApi, selectedApp.id);

              if (selectedKey) {
                this.configManager.storeAppKey(selectedApp.id, selectedKey.key, {
                  keyId: selectedKey.id,
                  keyName: selectedKey.name || "Unnamed key",
                });
              }
            }
          }
          // If keys.length === 0, continue without key (should be rare for newly created apps)
        } catch (keyError) {
          // Don't fail login if key fetching fails
          this.warn(`Could not fetch API keys: ${keyError instanceof Error ? keyError.message : String(keyError)}`);
        }
      }

      if (this.shouldOutputJson(flags)) {
        const response: {
          account: {
            alias: string;
            id: string;
            name: string;
            user: { email: string };
          };
          success: boolean;
          app?: {
            id: string;
            name: string;
            autoSelected: boolean;
          };
          key?: {
            id: string;
            name: string;
            autoSelected: boolean;
          };
        } = {
          account: {
            alias,
            id: account.id,
            name: account.name,
            user: {
              email: user.email,
            },
          },
          success: true,
        };

        if (selectedApp) {
          response.app = {
            id: selectedApp.id,
            name: selectedApp.name,
            autoSelected: isAutoSelected,
          };

          if (selectedKey) {
            response.key = {
              id: selectedKey.id,
              name: selectedKey.name || "Unnamed key",
              autoSelected: isKeyAutoSelected,
            };
          }
        }

        this.log(this.formatJsonOutput(response, flags));
      } else {
        this.log(
          `Successfully logged in to ${chalk.cyan(account.name)} (account ID: ${chalk.greenBright(account.id)})`,
        );
        if (alias !== "default") {
          this.log(`Account stored with alias: ${alias}`);
        }

        this.log(`Account ${chalk.cyan(alias)} is now the current account`);

        if (selectedApp) {
          const message = isAutoSelected
            ? `${chalk.green("✓")} Automatically selected app: ${chalk.cyan(selectedApp.name)} (${selectedApp.id})`
            : `${chalk.green("✓")} Selected app: ${chalk.cyan(selectedApp.name)} (${selectedApp.id})`;
          this.log(message);
        }

        if (selectedKey) {
          const keyMessage = isKeyAutoSelected
            ? `${chalk.green("✓")} Automatically selected API key: ${chalk.cyan(selectedKey.name || "Unnamed key")} (${selectedKey.id})`
            : `${chalk.green("✓")} Selected API key: ${chalk.cyan(selectedKey.name || "Unnamed key")} (${selectedKey.id})`;
          this.log(keyMessage);
        }
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              error: error instanceof Error ? error.message : String(error),
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(`Failed to authenticate: ${error}`);
      }
    }
  }

  private openBrowser(url: string): void {
    try {
      const command =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";

      execSync(`${command} ${url}`);
    } catch (error) {
      this.warn(`Failed to open browser: ${error}`);
      this.log(`Please visit ${url} manually to create an access token`);
    }
  }

  private promptForAlias(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Pass this.log as the logging function to the external validator
    const logFn = this.log.bind(this);

    return new Promise((resolve) => {
      const askForAlias = () => {
        rl.question(
          'Enter an alias for this account (e.g. "dev", "production", "personal"): ',
          (alias) => {
            // Use the external validator function, passing the log function
            const validatedAlias = validateAndGetAlias(alias, logFn);

            if (validatedAlias === null) {
              if (!alias.trim()) {
                logFn("Error: Alias cannot be empty"); // Use logFn here too
              }

              askForAlias();
            } else {
              rl.close();
              resolve(validatedAlias);
            }
          },
        );
      };

      askForAlias();
    });
  }

  private promptForAppName(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      const askForAppName = () => {
        rl.question('Enter a name for your app: ', (appName) => {
          const trimmedName = appName.trim();

          if (trimmedName.length === 0) {
            this.log("Error: App name cannot be empty");
            askForAppName();
          } else {
            rl.close();
            resolve(trimmedName);
          }
        });
      };

      askForAppName();
    });
  }

  private promptForToken(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question("\nEnter your access token: ", (token) => {
        rl.close();
        resolve(token.trim());
      });
    });
  }

  private promptYesNo(question: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      const askQuestion = () => {
        rl.question(`${question} (y/n) `, (answer) => {
          const lowercaseAnswer = answer.toLowerCase().trim();

          if (lowercaseAnswer === "y" || lowercaseAnswer === "yes") {
            rl.close();
            resolve(true);
          } else if (lowercaseAnswer === "n" || lowercaseAnswer === "no") {
            rl.close();
            resolve(false);
          } else {
            this.log("Please answer with yes/y or no/n");
            askQuestion();
          }
        });
      };

      askQuestion();
    });
  }

  private isNonInteractive(flags: BaseFlags): boolean {
    return Boolean(flags["non-interactive"]) || process.env.ABLY_CLI_NON_INTERACTIVE === 'true';
  }
}
