import { Flags } from '@oclif/core'
import { AblyBaseCommand } from './base-command.js'
import { ControlApi } from './services/control-api.js'
import chalk from 'chalk'

export abstract class ControlBaseCommand extends AblyBaseCommand {
  // Add flags specific to control API commands
  static globalFlags = {
    ...AblyBaseCommand.globalFlags,
    // Other Control API specific flags can be added here
  }

  /**
   * Create a Control API instance for making requests
   */
  protected createControlApi(flags: any): ControlApi {
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
  
  /**
   * Helper method to show account info for control plane commands
   * This is called by the child class when it wants to show account info
   */
  protected showControlPlaneInfo(flags: any): void {
    // Use the base class method for consistent display
    this.showAuthInfoIfNeeded(flags)
  }
  
  /**
   * Run the Control API command with standard error handling
   */
  protected async runControlCommand<T>(
    flags: any,
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
        this.outputJsonError(errorMessageText, error);
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

  protected formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString()
  }

  protected async getAppId(flags: any): Promise<string | undefined> {
    // First try to get app ID from flags
    if (flags.app) {
      const apps = await this.createControlApi(flags).listApps()
      
      // Check if app parameter is an app ID
      const appById = apps.find(app => app.id === flags.app)
      if (appById) {
        return appById.id
      }
      
      // Check if app parameter is an app name
      const appByName = apps.find(app => app.name === flags.app)
      if (appByName) {
        return appByName.id
      }
      
      // If not found by ID or name, throw an error
      this.error(`App "${flags.app}" not found by ID or name`)
      return undefined
    }
    
    // If no app specified in flags, use the current app from config
    return this.configManager.getCurrentAppId()
  }
} 