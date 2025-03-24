import { Command } from '@oclif/core'
import AccountsList from '../accounts/list.js'

export default class AccountList extends Command {
  static override hidden = true
  static override description = 'Alias for "ably accounts list"'
  static override flags = AccountsList.flags
  static override args = AccountsList.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the accounts list command
    const command = new AccountsList(this.argv, this.config)
    await command.run()
  }
} 