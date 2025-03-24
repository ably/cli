import { Args } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import { ControlApi } from '../../services/control-api.js'

export default class AccountsSwitch extends ControlBaseCommand {
  static override description = 'Switch to a different Ably account'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> mycompany'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
  }

  static override args = {
    alias: Args.string({
      description: 'Alias of the account to switch to',
      required: false
    })
  }

  public async run(): Promise<void> {
    const { args } = await this.parse(AccountsSwitch)
    
    // Get available accounts
    const accounts = this.configManager.listAccounts()
    
    if (accounts.length === 0) {
      this.error('No accounts configured. Use "ably accounts login" to add an account.')
    }
    
    // If alias is provided, switch directly
    if (args.alias) {
      await this.switchToAccount(args.alias, accounts)
      return
    }
    
    // Otherwise, show interactive selection
    this.log('Select an account to switch to:')
    const selectedAccount = await this.interactiveHelper.selectAccount()
    
    if (selectedAccount) {
      await this.switchToAccount(selectedAccount.alias, accounts)
    } else {
      this.log('Account switch cancelled.')
    }
  }
  
  private async switchToAccount(alias: string, accounts: Array<{alias: string, account: any}>): Promise<void> {
    // Check if account exists
    const accountExists = accounts.some(account => account.alias === alias)

    if (!accountExists) {
      this.error(`Account with alias "${alias}" not found. Use "ably accounts list" to see available accounts.`)
    }

    // Switch to the account
    this.configManager.switchAccount(alias)

    // Verify the account is valid by making an API call
    try {
      const accessToken = this.configManager.getAccessToken()
      if (!accessToken) {
        this.error('No access token found for this account. Please log in again.')
      }

      const controlApi = new ControlApi({
        accessToken
      })

      const { user, account } = await controlApi.getMe()
      
      this.log(`Switched to account: ${account.name} (${account.id})`)
      this.log(`User: ${user.email}`)
    } catch (error) {
      this.warn('Switched to account, but the access token may have expired or is invalid.')
      this.log(`Consider logging in again with "ably accounts login --alias ${alias}".`)
    }
  }
} 