import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import { execSync } from "node:child_process";
import * as readline from "node:readline";

import { ControlBaseCommand } from "../../control-base-command.js";
import { ControlApi } from "../../services/control-api.js";
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

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              account: {
                alias,
                id: account.id,
                name: account.name,
                user: {
                  email: user.email,
                },
              },
              success: true,
            },
            flags,
          ),
        );
      } else {
        this.log(
          `Successfully logged in to ${chalk.cyan(account.name)} (account ID: ${chalk.greenBright(account.id)})`,
        );
        if (alias !== "default") {
          this.log(`Account stored with alias: ${alias}`);
        }

        this.log(`Account ${chalk.cyan(alias)} is now the current account`);
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
}
