import { Args, Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import { ControlApi } from '../../services/control-api.js'
import { execSync } from 'child_process'
import * as readline from 'readline'
import chalk from 'chalk'
import { displayLogo } from '../../utils/logo.js'

export default class AccountsLogin extends ControlBaseCommand {
  static override description = 'Log in to your Ably account'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --alias mycompany',
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
    alias: Flags.string({
      char: 'a',
      description: 'Alias for this account (default account if not specified)',
    }),
    'no-browser': Flags.boolean({
      description: 'Do not open a browser',
      default: false,
    }),
  }

  static override args = {
    token: Args.string({
      description: 'Access token (if not provided, will prompt for it)',
      required: false,
    }),
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AccountsLogin)

    // Display ASCII art logo
    displayLogo(this.log.bind(this))

    let accessToken: string
    if (args.token) {
      accessToken = args.token
    } else {
      let obtainTokenPath = 'https://ably.com/users/access_tokens';
      if (flags['control-host']) {
        this.log('Using control host:', flags['control-host'])
        if (flags['control-host'].includes('local')) {
          obtainTokenPath = `http://${flags['control-host']}/users/access_tokens`
        } else {
          obtainTokenPath = `https://${flags['control-host']}/users/access_tokens`
        }
      }
      // Prompt the user to get a token
      if (!flags['no-browser']) {
        this.log('Opening browser to get an access token...')
        this.openBrowser(obtainTokenPath)
      } else {
        this.log(`Please visit ${obtainTokenPath} to create an access token`)
      }

      accessToken = await this.promptForToken()
    }

    // If no alias flag provided, prompt the user if they want to provide one
    let alias = flags.alias
    if (!alias) {
      // Check if the default account already exists
      const accounts = this.configManager.listAccounts()
      const hasDefaultAccount = accounts.some(account => account.alias === 'default')
      
      if (hasDefaultAccount) {
        // Explain to the user the implications of not providing an alias
        this.log('\nYou have not specified an alias for this account.')
        this.log('If you continue without an alias, your existing default account configuration will be overwritten.')
        this.log('To maintain multiple account profiles, please provide an alias.')
        
        // Ask if they want to provide an alias
        const shouldProvideAlias = await this.promptYesNo('Would you like to provide an alias for this account?')
        
        if (shouldProvideAlias) {
          alias = await this.promptForAlias()
        } else {
          alias = 'default'
          this.log('No alias provided. The default account configuration will be overwritten.')
        }
      } else {
        // No default account exists yet, but still offer to set an alias
        this.log('\nYou have not specified an alias for this account.')
        this.log('Using an alias allows you to maintain multiple account profiles that you can switch between.')
        
        // Ask if they want to provide an alias
        const shouldProvideAlias = await this.promptYesNo('Would you like to provide an alias for this account?')
        
        if (shouldProvideAlias) {
          alias = await this.promptForAlias()
        } else {
          alias = 'default'
          this.log('No alias provided. This will be set as your default account.')
        }
      }
    }

    try {
      // Fetch account information
      const controlApi = new ControlApi({
        accessToken,
        controlHost: flags['control-host']
      })

      const { user, account } = await controlApi.getMe()

      // Store the account information
      this.configManager.storeAccount(accessToken, alias, {
        tokenId: 'unknown', // Token ID is not returned by getMe(), would need additional API if needed
        userEmail: user.email,
        accountId: account.id,
        accountName: account.name
      })

      this.log(`Successfully logged in to ${chalk.cyan(account.name)} (account ID: ${chalk.greenBright(account.id)})`)
      
      if (alias !== 'default') {
        this.log(`Account stored with alias: ${alias}`)
      }
      
      // Switch to this account
      this.configManager.switchAccount(alias)
      this.log(`Account ${chalk.cyan(alias)} is now the current account`)
      
    } catch (error) {
      this.error(`Failed to authenticate: ${error}`)
    }
  }

  private openBrowser(url: string): void {
    try {
      const command = process.platform === 'darwin' ? 'open' :
                      process.platform === 'win32' ? 'start' :
                      'xdg-open'

      execSync(`${command} ${url}`)
    } catch (error) {
      this.warn(`Failed to open browser: ${error}`)
      this.log(`Please visit ${url} manually to create an access token`)
    }
  }

  private promptForToken(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question('\nEnter your access token: ', (token) => {
        rl.close()
        resolve(token.trim())
      })
    })
  }
  
  private promptForAlias(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      const validateAndGetAlias = (input: string): string | null => {
        const trimmedAlias = input.trim()
        if (!trimmedAlias) {
          return null
        }

        // Convert to lowercase for case-insensitive comparison
        const lowercaseAlias = trimmedAlias.toLowerCase()

        // First character must be a letter
        if (!/^[a-z]/.test(lowercaseAlias)) {
          this.log('Error: Alias must start with a letter')
          return null
        }

        // Only allow letters, numbers, dashes, and underscores after first character
        if (!/^[a-z][a-z0-9_-]*$/.test(lowercaseAlias)) {
          this.log('Error: Alias can only contain letters, numbers, dashes, and underscores')
          return null
        }

        return lowercaseAlias
      }

      const askForAlias = () => {
        rl.question('Enter an alias for this account (e.g. "dev", "production", "personal"): ', (alias) => {
          const validatedAlias = validateAndGetAlias(alias)
          
          if (validatedAlias === null) {
            if (!alias.trim()) {
              // If they don't enter anything, use default
              this.log('No alias provided. Using "default" instead.')
              rl.close()
              resolve('default')
            } else {
              // If validation failed, ask again
              askForAlias()
            }
          } else {
            rl.close()
            resolve(validatedAlias)
          }
        })
      }

      askForAlias()
    })
  }
  
  private promptYesNo(question: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(`${question} (y/N): `, (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y')
      })
    })
  }
} 