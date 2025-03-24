import { ControlBaseCommand } from '../../control-base-command.js'
import chalk from 'chalk'

export default class AccountsList extends ControlBaseCommand {
  static override description = 'List locally configured Ably accounts'

  static override examples = [
    '<%= config.bin %> <%= command.id %>'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
  }

  public async run(): Promise<void> {
    // Get all accounts from config
    const accounts = this.configManager.listAccounts()
    const currentAlias = this.configManager.getCurrentAccountAlias()

    if (accounts.length === 0) {
      this.log('No accounts configured. Use "ably accounts login" to add an account.')
      return
    }

    this.log(`Found ${accounts.length} accounts:\n`)

    for (const { alias, account } of accounts) {
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