import { AblyBaseCommand } from './base-command.js'
import { ControlApi } from './services/control-api.js'

export abstract class ControlBaseCommand extends AblyBaseCommand {
  protected createControlApi(flags: any): ControlApi {
    // Validate access token is provided
    if (!flags['access-token']) {
      this.error('An access token is required for Control API operations. Please provide it with --access-token flag or set the ABLY_ACCESS_TOKEN environment variable.')
    }

    return new ControlApi({
      accessToken: flags['access-token'],
      controlHost: flags['control-host'],
    })
  }

  protected formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString()
  }
} 