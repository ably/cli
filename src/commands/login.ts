import { Command } from '@oclif/core'
import AccountsLogin from './accounts/login.js'

export default class Login extends Command {
  static override description = 'Log in to your Ably account (alias for "ably accounts login")'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --alias mycompany',
  ]

  static override flags = AccountsLogin.flags
  static override args = AccountsLogin.args

  public async run(): Promise<void> {
    // Run the accounts login command with the same args and flags
    const accountsLogin = new AccountsLogin(this.argv, this.config)
    await accountsLogin.run()
  }
} 