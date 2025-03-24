import {Command, Flags} from '@oclif/core'
import * as Ably from 'ably'
import {randomUUID} from 'crypto'
import { ConfigManager } from './services/config-manager.js'
import { InteractiveHelper } from './services/interactive-helper.js'
import { ControlApi } from './services/control-api.js'
import chalk from 'chalk'

export abstract class AblyBaseCommand extends Command {
  protected configManager: ConfigManager
  protected interactiveHelper: InteractiveHelper

  constructor(argv: string[], config: any) {
    super(argv, config)
    this.configManager = new ConfigManager()
    this.interactiveHelper = new InteractiveHelper(this.configManager)
  }

  static globalFlags = {
    host: Flags.string({
      description: 'Override the host endpoint for all product API calls',
    }),
    env: Flags.string({
      description: 'Override the environment for all product API calls',
    }),
    'control-host': Flags.string({
      description: 'Override the host endpoint for the control API, which defaults to control.ably.net',
    }),
    'access-token': Flags.string({
      description: 'Overrides any configured access token used for the Control API',
    }),
    'api-key': Flags.string({
      description: 'Overrides any configured API key used for the product APIs',
    }),
    'client-id': Flags.string({
      description: 'Overrides any default client ID when using API authentication',
    }),
  }

  protected async ensureAppAndKey(flags: any): Promise<{appId: string, apiKey: string} | null> {
    // Check if we have an app and key from flags or config
    let appId = flags.app || this.configManager.getCurrentAppId()
    let apiKey = flags['api-key'] || this.configManager.getApiKey(appId)

    // If we have both, return them
    if (appId && apiKey) {
      // Display app and key info in non-JSON mode
      if (flags.format !== 'json' && !flags.json && !flags.quiet) {
        this.displayAppAndKeyInfo(appId, apiKey)
      }
      return { appId, apiKey }
    }

    // Otherwise, we need to interactively select them
    this.log('No app or API key configured for this command.')
    
    // Get access token for control API
    const accessToken = flags['access-token'] || this.configManager.getAccessToken()
    if (!accessToken) {
      this.log('Please log in first with "ably accounts login" or provide an access token with --access-token.')
      return null
    }

    const controlApi = new ControlApi({ accessToken })

    // If no app is selected, prompt to select one
    if (!appId) {
      if (!this.shouldSuppressOutput(flags)) {
        this.log('Select an app to use for this command:')
      }
      const selectedApp = await this.interactiveHelper.selectApp(controlApi)
      
      if (!selectedApp) return null
      
      appId = selectedApp.id
      this.configManager.setCurrentApp(appId)
      // Store app name along with app ID
      this.configManager.storeAppInfo(appId, { appName: selectedApp.name })
      if (!this.shouldSuppressOutput(flags)) {
        this.log(`Selected app: ${selectedApp.name} (${appId})`)
      }
    }

    // If no key is selected, prompt to select one
    if (!apiKey) {
      this.log('Select an API key to use for this command:')
      const selectedKey = await this.interactiveHelper.selectKey(controlApi, appId)
      
      if (!selectedKey) return null
      
      apiKey = selectedKey.key
      // Store key with metadata including key name and ID
      this.configManager.storeAppKey(
        appId, 
        apiKey, 
        {
          keyId: selectedKey.id,
          keyName: selectedKey.name || 'Unnamed key'
        }
      )
      this.log(`Selected key: ${selectedKey.name || 'Unnamed key'} (${selectedKey.id})`)
    }

    return { appId, apiKey }
  }

  private displayAppAndKeyInfo(appId: string, apiKey: string): void {
    // Get app and key information from config
    const appName = this.configManager.getAppName(appId) || 'Unknown App'
    const keyId = apiKey.split(':')[0] // Extract key ID (part before colon)
    const keyName = this.configManager.getKeyName(appId) || 'Unknown Key'
    // Format the full key name (app_id.key_id)
    const formattedKeyName = keyId.includes('.') ? keyId : `${appId}.${keyId}`
    const currentAccount = this.configManager.getCurrentAccount()
    const accountName = currentAccount?.accountName || this.configManager.getCurrentAccountAlias() || 'Unknown Account'

    this.log(`${chalk.dim('Using:')} ${chalk.cyan('Account=')}${chalk.cyan.bold(accountName)} ${chalk.dim('•')} ${chalk.green('App=')}${chalk.green.bold(appName)} ${chalk.gray(`(${appId})`)} ${chalk.dim('•')} ${chalk.yellow('Key=')}${chalk.yellow.bold(keyName)} ${chalk.gray(`(${formattedKeyName})`)}`)
    this.log('') // Add blank line for readability
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

  protected async createAblyClient(flags: any): Promise<Ably.Realtime | null> {
    // Ensure we have app and key before creating client
    if (!flags['api-key']) {
      const appAndKey = await this.ensureAppAndKey(flags)
      if (!appAndKey) {
        return null
      }
      flags['api-key'] = appAndKey.apiKey
    }

    const options = this.getClientOptions(flags)
    
    try {
      const client = new Ably.Realtime(options)
      
      // Wait for the connection to be established or fail
      return await new Promise((resolve, reject) => {
        client.connection.once('connected', () => {
          resolve(client)
        })
        
        client.connection.once('failed', (stateChange) => {
          // Handle authentication errors specifically
          if (stateChange.reason && stateChange.reason.code === 40100) { // Unauthorized
            this.handleInvalidKey(flags)
            reject(new Error('Invalid API key. Ensure you have a valid key configured.'))
          } else {
            reject(stateChange.reason || new Error('Connection failed'))
          }
        })
      })
    } catch (error: unknown) {
      // Handle any synchronous errors when creating the client
      const err = error as Error & { code?: number } // Type assertion
      if (err.code === 40100 || err.message?.includes('invalid key')) { // Unauthorized or invalid key format
        await this.handleInvalidKey(flags)
      }
      throw error
    }
  }
  
  private async handleInvalidKey(flags: any): Promise<void> {
    const appId = flags.app || this.configManager.getCurrentAppId()
    
    if (appId) {
      this.log('The configured API key appears to be invalid or revoked.')
      
      const shouldRemove = await this.interactiveHelper.confirm(
        'Would you like to remove this invalid key from your configuration?'
      )
      
      if (shouldRemove) {
        this.configManager.removeApiKey(appId)
        this.log('Invalid key removed from configuration.')
      }
    }
  }

  protected async handleSingularPlural(command: string): Promise<void> {
    // Map of singular to plural commands
    const singularToPlural: Record<string, string> = {
      'account': 'accounts',
      'app': 'apps',
      'channel': 'channels',
      'connection': 'connections',
      'log': 'logs',
      'room': 'rooms'
    }

    // Check if the command is a singular form
    const singularMatch = command.match(/^([a-z]+)(?::|$)/)
    if (singularMatch && singularToPlural[singularMatch[1]]) {
      // Replace the singular form with plural in the command
      const pluralCommand = command.replace(/^[a-z]+/, singularToPlural[singularMatch[1]])
      await this.config.runCommand(pluralCommand, this.argv)
      return
    }

    // If not a singular form, continue with normal command execution
    return
  }
} 