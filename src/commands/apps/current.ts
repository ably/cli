import chalk from 'chalk'

import { ControlBaseCommand } from '../../control-base-command.js'

export default class AppsCurrent extends ControlBaseCommand {
  static override description = 'Show the currently selected app'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --pretty-json'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
    
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppsCurrent)
    
    // Special handling for web CLI mode
    if (this.isWebCliMode) {
      return this.handleWebCliMode(flags)
    }
    
    // Get the current account and app
    const currentAccountAlias = this.configManager.getCurrentAccountAlias()
    const currentAccount = this.configManager.getCurrentAccount()
    const currentAppId = this.configManager.getCurrentAppId()
    
    if (!currentAccountAlias || !currentAccount) {
      this.error('No account selected. Use "ably accounts switch" to select an account.')
    }
    
    if (!currentAppId) {
      this.error('No app selected. Use "ably apps switch" to select an app.')
    }
    
    // Get app name from local config
    const appName = this.configManager.getAppName(currentAppId) || currentAppId
    
    try {
      if (this.shouldOutputJson(flags)) {
        // Get key information for JSON output
        const apiKey = this.configManager.getApiKey(currentAppId)
        let keyInfo = null
        
        if (apiKey) {
          const keyId = this.configManager.getKeyId(currentAppId) || apiKey.split(':')[0]
          const keyLabel = this.configManager.getKeyName(currentAppId) || 'Unnamed key'
          const keyName = keyId.includes('.') ? keyId : `${currentAppId}.${keyId.split('.')[1] || keyId}`
          
          keyInfo = {
            keyName,
            label: keyLabel
          }
        }
        
        this.log(this.formatJsonOutput({
          account: {
            alias: currentAccountAlias,
            ...currentAccount
          },
          app: {
            id: currentAppId,
            name: appName
          },
          key: keyInfo
        }, flags))
      } else {
        this.log(`${chalk.cyan('Account:')} ${chalk.cyan.bold(currentAccount.accountName || currentAccountAlias)} ${chalk.gray(`(${currentAccount.accountId || 'Unknown ID'})`)}`)
        this.log(`${chalk.green('App:')} ${chalk.green.bold(appName)} ${chalk.gray(`(${currentAppId})`)}`)
        
        // Show the currently selected API key if one is set
        const apiKey = this.configManager.getApiKey(currentAppId)
        if (apiKey) {
          // Extract the key ID and format the full key name (app_id.key_id)
          const keyId = this.configManager.getKeyId(currentAppId) || apiKey.split(':')[0]
          const keyLabel = this.configManager.getKeyName(currentAppId) || 'Unnamed key'
          
          // Format the full key name (app_id.key_id)
          const keyName = keyId.includes('.') ? keyId : `${currentAppId}.${keyId.split('.')[1] || keyId}`
          
          this.log(`${chalk.yellow('API Key:')} ${chalk.yellow.bold(keyName)}`)
          this.log(`${chalk.yellow('Key Label:')} ${chalk.yellow.bold(keyLabel)}`)
        } else {
          this.log(`${chalk.yellow('API Key:')} ${chalk.dim('None selected. Use "ably auth keys switch" to select a key.')}`)
        }
      }
    } catch (error) {
      this.error(`Error retrieving app information: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Handle the command in web CLI mode by extracting app info from environment variables
   * and using the Control API to get additional details
   */
  private async handleWebCliMode(flags: Record<string, unknown>): Promise<void> {
    // Extract app ID from the ABLY_API_KEY environment variable
    const apiKey = process.env.ABLY_API_KEY
    if (!apiKey) {
      this.error('ABLY_API_KEY environment variable is not set')
    }

    // API key format is [APP_ID].[KEY_ID]:[KEY_SECRET]
    const appId = apiKey.split('.')[0]
    const keyId = apiKey.split(':')[0] // This includes APP_ID.KEY_ID
    
    try {
      // Create a control API instance using the base class method
      const controlApi = this.createControlApi(flags)

      // Get app details from the Control API
      const appDetails = await controlApi.getApp(appId)
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          app: {
            id: appId,
            name: appDetails.name
          },
          key: {
            keyName: keyId,
            label: 'Web CLI Key'
          },
          mode: 'web-cli'
        }, flags))
      } else {
        // Get account info if possible
        let accountName = 'Web CLI Account'
        let accountId = ''
        
        try {
          const { account } = await controlApi.getMe()
          accountName = account.name
          accountId = account.id
        } catch {
          // If we can't get account details, just use default values
        }
        
        this.log(`${chalk.cyan('Account:')} ${chalk.cyan.bold(accountName)} ${accountId ? chalk.gray(`(${accountId})`) : ''}`)
        this.log(`${chalk.green('App:')} ${chalk.green.bold(appDetails.name)} ${chalk.gray(`(${appId})`)}`)
        this.log(`${chalk.yellow('API Key:')} ${chalk.yellow.bold(keyId)}`)
        this.log(`${chalk.magenta('Mode:')} ${chalk.magenta.bold('Web CLI')} ${chalk.dim('(using environment variables)')}`)
      }
    } catch (error) {
      // If we can't get app details, just show what we know
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          app: {
            id: appId,
            name: 'Unknown'
          },
          key: {
            keyName: keyId,
            label: 'Web CLI Key'
          },
          mode: 'web-cli'
        }, flags))
      } else {
        this.log(`${chalk.green('App:')} ${chalk.green.bold('Unknown')} ${chalk.gray(`(${appId})`)}`)
        this.log(`${chalk.yellow('API Key:')} ${chalk.yellow.bold(keyId)}`)
        this.log(`${chalk.red('Error:')} Could not fetch additional app details: ${error instanceof Error ? error.message : String(error)}`)
        this.log(`${chalk.magenta('Mode:')} ${chalk.magenta.bold('Web CLI')} ${chalk.dim('(using environment variables)')}`)
      }
    }
  }
} 