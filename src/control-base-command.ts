import { AblyBaseCommand } from './base-command.js'
import { ControlApi } from './services/control-api.js'

export abstract class ControlBaseCommand extends AblyBaseCommand {
  protected createControlApi(flags: any): ControlApi {
    // Try to get access token from flags, then from config
    const accessToken = flags['access-token'] || this.configManager.getAccessToken()

    // Validate access token is provided
    if (!accessToken) {
      this.error('An access token is required for Control API operations. Please provide it with --access-token flag, set the ABLY_ACCESS_TOKEN environment variable, or log in using "ably accounts login".')
    }

    return new ControlApi({
      accessToken,
      controlHost: flags['control-host'],
    })
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