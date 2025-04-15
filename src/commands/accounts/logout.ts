import { Args, Flags } from '@oclif/core'
import * as readline from 'node:readline'

import { ControlBaseCommand } from '../../control-base-command.js'

export default class AccountsLogout extends ControlBaseCommand {
  static override args = {
    alias: Args.string({
      description: 'Alias of the account to log out from (defaults to current account)',
      required: false,
    }),
  }

  static override description = 'Log out from an Ably account'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> mycompany',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --pretty-json'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force logout without confirmation',
    }),
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AccountsLogout)
    
    // Determine which account to log out from
    const targetAlias = args.alias || this.configManager.getCurrentAccountAlias()
    
    if (!targetAlias) {
      const error = 'No account is currently selected and no alias provided. Use "ably accounts list" to see available accounts.'
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

    const accounts = this.configManager.listAccounts()
    const accountExists = accounts.some(account => account.alias === targetAlias)

    if (!accountExists) {
      const error = `Account with alias "${targetAlias}" not found. Use "ably accounts list" to see available accounts.`
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
    
    // Get confirmation unless force flag is used or in JSON mode
    if (!flags.force && !this.shouldOutputJson(flags)) {
      const confirmed = await this.confirmLogout(targetAlias)
      if (!confirmed) {
        this.log('Logout canceled.')
        return
      }
    }
    
    // Remove the account
    const success = this.configManager.removeAccount(targetAlias)
    
    if (success) {
      // Get remaining accounts for the response
      const remainingAccounts = this.configManager.listAccounts()
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          account: {
            alias: targetAlias
          },
          remainingAccounts: remainingAccounts.map(account => account.alias),
          success: true
        }, flags))
      } else {
        this.log(`Successfully logged out from account ${targetAlias}.`)
        
        // Suggest switching to another account if there are any left
        if (remainingAccounts.length > 0) {
          this.log(`Use "ably accounts switch ${remainingAccounts[0].alias}" to select another account.`)
        } else {
          this.log('No remaining accounts. Use "ably accounts login" to log in to an account.')
        }
      }
    } else {
      const error = `Failed to log out from account ${targetAlias}.`
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error,
          success: false
        }, flags))
      } else {
        this.error(error)
      }
    }
  }
  
  private confirmLogout(alias: string): Promise<boolean> {
    this.log(`Warning: Logging out will remove all configuration for account "${alias}".`)
    this.log('This includes access tokens and any app configurations associated with this account.')
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question('Are you sure you want to proceed? (y/N): ', (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y')
      })
    })
  }
} 