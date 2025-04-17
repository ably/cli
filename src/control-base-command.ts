import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { AblyBaseCommand } from './base-command.js'
import { ControlApi, App } from './services/control-api.js'
import { BaseFlags, ErrorDetails } from './types/cli.js'

export abstract class ControlBaseCommand extends AblyBaseCommand {
  // Add flags specific to control API commands
  static globalFlags = {
    ...AblyBaseCommand.globalFlags,
    // Other Control API specific flags can be added here
  }

  /**
   * Create a Control API instance for making requests
   */
  protected createControlApi(flags: BaseFlags): ControlApi {
    let accessToken = flags['access-token'] || process.env.ABLY_ACCESS_TOKEN
    
    if (!accessToken) {
      const account = this.configManager.getCurrentAccount()
      if (!account) {
        this.error(`No access token provided. Please specify --access-token or configure an account with "ably accounts login".`)
      }

      accessToken = account.accessToken
    }
    
    if (!accessToken) {
      this.error(`No access token provided. Please specify --access-token or configure an account with "ably accounts login".`)
    }
    
    return new ControlApi({
      accessToken,
      controlHost: flags['control-host']
    })
  }
  
  protected formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString()
  }
  
  /**
   * Resolves the app ID from the flags, current configuration, or interactive prompt
   * @param flags The command flags
   * @returns The app ID
   */
  protected async resolveAppId(flags: BaseFlags): Promise<string> {
    // If app is provided in flags, use it (it could be ID or name)
    if (flags.app) {
      // Try to parse as app ID or name
      return await this.resolveAppIdFromNameOrId(flags.app)
    }

    // Try to get from current app configuration
    const currentAppId = this.configManager.getCurrentAppId()
    if (currentAppId) {
      return currentAppId
    }

    // No app ID found, try to prompt for it
    return await this.promptForApp()
  }

  /**
   * Resolves an app ID from a name or ID
   * @param appNameOrId The app name or ID to resolve
   * @returns The app ID
   */
  protected async resolveAppIdFromNameOrId(appNameOrId: string): Promise<string> {
    // If it looks like an app ID (UUID format), just return it
    if (this.isValidAppId(appNameOrId)) {
      return appNameOrId
    }

    // Otherwise, need to look it up by name
    const controlApi = this.createControlApi({})
    
    try {
      const apps = await controlApi.listApps()
      const matchingApp = apps.find((app: App) => app.name === appNameOrId)
      
      if (matchingApp) {
        return matchingApp.id
      }

      this.error(chalk.red(`App "${appNameOrId}" not found. Please provide a valid app ID or name.`))
    } catch (error) {
      this.error(chalk.red(`Failed to look up app "${appNameOrId}": ${error instanceof Error ? error.message : String(error)}`))
    }

    return appNameOrId // This will never be reached, but TypeScript needs a return
  }

  /**
   * Prompts the user to select an app
   * @returns The selected app ID
   */
  protected async promptForApp(): Promise<string> {
    try {
      const controlApi = this.createControlApi({})
      const apps = await controlApi.listApps()
      
      if (apps.length === 0) {
        this.error(chalk.red('No apps found in your account. Please create an app first.'))
      }

      // Prompt the user to choose an app from the list
      const app = await this.interactiveHelper.selectApp(controlApi)
      if (!app) {
        this.error(chalk.red('No app selected.'))
      }
      
      // Save the selected app ID as the current app
      this.configManager.setCurrentApp(app.id)
      
      return app.id
    } catch (error) {
      this.error(chalk.red(`Failed to get apps: ${error instanceof Error ? error.message : String(error)}`))
    }
    
    return '' // This will never be reached, but TypeScript needs a return
  }

  /**
   * Simple validation to check if a string looks like an app ID (UUID)
   */
  private isValidAppId(id: string): boolean {
    // Basic UUID format check: 8-4-4-4-12 hex digits
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  }

  /**
   * Run the Control API command with standard error handling
   */
  protected async runControlCommand<T>(
    flags: BaseFlags,
    apiCall: (api: ControlApi) => Promise<T>,
    errorMessage = 'Error executing command'
  ): Promise<T | null> {
    try {
      // Display account info at start of command
      this.showAuthInfoIfNeeded(flags)
      
      // Create API and execute the command
      const api = this.createControlApi(flags)
      return await apiCall(api)
    } catch (error: unknown) {
      const isJsonMode = this.shouldOutputJson(flags);
      // Safely get the error message
      const errorMessageText = `${errorMessage}: ${error instanceof Error ? error.message : String(error)}`;

      if (isJsonMode) {
        // Pass the error object itself as details
        // The `outputJsonError` helper handles stringifying it
        this.outputJsonError(errorMessageText, error as ErrorDetails);
        // Exit explicitly in JSON mode after outputting error to stderr
        this.exit(1);
      } else {
        // Use the standard oclif error for non-JSON modes
        this.error(errorMessageText);
      }

      // This line is technically unreachable due to this.error or this.exit
      // but needed for TypeScript's control flow analysis
      return null;
    }
  }

  /**
   * Helper method to show account info for control plane commands
   * This is called by the child class when it wants to show account info
   */
  protected showControlPlaneInfo(flags: BaseFlags): void {
    // Use the base class method for consistent display
    this.showAuthInfoIfNeeded(flags)
  }
} 