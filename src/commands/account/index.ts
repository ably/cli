import { Command } from '@oclif/core'
import Accounts from '../accounts/index.js'

export default class Account extends Command {
  static override hidden = true
  static override description = 'Alias for "ably accounts"'
  static override flags = Accounts.flags
  static override args = Accounts.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the accounts command
    const command = new Accounts(this.argv, this.config)
    await command.run()
  }
} 