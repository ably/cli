import { Command } from '@oclif/core'
import AccountsCommand from '../accounts/index.js'

// Completely standalone version that doesn't reference any other commands
export default class Account extends Command {
  static override hidden = true
  static override description = 'Alias for "ably accounts"'
  static override flags = AccountsCommand.flags
  static override args = AccountsCommand.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the accounts command using static run method
    await AccountsCommand.run(this.argv, this.config)
  }
} 