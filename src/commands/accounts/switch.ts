import { Args } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import { ControlApi } from '../../services/control-api.js'
import * as readline from 'readline'

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
    const currentAlias = this.configManager.getCurrentAccountAlias()
    
    if (accounts.length === 0) {
      this.error('No accounts configured. Use "ably accounts login" to add an account.')
    }
    
    // If alias is provided, switch directly
    if (args.alias) {
      await this.switchToAccount(args.alias, accounts)
      return
    }
    
    // Otherwise, show interactive selection
    this.log('Available accounts:')
    
    accounts.forEach((account, index) => {
      const isCurrent = account.alias === currentAlias
      const currentMarker = isCurrent ? '* ' : '  '
      const accountInfo = account.account.accountName || account.account.accountId || 'Unknown'
      const userInfo = account.account.userEmail || 'Unknown'
      
      this.log(`${currentMarker}${index + 1}. ${account.alias} (${accountInfo}, ${userInfo})`)
    })
    
    // Prompt user to select an account
    const selectedIndex = await this.promptForSelection(accounts.length)
    if (selectedIndex !== null) {
      const selectedAccount = accounts[selectedIndex]
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
  
  private promptForSelection(max: number): Promise<number | null> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question('\nSelect an account (1-' + max + ') or press Enter to cancel: ', (answer) => {
        rl.close()
        
        if (!answer.trim()) {
          resolve(null)
          return
        }
        
        const selected = parseInt(answer.trim(), 10)
        
        if (isNaN(selected) || selected < 1 || selected > max) {
          this.log('Invalid selection. Please try again.')
          resolve(null)
        } else {
          resolve(selected - 1) // Convert to 0-based index
        }
      })
    })
  }
} 