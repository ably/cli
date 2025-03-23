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
} 