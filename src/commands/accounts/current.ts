import { ControlBaseCommand } from '../../control-base-command.js'
import { ControlApi } from '../../services/control-api.js'
import chalk from 'chalk'
import { Flags } from '@oclif/core'

export default class AccountsCurrent extends ControlBaseCommand {
  static override description = 'Show the current Ably account'

  static override examples = [
    '<%= config.bin %> <%= command.id %>'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(AccountsCurrent)
    const currentAlias = this.configManager.getCurrentAccountAlias()
    
    if (!currentAlias) {
      this.log('No account is currently selected. Use "ably accounts login" or "ably accounts switch" to select an account.')
      return
    }

    const currentAccount = this.configManager.getCurrentAccount()
    if (!currentAccount) {
      this.error(`Current account "${currentAlias}" not found in configuration.`)
      return
    }

    if (flags.format === 'json') {
      this.log(JSON.stringify({
        alias: currentAlias,
        account: currentAccount
      }))
      return
    }

    this.log(chalk.bold(`Current account: ${currentAlias}`))
    
    // Verify the account by making an API call to get up-to-date information
    try {
      const accessToken = currentAccount.accessToken
      
      const controlApi = new ControlApi({
        accessToken
      })

      const { user, account } = await controlApi.getMe()
      
      this.log(chalk.bold(`Account: ${account.name} (${account.id})`))
      this.log(chalk.bold(`User: ${user.email}`))
      
      // Count number of apps configured for this account
      const appCount = currentAccount.apps ? Object.keys(currentAccount.apps).length : 0
      this.log(chalk.bold(`Apps configured: ${appCount}`))
      
      // Show current app if one is selected
      const currentAppId = this.configManager.getCurrentAppId()
      if (currentAppId) {
        const appName = this.configManager.getAppName(currentAppId) || currentAppId
        this.log(chalk.bold(`Current app: ${appName} (${currentAppId})`))
        
        // Show current key if one is selected
        const apiKey = this.configManager.getApiKey(currentAppId)
        if (apiKey) {
          const keyId = this.configManager.getKeyId(currentAppId) || apiKey.split(':')[0]
          const keyName = this.configManager.getKeyName(currentAppId) || 'Unnamed key'
          // Format the full key name (app_id.key_id)
          const formattedKeyName = keyId.includes('.') ? keyId : `${currentAppId}.${keyId}`
          this.log(chalk.bold(`Current API Key: ${formattedKeyName}`))
          this.log(chalk.bold(`Key Label: ${keyName}`))
        }
      }
    } catch (error) {
      this.warn('Unable to verify account information. Your access token may have expired.')
      this.log(chalk.bold(`Consider logging in again with "ably accounts login --alias ${currentAlias}".`))
      
      // Show cached information
      if (currentAccount.accountName || currentAccount.accountId) {
        this.log(chalk.bold(`Account (cached): ${currentAccount.accountName || 'Unknown'} (${currentAccount.accountId || 'Unknown ID'})`))
      }
      
      if (currentAccount.userEmail) {
        this.log(chalk.bold(`User (cached): ${currentAccount.userEmail}`))
      }
    }
  }
} 