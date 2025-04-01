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
    'token': Flags.string({
      description: 'Authenticate using an Ably Token or JWT Token instead of an API key',
    }),
    'client-id': Flags.string({
      description: 'Overrides any default client ID when using API authentication. Use "none" to explicitly set no client ID. Not applicable when using token authentication.',
    }),
  }

  // Add this method to check if we should suppress output
  protected shouldSuppressOutput(flags: any): boolean {
    return flags['token-only'] === true;
  }

  protected async ensureAppAndKey(flags: any): Promise<{appId: string, apiKey: string} | null> {
    // If token auth is being used, we don't need an API key
    if (flags.token) {
      // For token auth, we still need an app ID for some operations
      let appId = flags.app || this.configManager.getCurrentAppId()
      if (appId) {
        return { appId, apiKey: '' }
      }
      // If no app ID is provided, we'll try to extract it from the token if it's a JWT
      // But for now, just return null and let the operation proceed with token auth only
    }
    
    // Check if we have an app and key from flags or config
    let appId = flags.app || this.configManager.getCurrentAppId()
    let apiKey = flags['api-key'] || this.configManager.getApiKey(appId)

    // If we have both, return them
    if (appId && apiKey) {
      // Display app and key info in non-JSON mode, unless output should be suppressed
      if (flags.format !== 'json' && !flags.json && !flags.quiet && !this.shouldSuppressOutput(flags)) {
        this.displayAppAndKeyInfo(appId, apiKey)
      }
      return { appId, apiKey }
    }

    // Get access token for control API
    const accessToken = process.env.ABLY_ACCESS_TOKEN || flags['access-token'] || this.configManager.getAccessToken()
    if (!accessToken) {
      return null
    }

    const controlApi = new ControlApi({ accessToken, controlHost: flags['control-host'] })

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
        this.log(`  Selected app: ${selectedApp.name} (${appId})\n`)
      }
    }

    // If no key is selected, prompt to select one
    if (!apiKey) {
      if (!this.shouldSuppressOutput(flags)) {
        this.log('Select an API key to use for this command:')
      }
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
      if (!this.shouldSuppressOutput(flags)) {
        this.log(`  Selected key: ${selectedKey.name || 'Unnamed key'} (${selectedKey.id})\n`)
      }
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

  private displayTokenAuthInfo(appId?: string): void {
    // Display token authentication info
    let appInfo = ''
    if (appId) {
      const appName = this.configManager.getAppName(appId) || 'Unknown App'
      appInfo = ` ${chalk.dim('•')} ${chalk.green('App=')}${chalk.green.bold(appName)} ${chalk.gray(`(${appId})`)}`
    }
    
    this.log(`${chalk.dim('Using:')} ${chalk.magenta('Auth=')}${chalk.magenta.bold('Token')}${appInfo}`)
    this.log('') // Add blank line for readability
  }

  protected getClientOptions(flags: any): Ably.ClientOptions {
    const options: Ably.ClientOptions = {}

    // Handle authentication - try token first, then api-key, then environment variable, then config
    if (flags.token) {
      options.token = flags.token
      
      // Show token auth info if not in JSON mode and not suppressing output
      if (flags.format !== 'json' && !flags.json && !flags.quiet && !this.shouldSuppressOutput(flags)) {
        this.displayTokenAuthInfo(flags.app || this.configManager.getCurrentAppId())
      }
      
      // When using token auth, we don't set the clientId as it may conflict
      // with any clientId embedded in the token
      if (flags['client-id'] && !this.shouldSuppressOutput(flags)) {
        this.log(chalk.yellow('Warning: clientId is ignored when using token authentication as the clientId is embedded in the token'))
      }
    } else if (flags['api-key']) {
      options.key = flags['api-key']
      
      // Handle client ID for API key auth
      this.setClientId(options, flags)
    } else if (process.env.ABLY_API_KEY) {
      options.key = process.env.ABLY_API_KEY
      
      // Handle client ID for API key auth
      this.setClientId(options, flags)
    } else {
      const apiKey = this.configManager.getApiKey()
      if (apiKey) {
        options.key = apiKey
        
        // Handle client ID for API key auth
        this.setClientId(options, flags)
      }
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
  
  private setClientId(options: Ably.ClientOptions, flags: any): void {
    if (flags['client-id']) {
      // Special case: "none" means explicitly no client ID
      if (flags['client-id'].toLowerCase() === 'none') {
        // Don't set clientId at all
      } else {
        options.clientId = flags['client-id']
      }
    } else {
      // Generate a default client ID for the CLI
      options.clientId = `ably-cli-${randomUUID().substring(0, 8)}`
    }
  }

  protected async createAblyClient(flags: any): Promise<Ably.Realtime | null> {
    // If token is provided or API key is in environment, we can skip the ensureAppAndKey step
    if (!flags.token && !flags['api-key'] && !process.env.ABLY_API_KEY) {
      const appAndKey = await this.ensureAppAndKey(flags)
      if (!appAndKey) {
        this.error(`${chalk.yellow('No app or API key configured for this command')}.\nPlease log in first with "${chalk.cyan('ably accounts login')}" (recommended approach).\nAlternatively you can provide an API key with the ${chalk.cyan('--api-key')} argument or set the ${chalk.cyan('ABLY_API_KEY')} environment variable.`)
        return null
      }
      flags['api-key'] = appAndKey.apiKey
    }

    const options = this.getClientOptions(flags)
    
    // Make sure we have some form of authentication
    if (!options.key && !options.token) {
      this.error('Authentication required. Please provide either an API key, a token, or log in first.')
      return null
    }
    
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
            if (options.key) {
              this.handleInvalidKey(flags)
              reject(new Error('Invalid API key. Ensure you have a valid key configured.'))
            } else {
              reject(new Error('Invalid token. Please provide a valid Ably Token or JWT.'))
            }
          } else {
            reject(stateChange.reason || new Error('Connection failed'))
          }
        })
      })
    } catch (error: unknown) {
      // Handle any synchronous errors when creating the client
      const err = error as Error & { code?: number } // Type assertion
      if (err.code === 40100 || err.message?.includes('invalid key')) { // Unauthorized or invalid key format
        if (options.key) {
          await this.handleInvalidKey(flags)
        }
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
} 