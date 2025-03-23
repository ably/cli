import { ControlBaseCommand } from '../../control-base-command.js'

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

    this.log('Locally configured accounts:')
    this.log('-------------------')

    for (const { alias, account } of accounts) {
      const isCurrent = alias === currentAlias
      const currentMarker = isCurrent ? '* ' : '  '

      this.log(`${currentMarker}${alias !== 'default' ? alias : 'default'}:`)
      this.log(`  Account: ${account.accountName || 'Unknown'} (${account.accountId || 'Unknown'})`)
      this.log(`  User: ${account.userEmail || 'Unknown'}`)
      
      // Count number of apps configured for this account
      const appCount = account.apps ? Object.keys(account.apps).length : 0
      this.log(`  Apps configured: ${appCount}`)
      
      this.log('')
    }

    if (currentAlias) {
      this.log(`Current account: ${currentAlias}`)
    } else {
      this.log('No account is currently selected.')
    }
  }
} 