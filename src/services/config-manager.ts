import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import toml from "toml";

// Updated to include key and app metadata
export interface AppConfig {
  apiKey?: string;
  appName?: string;
  keyId?: string;
  keyName?: string;
}

export interface AccountConfig {
  accessToken: string;
  accountId?: string;
  accountName?: string;
  apps?: {
    [appId: string]: AppConfig;
  };
  currentAppId?: string;
  tokenId?: string;
  userEmail?: string;
}

export interface AblyConfig {
  accounts: Record<string, AccountConfig>;
  current?: {
    account?: string;
  };
  helpContext?: {
    conversation: {
      messages: {
        content: string;
        role: "assistant" | "user";
      }[];
    };
  };
}

export class ConfigManager {
  private config: AblyConfig = {
    accounts: {},
  };

  private configDir: string;
  private configPath: string;

  constructor() {
    // Determine config directory: Use ABLY_CLI_CONFIG_DIR env var if set, otherwise default
    const customConfigDir = process.env.ABLY_CLI_CONFIG_DIR;
    this.configDir = customConfigDir || path.join(os.homedir(), ".ably");

    // Define the config file path within the determined directory
    this.configPath = path.join(this.configDir, "config");

    // Ensure the directory exists and load the configuration
    this.ensureConfigDirExists();
    this.loadConfig();
  }

  // Clear conversation context
  public clearHelpContext(): void {
    delete this.config.helpContext;
    this.saveConfig();
  }

  // Get access token for the current account or specific alias
  public getAccessToken(alias?: string): string | undefined {
    if (alias) {
      return this.config.accounts[alias]?.accessToken;
    }

    const currentAccount = this.getCurrentAccount();
    return currentAccount?.accessToken;
  }

  // Get API key for current app or specific app ID
  public getApiKey(appId?: string): string | undefined {
    const currentAccount = this.getCurrentAccount();
    if (!currentAccount || !currentAccount.apps) return undefined;

    const targetAppId = appId || this.getCurrentAppId();
    if (!targetAppId) return undefined;

    return currentAccount.apps[targetAppId]?.apiKey;
  }

  // Get app name for specific app ID
  public getAppName(appId: string): string | undefined {
    const currentAccount = this.getCurrentAccount();
    if (!currentAccount || !currentAccount.apps) return undefined;

    return currentAccount.apps[appId]?.appName;
  }

  // Get path to config file
  public getConfigPath(): string {
    return this.configPath;
  }

  // Get the current account configuration
  public getCurrentAccount(): AccountConfig | undefined {
    const currentAlias = this.getCurrentAccountAlias();
    if (!currentAlias) return undefined;

    return this.config.accounts[currentAlias];
  }

  // Get the current account alias
  public getCurrentAccountAlias(): string | undefined {
    return this.config.current?.account;
  }

  // Get current app ID for the current account
  public getCurrentAppId(): string | undefined {
    const currentAccount = this.getCurrentAccount();
    if (!currentAccount) return undefined;

    return currentAccount.currentAppId;
  }

  // Get conversation context for AI help
  public getHelpContext():
    | {
        conversation: {
          messages: {
            content: string;
            role: "assistant" | "user";
          }[];
        };
      }
    | undefined {
    return this.config.helpContext;
  }

  // Get key ID for the current app or specific app ID
  public getKeyId(appId?: string): string | undefined {
    const currentAccount = this.getCurrentAccount();
    if (!currentAccount || !currentAccount.apps) return undefined;

    const targetAppId = appId || this.getCurrentAppId();
    if (!targetAppId) return undefined;

    // Get from specific metadata field or extract from API key
    const appConfig = currentAccount.apps[targetAppId];
    if (!appConfig) return undefined;

    if (appConfig.keyId) {
      return appConfig.keyId;
    }

    if (appConfig.apiKey) {
      return appConfig.apiKey.split(":")[0];
    }

    return undefined;
  }

  // Get key name for the current app or specific app ID
  public getKeyName(appId?: string): string | undefined {
    const currentAccount = this.getCurrentAccount();
    if (!currentAccount || !currentAccount.apps) return undefined;

    const targetAppId = appId || this.getCurrentAppId();
    if (!targetAppId) return undefined;

    return currentAccount.apps[targetAppId]?.keyName;
  }

  // List all accounts
  public listAccounts(): { account: AccountConfig; alias: string }[] {
    return Object.entries(this.config.accounts).map(([alias, account]) => ({
      account,
      alias,
    }));
  }

  // Remove an account
  public removeAccount(alias: string): boolean {
    if (!this.config.accounts[alias]) {
      return false;
    }

    delete this.config.accounts[alias];

    // If the removed account was the current one, clear the current account selection
    if (this.config.current?.account === alias) {
      delete this.config.current.account;
    }

    this.saveConfig();
    return true;
  }

  // Remove API key for an app
  public removeApiKey(appId: string): boolean {
    const currentAccount = this.getCurrentAccount();
    if (!currentAccount || !currentAccount.apps) return false;

    if (currentAccount.apps[appId]) {
      delete currentAccount.apps[appId].apiKey;
      this.saveConfig();
      return true;
    }

    return false;
  }

  public saveConfig(): void {
    try {
      // Format the config as TOML
      const tomlContent = this.formatToToml(this.config);

      // Write the config to disk
      fs.writeFileSync(this.configPath, tomlContent, { mode: 0o600 }); // Secure file permissions
    } catch (error) {
      throw new Error(`Failed to save Ably config: ${error}`);
    }
  }

  // Set current app for the current account
  public setCurrentApp(appId: string): void {
    const currentAccount = this.getCurrentAccount();
    const currentAlias = this.getCurrentAccountAlias();

    if (!currentAccount || !currentAlias) {
      throw new Error("No current account selected");
    }

    // Set the current app for this account
    this.config.accounts[currentAlias].currentAppId = appId;
    this.saveConfig();
  }

  // Store account information with an optional alias
  public storeAccount(
    accessToken: string,
    alias: string = "default",
    accountInfo?: {
      accountId?: string;
      accountName?: string;
      tokenId?: string;
      userEmail?: string;
    },
  ): void {
    // Create or update the account entry
    this.config.accounts[alias] = {
      accessToken,
      ...accountInfo,
      apps: this.config.accounts[alias]?.apps || {},
      currentAppId: this.config.accounts[alias]?.currentAppId,
    };

    // Set as current account if it's the first one or no current account is set
    if (!this.config.current || !this.config.current.account) {
      this.config.current = { account: alias };
    }

    this.saveConfig();
  }

  // Store app information (like name) in the config
  public storeAppInfo(
    appId: string,
    appInfo: { appName: string },
    accountAlias?: string,
  ): void {
    const alias = accountAlias || this.getCurrentAccountAlias() || "default";

    // Ensure the account and apps structure exists
    if (!this.config.accounts[alias]) {
      throw new Error(`Account "${alias}" not found`);
    }

    if (!this.config.accounts[alias].apps) {
      this.config.accounts[alias].apps = {};
    }

    // Store the app info
    this.config.accounts[alias].apps[appId] = {
      ...this.config.accounts[alias].apps[appId],
      ...appInfo,
    };

    this.saveConfig();
  }

  // Updated storeAppKey to include key metadata
  public storeAppKey(
    appId: string,
    apiKey: string,
    metadata?: {
      appName?: string;
      keyId?: string;
      keyName?: string;
    },
    accountAlias?: string,
  ): void {
    const alias = accountAlias || this.getCurrentAccountAlias() || "default";

    // Ensure the account and apps structure exists
    if (!this.config.accounts[alias]) {
      throw new Error(`Account "${alias}" not found`);
    }

    if (!this.config.accounts[alias].apps) {
      this.config.accounts[alias].apps = {};
    }

    // Store the API key and metadata
    this.config.accounts[alias].apps[appId] = {
      ...this.config.accounts[alias].apps[appId],
      apiKey,
      appName: metadata?.appName,
      keyId: metadata?.keyId || apiKey.split(":")[0], // Extract key ID if not provided
      keyName: metadata?.keyName,
    };

    this.saveConfig();
  }

  // Store conversation context for AI help
  public storeHelpContext(question: string, answer: string): void {
    if (!this.config.helpContext) {
      this.config.helpContext = {
        conversation: {
          messages: [],
        },
      };
    }

    // Add the user's question
    this.config.helpContext.conversation.messages.push(
      {
        content: question,
        role: "user",
      },
      {
        content: answer,
        role: "assistant",
      },
    );

    this.saveConfig();
  }

  // Switch to a different account
  public switchAccount(alias: string): boolean {
    if (!this.config.accounts[alias]) {
      return false;
    }

    if (!this.config.current) {
      this.config.current = {};
    }

    this.config.current.account = alias;
    this.saveConfig();
    return true;
  }

  private ensureConfigDirExists(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { mode: 0o700 }); // Secure permissions
    }
  }

  // Updated formatToToml method to include app and key metadata
  private formatToToml(config: AblyConfig): string {
    let result = "";

    // Write current section
    if (config.current) {
      result += "[current]\n";
      if (config.current.account) {
        result += `account = "${config.current.account}"\n`;
      }

      result += "\n";
    }

    // Write help context if it exists
    if (config.helpContext) {
      result += "[helpContext]\n";

      // Format the conversation as TOML array of tables
      if (config.helpContext.conversation.messages.length > 0) {
        result += "\n[[helpContext.conversation.messages]]\n";
        const { messages } = config.helpContext.conversation;

        for (const [i, message] of messages.entries()) {
          if (i > 0) result += "\n[[helpContext.conversation.messages]]\n";
          result += `role = "${message.role}"\n`;
          result += `content = """${message.content}"""\n`;
        }

        result += "\n";
      }
    }

    // Write accounts section
    for (const [alias, account] of Object.entries(config.accounts)) {
      result += `[accounts.${alias}]\n`;
      result += `accessToken = "${account.accessToken}"\n`;

      if (account.tokenId) {
        result += `tokenId = "${account.tokenId}"\n`;
      }

      if (account.userEmail) {
        result += `userEmail = "${account.userEmail}"\n`;
      }

      if (account.accountId) {
        result += `accountId = "${account.accountId}"\n`;
      }

      if (account.accountName) {
        result += `accountName = "${account.accountName}"\n`;
      }

      if (account.currentAppId) {
        result += `currentAppId = "${account.currentAppId}"\n`;
      }

      // Write apps section for this account
      if (account.apps && Object.keys(account.apps).length > 0) {
        for (const [appId, appConfig] of Object.entries(account.apps)) {
          result += `[accounts.${alias}.apps.${appId}]\n`;

          if (appConfig.apiKey) {
            result += `apiKey = "${appConfig.apiKey}"\n`;
          }

          if (appConfig.keyId) {
            result += `keyId = "${appConfig.keyId}"\n`;
          }

          if (appConfig.keyName) {
            result += `keyName = "${appConfig.keyName}"\n`;
          }

          if (appConfig.appName) {
            result += `appName = "${appConfig.appName}"\n`;
          }

          result += "\n";
        }
      } else {
        result += "\n";
      }
    }

    return result;
  }

  private loadConfig(): void {
    if (fs.existsSync(this.configPath)) {
      try {
        const configContent = fs.readFileSync(this.configPath, "utf8");
        this.config = toml.parse(configContent) as AblyConfig;

        // Ensure config has the expected structure
        if (!this.config.accounts) {
          this.config.accounts = {};
        }

        // Migrate old config format if needed - move app from current to account.currentAppId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oldConfig = this.config as any; // Use 'any' to safely access potential pre-migration properties
        if (oldConfig.current?.app) {
          const currentAccountAlias = this.config.current?.account;
          if (
            currentAccountAlias &&
            this.config.accounts[currentAccountAlias]
          ) {
            this.config.accounts[currentAccountAlias].currentAppId =
              oldConfig.current.app;
            delete oldConfig.current.app; // Remove from current section
            this.saveConfig(); // Save the migrated config
          }
        }
      } catch (error) {
        throw new Error(`Failed to load Ably config: ${error}`);
      }
    }
  }
}
