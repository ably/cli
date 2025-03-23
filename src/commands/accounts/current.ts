import { ControlBaseCommand } from '../../control-base-command.js'
import { ControlApi } from '../../services/control-api.js'

export default class AccountsCurrent extends ControlBaseCommand {
  static override description = 'Show the current Ably account'

  static override examples = [
    '<%= config.bin %> <%= command.id %>'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
  }

  public async run(): Promise<void> {
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

    this.log(`Current account: ${currentAlias}`)
    
    // Verify the account by making an API call to get up-to-date information
    try {
      const accessToken = currentAccount.accessToken
      
      const controlApi = new ControlApi({
        accessToken
      })

      const { user, account } = await controlApi.getMe()
      
      this.log(`Account: ${account.name} (${account.id})`)
      this.log(`User: ${user.email}`)
      
      // Count number of apps configured for this account
      const appCount = currentAccount.apps ? Object.keys(currentAccount.apps).length : 0
      this.log(`Apps configured: ${appCount}`)
      
      // Show current app if one is selected
      const currentAppId = this.configManager.getCurrentAppId()
      if (currentAppId) {
        this.log(`Current app: ${currentAppId}`)
      }
    } catch (error) {
      this.warn('Unable to verify account information. Your access token may have expired.')
      this.log(`Consider logging in again with "ably accounts login --alias ${currentAlias}".`)
      
      // Show cached information
      if (currentAccount.accountName || currentAccount.accountId) {
        this.log(`Account (cached): ${currentAccount.accountName || 'Unknown'} (${currentAccount.accountId || 'Unknown'})`)
      }
      
      if (currentAccount.userEmail) {
        this.log(`User (cached): ${currentAccount.userEmail}`)
      }
    }
  }
} 