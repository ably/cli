import {Command, Flags} from '@oclif/core'
import * as Ably from 'ably'
import {randomUUID} from 'crypto'
import { ConfigManager } from './services/config-manager.js'

export abstract class AblyBaseCommand extends Command {
  protected configManager: ConfigManager

  constructor(argv: string[], config: any) {
    super(argv, config)
    this.configManager = new ConfigManager()
  }

  static globalFlags = {
    'host': Flags.string({
      description: 'Override the host endpoint for all product API calls',
      env: 'ABLY_HOST',
    }),
    'env': Flags.string({
      description: 'Override the environment for all product API calls',
      env: 'ABLY_ENV',
    }),
    'control-host': Flags.string({
      description: 'Override the host endpoint for the control API, which defaults to control.ably.net',
      env: 'ABLY_CONTROL_HOST',
    }),
    'access-token': Flags.string({
      description: 'Overrides any configured access token used for the Control API',
      env: 'ABLY_ACCESS_TOKEN',
    }),
    'api-key': Flags.string({
      description: 'Overrides any configured API key used for the product APIs',
      env: 'ABLY_API_KEY',
    }),
    'client-id': Flags.string({
      description: 'Overrides any default client ID when using API authentication',
      env: 'ABLY_CLIENT_ID',
    }),
  }

  protected getClientOptions(flags: any): Ably.ClientOptions {
    const options: Ably.ClientOptions = {}

    // Handle authentication - try flags first, then config
    if (flags['api-key']) {
      options.key = flags['api-key']
    } else {
      const apiKey = this.configManager.getApiKey()
      if (apiKey) {
        options.key = apiKey
      }
    }

    // Handle client ID
    if (flags['client-id']) {
      options.clientId = flags['client-id']
    } else {
      // Generate a default client ID for the CLI
      options.clientId = `ably-cli-${randomUUID().substring(0, 8)}`
    }

    // Handle host and environment options
    if (flags.host) {
      options.realtimeHost = flags.host
      options.restHost = flags.host
    }

    if (flags.env) {
      options.environment = flags.env
    }

    return options
  }

  protected createAblyClient(flags: any): Ably.Realtime {
    const options = this.getClientOptions(flags)
    return new Ably.Realtime(options)
  }
} 