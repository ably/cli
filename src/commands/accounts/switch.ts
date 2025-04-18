import { Args } from '@oclif/core'

import { ControlBaseCommand } from '../../control-base-command.js'
import { ControlApi } from '../../services/control-api.js'

export default class AccountsSwitch extends ControlBaseCommand {
  static override args = {
    alias: Args.string({
      description: 'Alias of the account to switch to',
      required: false
    })
  }

  static override description = 'Switch to a different Ably account'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> mycompany',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --pretty-json'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AccountsSwitch)
    
    // Get available accounts
    const accounts = this.configManager.listAccounts()
    
    if (accounts.length === 0) {
      const error = 'No accounts configured. Use "ably accounts login" to add an account.'
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error,
          success: false
        }, flags))
      } else {
        this.error(error)
      }

      return
    }
    
    // If alias is provided, switch directly
    if (args.alias) {
      await this.switchToAccount(args.alias, accounts, flags)
      return
    }
    
    // Otherwise, show interactive selection if not in JSON mode
    if (this.shouldOutputJson(flags)) {
      const error = 'No account alias provided. Please specify an account alias to switch to.'
      this.log(this.formatJsonOutput({
        availableAccounts: accounts.map(({ account, alias }) => ({
          alias,
          id: account.accountId || 'Unknown',
          name: account.accountName || 'Unknown'
        })),
        error,
        success: false
      }, flags))
      return
    }

    this.log('Select an account to switch to:')
    const selectedAccount = await this.interactiveHelper.selectAccount()
    
    if (selectedAccount) {
      await this.switchToAccount(selectedAccount.alias, accounts, flags)
    } else {
      this.log('Account switch cancelled.')
    }
  }
  
  private async switchToAccount(
    alias: string, 
    accounts: Array<{account: {accountId?: string, accountName?: string}, alias: string}>, 
    flags: Record<string, unknown>
  ): Promise<void> {
    // Check if account exists
    const accountExists = accounts.some(account => account.alias === alias)

    if (!accountExists) {
      const error = `Account with alias "${alias}" not found. Use "ably accounts list" to see available accounts.`
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          availableAccounts: accounts.map(({ account, alias }) => ({
            alias,
            id: account.accountId || 'Unknown',
            name: account.accountName || 'Unknown'
          })),
          error,
          success: false
        }, flags))
      } else {
        this.error(error)
      }

      return
    }

    // Switch to the account
    this.configManager.switchAccount(alias)

    // Verify the account is valid by making an API call
    try {
      const accessToken = this.configManager.getAccessToken()
      if (!accessToken) {
        const error = 'No access token found for this account. Please log in again.'
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            error,
            success: false
          }, flags))
        } else {
          this.error(error)
        }

        return
      }

      const controlApi = new ControlApi({
        accessToken,
        controlHost: flags['control-host'] as string | undefined
      })

      const { account, user } = await controlApi.getMe()
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          account: {
            alias,
            id: account.id,
            name: account.name,
            user: {
              email: user.email
            }
          },
          success: true
        }, flags))
      } else {
        this.log(`Switched to account: ${account.name} (${account.id})`)
        this.log(`User: ${user.email}`)
      }
    } catch {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          account: { alias },
          error: 'Access token may have expired or is invalid.',
          success: false
        }, flags))
      } else {
        this.warn('Switched to account, but the access token may have expired or is invalid.')
        this.log(`Consider logging in again with "ably accounts login --alias ${alias}".`)
      }
    }
  }
} 