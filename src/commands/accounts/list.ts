import chalk from 'chalk'

import { ControlBaseCommand } from '../../control-base-command.js'

export default class AccountsList extends ControlBaseCommand {
  static override description = 'List locally configured Ably accounts'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --pretty-json'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(AccountsList)
    
    // Get all accounts from config
    const accounts = this.configManager.listAccounts()
    const currentAlias = this.configManager.getCurrentAccountAlias()

    if (accounts.length === 0) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          accounts: [],
          error: 'No accounts configured. Use "ably accounts login" to add an account.',
          success: false
        }, flags))
      } else {
        this.log('No accounts configured. Use "ably accounts login" to add an account.')
      }

      return
    }

    if (this.shouldOutputJson(flags)) {
      this.log(this.formatJsonOutput({
        accounts: accounts.map(({ account, alias }) => ({
          alias,
          appsConfigured: account.apps ? Object.keys(account.apps).length : 0,
          currentApp: alias === currentAlias && account.currentAppId ? {
            id: account.currentAppId,
            name: this.configManager.getAppName(account.currentAppId) || account.currentAppId
          } : undefined,
          id: account.accountId || 'Unknown',
          isCurrent: alias === currentAlias,
          name: account.accountName || 'Unknown',
          user: account.userEmail || 'Unknown'
        })),
        currentAccount: currentAlias,
        success: true
      }, flags))
      return
    }

    this.log(`Found ${accounts.length} accounts:\n`)

    for (const { account, alias } of accounts) {
      const isCurrent = alias === currentAlias
      const prefix = isCurrent ? chalk.green('▶ ') : '  '
      const titleStyle = isCurrent ? chalk.green.bold : chalk.bold
      
      this.log(prefix + titleStyle(`Account: ${alias}`) + (isCurrent ? chalk.green(' (current)') : ''))
      this.log(`  Name: ${account.accountName || 'Unknown'} (${account.accountId || 'Unknown'})`)
      this.log(`  User: ${account.userEmail || 'Unknown'}`)
      
      // Count number of apps configured for this account
      const appCount = account.apps ? Object.keys(account.apps).length : 0
      this.log(`  Apps configured: ${appCount}`)
      
      // Show current app if one is selected and this is the current account
      if (isCurrent && account.currentAppId) {
        const appName = this.configManager.getAppName(account.currentAppId) || account.currentAppId
        this.log(`  Current app: ${appName} (${account.currentAppId})`)
      }
      
      this.log('') // Add a blank line between accounts
    }
  }
} 