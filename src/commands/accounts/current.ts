import { Command } from "@oclif/core"
import chalk from 'chalk'

import { ControlBaseCommand } from '../../control-base-command.js'
import { ControlApi } from '../../services/control-api.js'

export default class AccountsCurrent extends ControlBaseCommand {
  static override description = 'Show the current Ably account'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --pretty-json'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
    
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(AccountsCurrent)
    
    // Special handling for web CLI mode
    if (this.isWebCliMode) {
      return this.handleWebCliMode(flags)
    }
    
    // Get current account alias and account object
    const currentAlias = this.configManager.getCurrentAccountAlias()
    const currentAccount = this.configManager.getCurrentAccount()
    
    if (!currentAlias || !currentAccount) {
      this.error('No account is currently selected. Use "ably accounts login" or "ably accounts switch" to select an account.')
      return
    }
    
    // Verify the account by making an API call to get up-to-date information
    try {
      const {accessToken} = currentAccount
      
      const controlApi = new ControlApi({
        accessToken,
        controlHost: flags['control-host']
      })

      const { account, user } = await controlApi.getMe()
      
      this.log(`${chalk.cyan('Account:')} ${chalk.cyan.bold(account.name)} ${chalk.gray(`(${account.id})`)}`)
      this.log(`${chalk.cyan('User:')} ${chalk.cyan.bold(user.email)}`)
      
      // Count number of apps configured for this account
      const appCount = currentAccount.apps ? Object.keys(currentAccount.apps).length : 0
      this.log(`${chalk.cyan('Apps configured:')} ${chalk.cyan.bold(appCount)}`)
      
      // Show current app if one is selected
      const currentAppId = this.configManager.getCurrentAppId()
      if (currentAppId) {
        const appName = this.configManager.getAppName(currentAppId) || currentAppId
        this.log(`${chalk.green('Current App:')} ${chalk.green.bold(appName)} ${chalk.gray(`(${currentAppId})`)}`)
        
        // Show current key if one is selected
        const apiKey = this.configManager.getApiKey(currentAppId)
        if (apiKey) {
          const keyId = this.configManager.getKeyId(currentAppId) || apiKey.split(':')[0]
          const keyName = this.configManager.getKeyName(currentAppId) || 'Unnamed key'
          // Format the full key name (app_id.key_id)
          const formattedKeyName = keyId.includes('.') ? keyId : `${currentAppId}.${keyId}`
          this.log(`${chalk.yellow('Current API Key:')} ${chalk.yellow.bold(formattedKeyName)}`)
          this.log(`${chalk.yellow('Key Label:')} ${chalk.yellow.bold(keyName)}`)
        }
      }
    } catch {
      this.warn('Unable to verify account information. Your access token may have expired.')
      this.log(chalk.red(`Consider logging in again with "ably accounts login --alias ${currentAlias}".`))
      
      // Show cached information
      if (currentAccount.accountName || currentAccount.accountId) {
        this.log(`${chalk.cyan('Account (cached):')} ${chalk.cyan.bold(currentAccount.accountName || 'Unknown')} ${chalk.gray(`(${currentAccount.accountId || 'Unknown ID'})`)}`)
      }
      
      if (currentAccount.userEmail) {
        this.log(`${chalk.cyan('User (cached):')} ${chalk.cyan.bold(currentAccount.userEmail)}`)
      }
    }
  }
  
  /**
   * Handle the command in web CLI mode by getting account info from environment
   * and using the Control API to get additional details
   */
  private async handleWebCliMode(flags: any): Promise<void> {
    const accessToken = process.env.ABLY_ACCESS_TOKEN
    if (!accessToken) {
      this.error('ABLY_ACCESS_TOKEN environment variable is not set')
    }

    try {
      // Create a control API instance
      const controlApi = this.createControlApi(flags)

      // Get account details from the Control API
      const { account, user } = await controlApi.getMe()
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          account: {
            accountId: account.id,
            accountName: account.name,
            userEmail: user.email
          },
          mode: 'web-cli'
        }, flags))
      } else {
        // Extract app ID from ABLY_API_KEY
        const apiKey = process.env.ABLY_API_KEY
        let appId = ''
        let keyId = ''
        
        if (apiKey) {
          appId = apiKey.split('.')[0]
          keyId = apiKey.split(':')[0] // This includes APP_ID.KEY_ID
        }
        
        this.log(`${chalk.cyan('Account:')} ${chalk.cyan.bold(account.name)} ${chalk.gray(`(${account.id})`)}`)
        this.log(`${chalk.cyan('User:')} ${chalk.cyan.bold(user.email)}`)
        
        if (appId && keyId) {
          this.log(`${chalk.green('Current App ID:')} ${chalk.green.bold(appId)}`)
          this.log(`${chalk.yellow('Current API Key:')} ${chalk.yellow.bold(keyId)}`)
        }
        
        this.log(`${chalk.magenta('Mode:')} ${chalk.magenta.bold('Web CLI')} ${chalk.dim('(using environment variables)')}`)
      }
    } catch (error) {
      // If we can't get account details, show an error message
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: error instanceof Error ? error.message : String(error),
          mode: 'web-cli'
        }, flags))
      } else {
        this.log(`${chalk.red('Error:')} ${error instanceof Error ? error.message : String(error)}`)
        this.log(`${chalk.yellow('Info:')} Your access token may have expired or is invalid.`)
        this.log(`${chalk.magenta('Mode:')} ${chalk.magenta.bold('Web CLI')} ${chalk.dim('(using environment variables)')}`)
      }
    }
  }
} 