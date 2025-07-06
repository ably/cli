import { Flags } from "@oclif/core";
import { InteractiveBaseCommand } from "./interactive-base-command.js";
import * as Ably from "ably";
import chalk from "chalk";
import colorJson from "color-json";
import { randomUUID } from "node:crypto";

import { ConfigManager } from "./services/config-manager.js";
import { ControlApi } from "./services/control-api.js";
import { InteractiveHelper } from "./services/interactive-helper.js";
import { BaseFlags, CommandConfig, ErrorDetails } from "./types/cli.js";
import { getCliVersion } from "./utils/version.js";

// Export BaseFlags for potential use in other modules like MCP

// List of commands not allowed in web CLI mode - EXPORTED
export const WEB_CLI_RESTRICTED_COMMANDS = [
  // All account login/management commands are not valid in a web env where auth is handled by the website
  // note accounts:stats is supported
  "accounts:current",
  "accounts:list",
  "accounts:login",
  "accounts:logout",
  "accounts:switch",

  // You cannot switch/delete/create apps, you can only work with the current app you have selected in the web UI   
  "apps:create",
  "apps:switch",
  "apps:delete",

  // The key you use for auth is controlled from the web UI
  "auth:keys:switch",

  // config only applicable to local env
  "config*",
  
  // MCP functionality is not available in the web CLI
  "mcp*",
];

/* Additional restricted commands when running in anonymous web CLI mode */
export const WEB_CLI_ANONYMOUS_RESTRICTED_COMMANDS = [
  "accounts*", // all account commands cannot be run, don't expose account info
  "apps*", // all app commands cannot be run, don't expose app info

  "auth:keys*", // disallow all key commands
  "auth:revoke-token", // token revocation not support when anonymous
  
  "bench*", // all bench commands cannot be run in anonymous mode
  
  // All enumeration and logging commands are disallowed as this could expose other anonymous user behaviour
  "channels:list", 
  "channels:logs", 
  "connections:logs", 
  "rooms:list", 
  "spaces:list", 
  "logs*",

  // Integrations and queues are not available to anonymous users
  "integrations*",     
  "queues*",
];

/* Commands not suitable for interactive mode */
export const INTERACTIVE_UNSUITABLE_COMMANDS = [
  "autocomplete", // Autocomplete setup is not needed in interactive mode
  "config", // Config editing is not suitable for interactive mode
  "version", // Version is shown at startup and available via --version
  "mcp", // MCP server functionality is not suitable for interactive mode
];

// List of commands that should not show account/app info
const SKIP_AUTH_INFO_COMMANDS = [
  "accounts:list",
  "accounts:switch",
  "accounts:login",
  "accounts:current",
  "apps:current",
  "auth:keys:current",
  "config",
  "status",
  "support:contact",
  "support:info",
  "support:ask",
];

export abstract class AblyBaseCommand extends InteractiveBaseCommand {
  protected _authInfoShown = false;
  
  // Add static flags that will be available to all commands
  static globalFlags = {
    "access-token": Flags.string({
      description:
        "Overrides any configured access token used for the Control API",
    }),
    "api-key": Flags.string({
      description: "Overrides any configured API key used for the product APIs",
    }),
    "client-id": Flags.string({
      description:
        'Overrides any default client ID when using API authentication. Use "none" to explicitly set no client ID. Not applicable when using token authentication.',
    }),
    "control-host": Flags.string({
      description:
        "Override the host endpoint for the control API, which defaults to control.ably.net",
      hidden: process.env.ABLY_SHOW_DEV_FLAGS !== 'true',
    }),
    env: Flags.string({
      description: "Override the environment for all product API calls",
    }),
    host: Flags.string({
      description: "Override the host endpoint for all product API calls",
    }),
    port: Flags.integer({
      description: "Override the port for product API calls",
      hidden: process.env.ABLY_SHOW_DEV_FLAGS !== 'true',
    }),
    tlsPort: Flags.integer({
      description: "Override the TLS port for product API calls",
      hidden: process.env.ABLY_SHOW_DEV_FLAGS !== 'true',
    }),
    tls: Flags.string({
      description: "Use TLS for product API calls (default is true)",
      hidden: process.env.ABLY_SHOW_DEV_FLAGS !== 'true',
    }),
    json: Flags.boolean({
      description: "Output in JSON format",
      exclusive: ["pretty-json"], // Cannot use with pretty-json
    }),
    "pretty-json": Flags.boolean({
      description: "Output in colorized JSON format",
      exclusive: ["json"], // Cannot use with json
    }),
    token: Flags.string({
      description:
        "Authenticate using an Ably Token or JWT Token instead of an API key",
    }),
    verbose: Flags.boolean({
      char: "v",
      default: false,
      description: "Output verbose logs",
      required: false,
    }),
    // Web CLI specific flag, hidden from regular help
    "web-cli-help": Flags.boolean({
      description: "Show help formatted for the web CLI",
      hidden: true, // Hide from regular help output
    }),
  };

  protected configManager: ConfigManager;
  protected interactiveHelper: InteractiveHelper;

  protected isWebCliMode: boolean;

  constructor(argv: string[], config: CommandConfig) {
    super(argv, config);
    this.configManager = new ConfigManager();
    this.interactiveHelper = new InteractiveHelper(this.configManager);
    // Check if we're running in web CLI mode
    this.isWebCliMode = process.env.ABLY_WEB_CLI_MODE === "true";
  }

  /**
   * Check if we're running in test mode
   * @returns true if running in test mode
   */
  protected isTestMode(): boolean {
    return process.env.ABLY_CLI_TEST_MODE === "true";
  }

  protected isAnonymousWebMode(): boolean {
    // In web CLI mode, the server sets ABLY_ANONYMOUS_USER_MODE when no access token is available
    return this.isWebCliMode && process.env.ABLY_ANONYMOUS_USER_MODE === 'true';
  }

  /**
   * Check if command matches a pattern (supports wildcards)
   */
  protected matchesCommandPattern(commandId: string, pattern: string): boolean {
    // Handle wildcard patterns
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return commandId === prefix || commandId.startsWith(prefix);
    }
    
    // Handle exact matches
    return commandId === pattern;
  }

  /**
   * Check if command is restricted in anonymous web CLI mode
   */
  protected isRestrictedInAnonymousMode(commandId: string): boolean {
    return WEB_CLI_ANONYMOUS_RESTRICTED_COMMANDS.some(pattern => 
      this.matchesCommandPattern(commandId, pattern)
    );
  }

  /**
   * Check if terminal updates (like carriage returns and line clearing) should be used.
   * Returns true only when:
   * - Output is to a TTY (interactive terminal)
   * - Not in test mode
   * - Not in CI environment
   */
  protected shouldUseTerminalUpdates(): boolean {
    return process.stdout.isTTY && !this.isTestMode() && !process.env.CI;
  }

  /**
   * Get test mocks if in test mode
   * @returns Test mocks object or undefined if not in test mode
   */
  protected getMockAblyRest(): Ably.Rest | undefined {
    if (!this.isTestMode()) return undefined;

    // Access global mock if running in test mode
    return (globalThis as { __TEST_MOCKS__?: { ablyRestMock: Ably.Rest } }).__TEST_MOCKS__?.ablyRestMock;
  }


  /**
   * Check if this is a web CLI version and return a consistent error message
   * for commands that are not allowed in web CLI mode
   */
  protected checkWebCliRestrictions(): void {
    if (!this.isWebCliMode) {
      return; // Not in web CLI mode, no restrictions
    }

    const commandId = this.id || "";
    const commandIdForDisplay = commandId.replaceAll(":", " ");

    // Check if we're in anonymous mode
    if (this.isAnonymousWebMode()) {
      // Anonymous web CLI mode - check both base and anonymous restrictions
      let errorMessage: string | null = null;

      // First check if command is in the anonymous restricted list
      if (this.isRestrictedInAnonymousMode(commandId)) {
        // Provide specific messages for different command types
        if (commandId.startsWith("accounts")) {
          errorMessage = `Account management commands are only available when logged in. Please log in at https://ably.com/login.`;
        } else if (commandId.startsWith("apps")) {
          errorMessage = `App management commands are only available when logged in. Please log in at https://ably.com/login.`;
        } else if (commandId.startsWith("auth:keys")) {
          errorMessage = `API key management requires you to be logged in. Please log in at https://ably.com/login.`;
        } else if (commandId === "auth:revoke-token") {
          errorMessage = `Token revocation requires you to be logged in. Please log in at https://ably.com/login.`;
        } else if (commandId.startsWith("bench")) {
          errorMessage = `Benchmarking commands are only available when logged in. Please log in at https://ably.com/login.`;
        } else if (commandId === "channels:list" || commandId === "rooms:list" || commandId === "spaces:list" || 
                   commandId.includes("logs")) {
          errorMessage = `This command is not available in anonymous mode for privacy reasons. Please log in at https://ably.com/login.`;
        } else if (commandId.startsWith("integrations")) {
          errorMessage = `Integration management requires you to be logged in. Please log in at https://ably.com/login.`;
        } else if (commandId.startsWith("queues")) {
          errorMessage = `Queue management requires you to be logged in. Please log in at https://ably.com/login.`;
        } else {
          errorMessage = `This command is not available in anonymous mode. Please log in at https://ably.com/login.`;
        }
      }
      // Then check if command is in the base restricted list
      else if (!this.isAllowedInWebCliMode()) {
        // Provide specific messages for always-restricted commands
        if (commandId.includes("accounts login")) {
          errorMessage = `Please log in at https://ably.com/login to use authentication features.`;
        } else if (commandId.startsWith("config")) {
          errorMessage = `Local configuration is not supported in the web CLI. Please install the CLI locally.`;
        } else if (commandId.startsWith("mcp")) {
          errorMessage = `MCP server functionality is not available in the web CLI. Please install the CLI locally.`;
        } else {
          errorMessage = `This command is not available in the web CLI. Please install the CLI locally.`;
        }
      }

      if (errorMessage) {
        this.error(chalk.red(errorMessage));
      }
    } else {
      // Authenticated web CLI mode - only base restrictions apply
      if (!this.isAllowedInWebCliMode()) {
        let errorMessage = `This command is not available in the web CLI.`;

        // Provide specific messages for authenticated users
        if (commandIdForDisplay.includes("accounts login")) {
          errorMessage = `You are already logged in via the web CLI. This command is not available in the web CLI.`;
        } else if (commandIdForDisplay.includes("accounts list")) {
          errorMessage = `This feature is not available in the web CLI. Please use the web dashboard at https://ably.com/accounts/ instead.`;
        } else if (commandIdForDisplay.includes("accounts logout")) {
          errorMessage = `You cannot log out via the web CLI.`;
        } else if (commandIdForDisplay.includes("accounts switch")) {
          errorMessage = `You cannot change accounts in the web CLI. Please use the dashboard at https://ably.com/accounts/ to switch accounts.`;
        } else if (commandIdForDisplay.includes("apps switch")) {
          errorMessage = `You cannot switch apps from within the web CLI. Please use the web dashboard at https://ably.com/dashboard instead.`;
        } else if (commandIdForDisplay.includes("auth keys switch")) {
          errorMessage = `You cannot switch API keys from within the web CLI. Please use the web interface to change keys.`;
        } else if (commandId.startsWith("config")) {
          errorMessage = `Local configuration is not supported in the web CLI version.`;
        } else if (commandId.startsWith("mcp")) {
          errorMessage = `MCP server functionality is not available in the web CLI. Please use the standalone CLI installation instead.`;
        }

        this.error(chalk.red(errorMessage));
      }
    }
  }

  /**
   * Create an Ably REST client with automatic auth info display
   */
  protected async createAblyRestClient(
    flags: BaseFlags,
    options?: {
      skipAuthInfo?: boolean;
    }
  ): Promise<Ably.Rest | null> {
    const client = await this.createAblyClientInternal(flags, {
      type: 'rest',
      skipAuthInfo: options?.skipAuthInfo,
    });
    return client as Ably.Rest | null;
  }

  /**
   * Create an Ably Realtime client with automatic auth info display
   */
  protected async createAblyRealtimeClient(
    flags: BaseFlags,
    options?: {
      skipAuthInfo?: boolean;
    }
  ): Promise<Ably.Realtime | null> {
    const client = await this.createAblyClientInternal(flags, {
      type: 'realtime',
      skipAuthInfo: options?.skipAuthInfo,
    });
    return client as Ably.Realtime | null;
  }

  /**
   * @deprecated Use createAblyRestClient or createAblyRealtimeClient instead
   */
  protected async createAblyClient(
    flags: BaseFlags,
    options?: {
      type?: 'rest' | 'realtime';
      skipAuthInfo?: boolean;
    }
  ): Promise<Ably.Rest | Ably.Realtime | null> {
    return this.createAblyClientInternal(flags, options);
  }

  /**
   * Internal method that creates either REST or Realtime client
   * Shared functionality for both client types
   */
  private async createAblyClientInternal(
    flags: BaseFlags,
    options?: {
      type?: 'rest' | 'realtime';
      skipAuthInfo?: boolean;
    }
  ): Promise<Ably.Rest | Ably.Realtime | null> {
    const clientType = options?.type || 'realtime';
    
    // If in test mode, skip connection and use mock
    if (this.isTestMode()) {
      this.debug(`Running in test mode, using mock Ably ${clientType} client`);
      const mockAblyRest = this.getMockAblyRest();

      if (mockAblyRest) {
        // Return mock as appropriate type
        return mockAblyRest as unknown as Ably.Rest | Ably.Realtime;
      }

      this.error(`No mock Ably ${clientType} client available in test mode`);
      return null;
    }

    // If token is provided or API key is in environment, we can skip the ensureAppAndKey step
    if (!flags.token && !flags["api-key"] && !process.env.ABLY_API_KEY) {
      const appAndKey = await this.ensureAppAndKey(flags);
      if (!appAndKey) {
        this.error(
          `${chalk.yellow("No app or API key configured for this command")}.\nPlease log in first with "${chalk.cyan("ably accounts login")}" (recommended approach).\nAlternatively you can provide an API key with the ${chalk.cyan("--api-key")} argument or set the ${chalk.cyan("ABLY_API_KEY")} environment variable.`,
        );
        return null;
      }

      flags["api-key"] = appAndKey.apiKey;
    }

    // Show auth info at the start of the command (but not in Web CLI mode and not if skipped)
    if (!this.isWebCliMode && !options?.skipAuthInfo) {
      this.showAuthInfoIfNeeded(flags);
    }

    const clientOptions = this.getClientOptions(flags);
    // isJsonMode is defined outside the try block for use in error handling
    const isJsonMode = this.shouldOutputJson(flags);

    // Make sure we have authentication after potentially modifying options
    if (!clientOptions.key && !clientOptions.token) {
      this.error(
        "Authentication required. Please provide either an API key, a token, or log in first.",
      );
      return null;
    }

    try {
      // Create REST client
      if (clientType === 'rest') {
        return new Ably.Rest(clientOptions);
      }
      
      // Create Realtime client
      const client = new Ably.Realtime(clientOptions);

      // Wait for the connection to be established or fail
      return await new Promise((resolve, reject) => {
        // Add timeout for connection attempt (especially important for E2E tests with fake credentials)
        const connectionTimeout = setTimeout(() => {
          client.connection.off(); // Remove event listeners
          const timeoutError = new Error("Connection timeout after 3 seconds");
          if (isJsonMode) {
            this.outputJsonError("Connection timeout", { code: 80003 }); // Custom timeout error code
          }
          reject(timeoutError);
        }, 3000); // 3 second timeout

        client.connection.once("connected", () => {
          clearTimeout(connectionTimeout);
          // Use logCliEvent for connection success if verbose
          this.logCliEvent(
            flags,
            "RealtimeClient",
            "connection",
            "Successfully connected to Ably Realtime.",
          );
          resolve(client);
        });

        client.connection.once("failed", (stateChange) => {
          clearTimeout(connectionTimeout);
          // Handle authentication errors specifically
          if (stateChange.reason && stateChange.reason.code === 40_100) {
            // Unauthorized
            if (clientOptions.key) {
              // Check the original options object
              this.handleInvalidKey(flags);
              const errorMsg =
                "Invalid API key. Ensure you have a valid key configured.";
              if (isJsonMode) {
                this.outputJsonError(
                  errorMsg,
                  stateChange.reason as ErrorDetails,
                );
              }

              reject(new Error(errorMsg));
            } else {
              const errorMsg =
                "Invalid token. Please provide a valid Ably Token or JWT.";
              if (isJsonMode) {
                this.outputJsonError(
                  errorMsg,
                  stateChange.reason as ErrorDetails,
                );
              }

              reject(new Error(errorMsg));
            }
          } else {
            const errorMsg = stateChange.reason?.message || "Connection failed";
            if (isJsonMode) {
              this.outputJsonError(
                errorMsg,
                stateChange.reason as ErrorDetails,
              );
            }

            reject(stateChange.reason || new Error(errorMsg));
          }
        });
      });
    } catch (error: unknown) {
      // Handle any synchronous errors when creating the client
      const err = error as { code?: number } & Error; // Type assertion
      if (
        (err.code === 40_100 || err.message?.includes("invalid key")) && // Unauthorized or invalid key format
        flags["api-key"]
      ) {
        // Provided key is invalid - reset it
        await this.handleInvalidKey(flags);
      }

      // Re-throw the error
      throw error;
    }
  }

  /**
   * Display the current account, app, and authentication information
   * This provides context to the user about which resources they're working with
   *
   * @param flags Command flags that may contain auth overrides
   * @param showAppInfo Whether to show app info (for data plane commands)
   */
  protected displayAuthInfo(
    flags: BaseFlags,
    showAppInfo: boolean = true,
  ): void {
    // Get account info
    const currentAccount = this.configManager.getCurrentAccount();
    const accountName =
      currentAccount?.accountName ||
      this.configManager.getCurrentAccountAlias() ||
      "Unknown Account";
    const accountId = currentAccount?.accountId || "";

    // Start building the display string
    const displayParts: string[] = [];

    // Only add account info if it shouldn't be hidden
    if (!this.shouldHideAccountInfo(flags)) {
      displayParts.push(
        `${chalk.cyan("Account=")}${chalk.cyan.bold(accountName)}${accountId ? chalk.gray(` (${accountId})`) : ""}`,
      );
    }

    // For data plane commands, show app and auth info
    if (showAppInfo) {
      // Get app info
      const appId = flags.app || this.configManager.getCurrentAppId();
      if (appId) {
        const appName = this.configManager.getAppName(appId) || "Unknown App";
        displayParts.push(
          `${chalk.green("App=")}${chalk.green.bold(appName)} ${chalk.gray(`(${appId})`)}`,
        );

        // Check auth method - token or API key
        if (flags.token) {
          // For token auth, show truncated token
          const truncatedToken =
            flags.token.length > 20
              ? `${flags.token.slice(0, 17)}...`
              : flags.token;
          displayParts.push(
            `${chalk.magenta("Auth=")}${chalk.magenta.bold("Token")} ${chalk.gray(`(${truncatedToken})`)}`,
          );
        } else {
          // For API key auth
          const apiKey =
            flags["api-key"] || this.configManager.getApiKey(appId);
          if (apiKey) {
            const keyId = apiKey.split(":")[0]; // Extract key ID (part before colon)
            const keyName =
              this.configManager.getKeyName(appId) || "Default Key";
            // Format the full key name (app_id.key_id)
            const formattedKeyName = keyId.includes(".")
              ? keyId
              : `${appId}.${keyId}`;
            displayParts.push(
              `${chalk.yellow("Key=")}${chalk.yellow.bold(keyName)} ${chalk.gray(`(${formattedKeyName})`)}`,
            );
          }
        }
      }
    }

    // Only display if we have parts to show
    if (displayParts.length > 0) {
      // Display the info on a single line with separator bullets
      this.log(
        `${chalk.dim("Using:")} ${displayParts.join(` ${chalk.dim("•")} `)}`,
      );
      this.log(""); // Add blank line for readability
    }
  }

  /**
   * Display information for control plane commands
   * Shows only account information
   */
  protected displayControlPlaneInfo(flags: BaseFlags): void {
    if (
      !flags.quiet &&
      !this.shouldOutputJson(flags) &&
      !this.shouldSuppressOutput(flags)
    ) {
      this.displayAuthInfo(flags, false);
    }
  }

  /**
   * Display information for data plane (product API) commands
   * Shows account, app, and authentication information
   */
  protected displayDataPlaneInfo(flags: BaseFlags): void {
    if (
      !flags.quiet &&
      !this.shouldOutputJson(flags) &&
      !this.shouldSuppressOutput(flags)
    ) {
      this.displayAuthInfo(flags, true);
    }
  }

  protected async ensureAppAndKey(
    flags: BaseFlags,
  ): Promise<{ apiKey: string; appId: string } | null> {
    // If in web CLI mode, use environment variables directly
    if (this.isWebCliMode) {
      // Extract app ID from ABLY_API_KEY environment variable
      const apiKey = process.env.ABLY_API_KEY || "";
      if (!apiKey) {
        this.log("ABLY_API_KEY environment variable is not set");
        return null;
      }

      // Debug log the API key format (masking the secret part)
      const keyParts = apiKey.split(":");
      const maskedKey = keyParts.length > 1 ? `${keyParts[0]}:***` : apiKey;
      this.debug(`Using API key format: ${maskedKey}`);

      // The app ID is the part before the first period in the key
      const appId = apiKey.split(".")[0] || "";
      if (!appId) {
        this.log("Failed to extract app ID from API key");
        return null;
      }

      this.debug(`Extracted app ID: ${appId}`);
      return { apiKey, appId };
    }

    // If token auth is being used, we don't need an API key
    if (flags.token) {
      // For token auth, we still need an app ID for some operations
      const appId = flags.app || this.configManager.getCurrentAppId();
      if (appId) {
        return { apiKey: "", appId };
      }
      // If no app ID is provided, we'll try to extract it from the token if it's a JWT
      // But for now, just return null and let the operation proceed with token auth only
    }

    // Check if we have an app and key from flags or config
    let appId = flags.app || this.configManager.getCurrentAppId();
    let apiKey = flags["api-key"] || this.configManager.getApiKey(appId);

    // If we have both, return them
    if (appId && apiKey) {
      return { apiKey, appId };
    }

    // Get access token for control API
    const accessToken =
      process.env.ABLY_ACCESS_TOKEN ||
      flags["access-token"] ||
      this.configManager.getAccessToken();
    if (!accessToken) {
      return null;
    }

    const controlApi = new ControlApi({
      accessToken,
      controlHost: flags["control-host"],
    });

    // If no app is selected, prompt to select one
    if (!appId) {
      if (!this.shouldSuppressOutput(flags)) {
        this.log("Select an app to use for this command:");
      }

      const selectedApp = await this.interactiveHelper.selectApp(controlApi);

      if (!selectedApp) return null;

      appId = selectedApp.id;
      this.configManager.setCurrentApp(appId);
      // Store app name along with app ID
      this.configManager.storeAppInfo(appId, { appName: selectedApp.name });
      if (!this.shouldSuppressOutput(flags)) {
        this.log(`  Selected app: ${selectedApp.name} (${appId})\n`);
      }
    }

    // If no key is selected, prompt to select one
    if (!apiKey) {
      if (!this.shouldSuppressOutput(flags)) {
        this.log("Select an API key to use for this command:");
      }

      const selectedKey = await this.interactiveHelper.selectKey(
        controlApi,
        appId,
      );

      if (!selectedKey) return null;

      apiKey = selectedKey.key;
      // Store key with metadata including key name and ID
      this.configManager.storeAppKey(appId, apiKey, {
        keyId: selectedKey.id,
        keyName: selectedKey.name || "Unnamed key",
      });
      if (!this.shouldSuppressOutput(flags)) {
        this.log(
          `  Selected key: ${selectedKey.name || "Unnamed key"} (${selectedKey.id})\n`,
        );
      }
    }

    return { apiKey, appId };
  }

  /**
   * This hook runs before command execution
   * It's the oclif standard hook that runs before the run() method
   */
  async finally(err: Error | undefined): Promise<void> {
    // Call super to maintain the parent class functionality
    await super.finally(err);
  }

  protected formatJsonOutput(
    data: Record<string, unknown>,
    flags: BaseFlags,
  ): string {
    if (this.isPrettyJsonOutput(flags)) {
      try {
        return colorJson(data);
      } catch (error) {
        // Fallback to regular JSON.stringify
        this.debug(
          `Error using color-json: ${error instanceof Error ? error.message : String(error)}. Falling back to regular JSON.`,
        );
        return JSON.stringify(data, null, 2);
      }
    }

    // Regular JSON output
    return JSON.stringify(data, null, 2);
  }

  protected getClientOptions(flags: BaseFlags): Ably.ClientOptions {
    const options: Ably.ClientOptions = {};
    const isJsonMode = this.shouldOutputJson(flags);

    // Handle authentication - try token first, then api-key, then environment variable, then config
    if (flags.token) {
      options.token = flags.token;

      // When using token auth, we don't set the clientId as it may conflict
      // with any clientId embedded in the token
      if (flags["client-id"] && !this.shouldSuppressOutput(flags)) {
        this.log(
          chalk.yellow(
            "Warning: clientId is ignored when using token authentication as the clientId is embedded in the token",
          ),
        );
      }
    } else if (flags["api-key"]) {
      options.key = flags["api-key"];

      // In web CLI mode, validate the API key format
      if (this.isWebCliMode) {
        const parsedKey = this.parseApiKey(flags["api-key"]);
        if (parsedKey) {
          this.debug(
            `Using API key with appId=${parsedKey.appId}, keyId=${parsedKey.keyId}`,
          );
          // In web CLI mode, we need to explicitly configure the client for Ably.js browser library
          options.key = flags["api-key"];
        } else {
          this.log(
            chalk.yellow(
              `Warning: API key format appears to be invalid. Expected format: APP_ID.KEY_ID:KEY_SECRET`,
            ),
          );
        }
      }

      // Handle client ID for API key auth
      this.setClientId(options, flags);
    } else if (process.env.ABLY_API_KEY) {
      const apiKey = process.env.ABLY_API_KEY;
      options.key = apiKey;

      // In web CLI mode, validate the API key format
      if (this.isWebCliMode) {
        const parsedKey = this.parseApiKey(apiKey);
        if (parsedKey) {
          this.debug(
            `Using API key with appId=${parsedKey.appId}, keyId=${parsedKey.keyId}`,
          );

          // Ensure API key is properly formatted for Node.js SDK
          options.key = apiKey;
        } else {
          this.log(
            chalk.yellow(
              `Warning: API key format appears to be invalid. Expected format: APP_ID.KEY_ID:KEY_SECRET`,
            ),
          );
        }
      }

      // Handle client ID for API key auth
      this.setClientId(options, flags);
    } else {
      const apiKey = this.configManager.getApiKey();
      if (apiKey) {
        options.key = apiKey;

        // Handle client ID for API key auth
        this.setClientId(options, flags);
      }
    }

    // Handle host and environment options
    if (flags.host) {
      options.realtimeHost = flags.host;
      options.restHost = flags.host;
    }

    if (flags.env) {
      options.environment = flags.env;
    }

    if (flags.port) {
      options.port = flags.port;
    }

    if (flags.tlsPort) {
      options.tlsPort = flags.tlsPort;
    }

    if (flags.tls) {
      options.tls = flags.tls === "true";
    }

    // Always add a log handler to control SDK output formatting and destination
    options.logHandler = (message: string, level: number) => {
      if (isJsonMode) {
        // JSON Mode Handling
        if (flags.verbose && level <= 2) {
          // Verbose JSON: Log ALL SDK messages via logCliEvent
          const logData = { sdkLogLevel: level, sdkMessage: message };
          this.logCliEvent(
            flags,
            "AblySDK",
            `LogLevel-${level}`,
            message,
            logData,
          );
        } else if (level <= 1) {
          // Standard JSON: Log only SDK ERRORS (level <= 1) to stderr as JSON
          const errorData = {
            level,
            logType: "sdkError",
            message,
            timestamp: new Date().toISOString(),
          };
          // Log directly using console.error for SDK operational errors
          console.error(this.formatJsonOutput(errorData, flags));
        }
        // If not verbose JSON and level > 1, suppress non-error SDK logs
      } else {
        // Non-JSON Mode Handling
        if (flags.verbose && level <= 2) {
          // Verbose Non-JSON: Log ALL SDK messages via logCliEvent (human-readable)
          const logData = { sdkLogLevel: level, sdkMessage: message };
          // logCliEvent handles non-JSON formatting when verbose is true
          this.logCliEvent(
            flags,
            "AblySDK",
            `LogLevel-${level}`,
            message,
            logData,
          );
        } else if (level <= 1) {
          // Standard Non-JSON: Log only SDK ERRORS (level <= 1) clearly
          // Use a format similar to logCliEvent's non-JSON output
          this.log(`${chalk.red.bold(`[AblySDK Error]`)} ${message}`);
        }
        // If not verbose non-JSON and level > 1, suppress non-error SDK logs
      }
    };

    // Set logLevel to highest ONLY when using custom handler to capture everything needed by it
    options.logLevel = 4;

    // Add agent header to identify requests from the CLI
    (options as Ably.ClientOptions & { agents: Record<string, string> }).agents = { 'ably-cli': getCliVersion() };

    return options;
  }

  // Initialize command and check restrictions
  async init() {
    await super.init();

    // Set current command for interrupt feedback
    if (this.id) {
      // Convert command ID to readable format (e.g., "channels:subscribe" stays as is)
      process.env.ABLY_CURRENT_COMMAND = this.id;
    }

    // Check if command is allowed to run in web CLI mode
    this.checkWebCliRestrictions();
  }

  /**
   * Checks if a command is allowed to run in web CLI mode
   * This should be called by commands that are restricted in web CLI mode
   *
   * @returns True if command can run, false if it's restricted
   */
  protected isAllowedInWebCliMode(command?: string): boolean {
    if (!this.isWebCliMode) {
      return true; // Not in web CLI mode, allow all commands
    }

    // Use the current command ID if none provided
    const commandId = command || this.id || "";

    // Check if the command matches any restricted pattern
    return !WEB_CLI_RESTRICTED_COMMANDS.some(pattern => 
      this.matchesCommandPattern(commandId, pattern)
    );
  }

  protected isPrettyJsonOutput(flags: BaseFlags): boolean {
    return flags["pretty-json"] === true;
  }

  /**
   * Logs a CLI event.
   * If --verbose is enabled:
   *   - If --json or --pretty-json is also enabled, outputs the event as structured JSON.
   *   - Otherwise (normal mode), outputs the human-readable message prefixed with the component.
   * Does nothing if --verbose is not enabled.
   */
  protected logCliEvent(
    flags: BaseFlags,
    component: string,
    event: string,
    message: string,
    data: Record<string, unknown> = {},
  ): void {
    // Only log if verbose mode is enabled
    if (!flags.verbose) {
      return;
    }

    const isJsonMode = this.shouldOutputJson(flags);

    if (isJsonMode) {
      // Output structured JSON log
      const logEntry = {
        component,
        data,
        event,
        logType: "cliEvent",
        message,
        timestamp: new Date().toISOString(),
      };
      // Use the existing formatting method for consistency (handles pretty/plain JSON)
      this.log(this.formatJsonOutput(logEntry, flags));
    } else {
      // Output human-readable log in normal (verbose) mode
      this.log(`${chalk.dim(`[${component}]`)} ${message}`);
    }
  }

  /** Helper to output errors in JSON format */
  protected outputJsonError(
    message: string,
    errorDetails: ErrorDetails = {},
  ): void {
    const errorOutput = {
      details: errorDetails,
      error: true,
      message,
    };
    // Use console.error to send JSON errors to stderr
    console.error(JSON.stringify(errorOutput));
  }

  /**
   * Helper method to parse and validate an API key
   * Returns null if invalid, or the parsed components if valid
   */
  protected parseApiKey(
    apiKey: string,
  ): { appId: string; keyId: string; keySecret: string } | null {
    if (!apiKey) return null;

    // API key format should be APP_ID.KEY_ID:KEY_SECRET
    const parts = apiKey.split(":");
    if (parts.length !== 2) {
      this.debug(`Invalid API key format: missing colon separator`);
      return null;
    }

    const keyParts = parts[0].split(".");
    if (keyParts.length !== 2) {
      this.debug(`Invalid API key format: missing period separator in key`);
      return null;
    }

    const appId = keyParts[0];
    const keyId = keyParts[1];
    const keySecret = parts[1];

    if (!appId || !keyId || !keySecret) {
      this.debug(`Invalid API key format: missing required parts`);
      return null;
    }

    return { appId, keyId, keySecret };
  }

  protected shouldOutputJson(flags: BaseFlags): boolean {
    return (
      flags.json === true ||
      flags["pretty-json"] === true ||
      flags.format === "json"
    );
  }

  /**
   * Determine if this command should show account/app info
   * Based on a centralized list of exceptions
   */
  protected shouldShowAuthInfo(): boolean {
    // Convert command ID to normalized format for comparison
    const commandId = (this.id || "").replaceAll(" ", ":").toLowerCase();

    // Check if command is in the exceptions list
    for (const skipCmd of SKIP_AUTH_INFO_COMMANDS) {
      // Check exact match
      if (commandId === skipCmd) {
        return false;
      }

      // Check if this is a subcommand of a skip command
      if (commandId.startsWith(skipCmd + ":")) {
        return false;
      }

      // Check if command ID path includes the skip command
      // This covers case when command ID is space-separated
      const spacedCommandId = this.id?.toLowerCase() || "";
      const spacedSkipCmd = skipCmd.replaceAll(":", " ").toLowerCase();

      if (
        spacedCommandId === spacedSkipCmd ||
        spacedCommandId.startsWith(spacedSkipCmd + " ")
      ) {
        return false;
      }
    }

    return true;
  }

  // Add this method to check if we should suppress output
  protected shouldSuppressOutput(flags: BaseFlags): boolean {
    return flags["token-only"] === true;
  }

  /**
   * Display auth info at the beginning of command execution
   * This should be called at the start of run() in command implementations
   */
  protected showAuthInfoIfNeeded(flags: BaseFlags = {}): void {
    // Skip if already shown
    if (this._authInfoShown) {
      this.debug(`Auth info already shown for command: ${this.id}`);
      return;
    }
    
    // Skip auth info if specified in the exceptions list
    if (!this.shouldShowAuthInfo()) {
      this.debug(`Skipping auth info display for command: ${this.id}`);
      return;
    }

    // Skip auth info if output is suppressed
    const shouldSuppress =
      flags.quiet ||
      this.shouldOutputJson(flags) ||
      flags["token-only"] ||
      this.shouldSuppressOutput(flags);
    if (shouldSuppress) {
      return;
    }

    // Skip auth info display in Web CLI mode
    if (this.isWebCliMode) {
      this.debug(`Skipping auth info display in Web CLI mode: ${this.id}`);
      return;
    }

    // Determine command type and show appropriate info
    if (
      this.id?.startsWith("apps") ||
      this.id?.startsWith("channels") ||
      this.id?.startsWith("auth") ||
      this.id?.startsWith("rooms") ||
      this.id?.startsWith("spaces") ||
      this.id?.startsWith("logs") ||
      this.id?.startsWith("connections") ||
      this.id?.startsWith("queues") ||
      this.id?.startsWith("bench")
    ) {
      // Data plane commands (product API)
      this.displayDataPlaneInfo(flags);
      this._authInfoShown = true;
    } else if (
      this.id?.startsWith("accounts") ||
      this.id?.startsWith("integrations")
    ) {
      // Control plane commands
      this.displayControlPlaneInfo(flags);
      this._authInfoShown = true;
    }
  }

  private async handleInvalidKey(flags: BaseFlags): Promise<void> {
    const appId = flags.app || this.configManager.getCurrentAppId();

    if (appId) {
      this.log("The configured API key appears to be invalid or revoked.");

      const shouldRemove = await this.interactiveHelper.confirm(
        "Would you like to remove this invalid key from your configuration?",
      );

      if (shouldRemove) {
        this.configManager.removeApiKey(appId);
        this.log("Invalid key removed from configuration.");
      }
    }
  }

  private setClientId(options: Ably.ClientOptions, flags: BaseFlags): void {
    if (flags["client-id"]) {
      // Special case: "none" means explicitly no client ID
      if (flags["client-id"].toLowerCase() === "none") {
        // Don't set clientId at all
      } else {
        options.clientId = flags["client-id"];
      }
    } else {
      // Generate a default client ID for the CLI
      options.clientId = `ably-cli-${randomUUID().slice(0, 8)}`;
    }
  }

  /**
   * Centralized handler for cleaning up resources like Ably connections
   * Includes a timeout to prevent hanging if cleanup takes too long
   * @param cleanupFunction The async function to perform cleanup
   * @param timeoutMs Timeout duration in milliseconds (default 5000)
   */
  protected setupCleanupHandler(
    cleanupFunction: () => Promise<void>,
    timeoutMs = 5_000,
  ): Promise<void> {
    // In interactive mode, respect the 5-second SIGINT timeout
    // Leave 500ms buffer for the process to exit cleanly
    const isInteractive = process.env.ABLY_INTERACTIVE_MODE === 'true';
    const effectiveTimeout = isInteractive ? Math.min(timeoutMs, 4500) : timeoutMs;
    
    return new Promise((resolve, reject) => {
      let cleanupTimedOut = false;
      const timeout = setTimeout(() => {
        cleanupTimedOut = true;
        // Log timeout only if not in JSON mode
        if (!this.shouldOutputJson({})) {
          // TODO: Pass actual flags here
          this.log(chalk.yellow("Cleanup operation timed out."));
        }
        reject(new Error("Cleanup timed out")); // Reject promise on timeout
      }, effectiveTimeout);

      // Execute the cleanup function
      (async () => {
        try {
          await cleanupFunction();
        } catch (error) {
          // Log cleanup error only if not in JSON mode
          if (!this.shouldOutputJson({})) {
            // TODO: Pass actual flags here
            this.log(
              chalk.red(`Error during cleanup: ${(error as Error).message}`),
            );
          }
          // Don't necessarily reject the main promise here, depends on desired behavior
          // For now, we just log it
        } finally {
          clearTimeout(timeout);
          // Only resolve if the timeout didn't already reject
          if (!cleanupTimedOut) {
            resolve();
          }
        }
      })();
    });
  }

  /**
   * Check if account information should be hidden for this command execution
   * This is the case when:
   * 1. No account is configured
   * 2. Explicit API key or token is provided
   * 3. Explicit access token is provided
   * 4. Environment variables are used for auth
   */
  protected shouldHideAccountInfo(flags: BaseFlags): boolean {
    // Check if there's no account configured
    const currentAccount = this.configManager.getCurrentAccount();
    if (!currentAccount) {
      return true;
    }

    // Hide account info if explicit auth credentials are provided
    return (
      Boolean(flags["api-key"]) ||
      Boolean(flags.token) ||
      Boolean(flags["access-token"]) ||
      Boolean(process.env.ABLY_API_KEY) ||
      Boolean(process.env.ABLY_ACCESS_TOKEN)
    );
  }

  /**
   * Set up connection state logging for a Realtime client
   * This should be called after creating a Realtime client for long-running commands
   */
  protected setupConnectionStateLogging(
    client: Ably.Realtime,
    flags: BaseFlags,
    options?: {
      component?: string;
      includeUserFriendlyMessages?: boolean;
    }
  ): (() => void) {
    const component = options?.component || "connection";
    const showUserMessages = options?.includeUserFriendlyMessages || false;

    const connectionStateHandler = (stateChange: Ably.ConnectionStateChange) => {
      this.logCliEvent(
        flags,
        component,
        stateChange.current,
        `Connection state changed to ${stateChange.current}`,
        { reason: stateChange.reason },
      );

      // Optional user-friendly messages for non-JSON output
      if (showUserMessages && !this.shouldOutputJson(flags)) {
        switch (stateChange.current) {
          case "connected": {
            // Don't show connected message - it's implied by successful channel/space operations
            break;
          }
          case "disconnected": {
            this.log(chalk.yellow("! Disconnected from Ably"));
            break;
          }
          case "failed": {
            this.log(chalk.red(`✗ Connection failed: ${stateChange.reason?.message || "Unknown error"}`));
            break;
          }
          case "suspended": {
            this.log(chalk.yellow("! Connection suspended"));
            break;
          }
          case "connecting": {
            // Don't show connecting message - it's too transient
            break;
          }
        }
      }
    };

    client.connection.on(connectionStateHandler);

    // Return cleanup function
    return () => {
      client.connection.off(connectionStateHandler);
    };
  }

  /**
   * Set up channel state logging for a channel
   * This should be called after creating/getting a channel for long-running commands
   */
  protected setupChannelStateLogging(
    channel: Ably.RealtimeChannel,
    flags: BaseFlags,
    options?: {
      component?: string;
      includeUserFriendlyMessages?: boolean;
    }
  ): (() => void) {
    const component = options?.component || "channel";
    const showUserMessages = options?.includeUserFriendlyMessages || false;

    const stateChangeHandler = (stateChange: Ably.ChannelStateChange) => {
      this.logCliEvent(
        flags,
        component,
        stateChange.current,
        `Channel '${channel.name}' state changed to ${stateChange.current}`,
        { channel: channel.name, reason: stateChange.reason },
      );

      if (showUserMessages && !this.shouldOutputJson(flags)) {
        switch (stateChange.current) {
          case "attached": {
            // Success will be shown by the command itself in context
            break;
          }
          case "failed": {
            this.log(chalk.red(`✗ Failed to attach to channel ${chalk.cyan(channel.name)}: ${stateChange.reason?.message || "Unknown error"}`));
            break;
          }
          case "detached": {
            this.log(chalk.yellow(`! Detached from channel: ${chalk.cyan(channel.name)} ${stateChange.reason ? `(Reason: ${stateChange.reason.message})` : ""}`));
            break;
          }
          case "attaching": {
            // Don't show attaching message - only show when attached or failed
            break;
          }
        }
      }
    };

    channel.on(stateChangeHandler);

    // Return cleanup function
    return () => {
      channel.off(stateChangeHandler);
    };
  }
}
export { BaseFlags } from "./types/cli.js";
