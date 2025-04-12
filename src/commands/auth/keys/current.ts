import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../../control-base-command.js'
import chalk from 'chalk'

export default class KeysCurrentCommand extends ControlBaseCommand {
  static description = 'Show the current API key for the selected app'

  static examples = [
    '$ ably auth keys current',
    '$ ably auth keys current --app APP_ID',
    '$ ably auth keys current --json',
    '$ ably auth keys current --pretty-json']

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID to check key for (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
    
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(KeysCurrentCommand)
    
    // Special handling for web CLI mode
    if (this.isWebCliMode) {
      return this.handleWebCliMode(flags)
    }
    
    // Get app ID from flag or current config
    const appId = flags.app || this.configManager.getCurrentAppId()
    
    if (!appId) {
      this.error('No app specified. Please provide --app flag or switch to an app with "ably apps switch".')
    }
    
    // Get the current key for this app
    const apiKey = this.configManager.getApiKey(appId)
    
    if (!apiKey) {
      this.error(`No API key configured for app ${appId}. Use "ably auth keys switch" to select a key.`)
    }
    
    // Extract the key ID (part before the colon)
    const keyId = this.configManager.getKeyId(appId) || apiKey.split(':')[0]
    const keyLabel = this.configManager.getKeyName(appId) || 'Unnamed key'
    const appName = this.configManager.getAppName(appId) || appId
    
    // Format the full key name (app_id.key_id)
    const keyName = keyId.includes('.') ? keyId : `${appId}.${keyId.split('.')[1] || keyId}`
    
    if (this.shouldOutputJson(flags)) {
      this.log(this.formatJsonOutput({
        app: {
          id: appId,
          name: appName
        },
        key: {
          id: keyName,
          label: keyLabel,
          value: apiKey
        }
      }, flags))
    } else {
      const currentAccount = this.configManager.getCurrentAccount()
      const currentAccountAlias = this.configManager.getCurrentAccountAlias()
      
      this.log(`${chalk.cyan('Account:')} ${chalk.cyan.bold(currentAccount?.accountName || currentAccountAlias)} ${chalk.gray(`(${currentAccount?.accountId || 'Unknown ID'})`)}`)
      this.log(`${chalk.green('App:')} ${chalk.green.bold(appName)} ${chalk.gray(`(${appId})`)}`)
      this.log(`${chalk.yellow('API Key:')} ${chalk.yellow.bold(keyName)}`)
      this.log(`${chalk.yellow('Key Value:')} ${chalk.yellowBright(apiKey)}`)
      this.log(`${chalk.yellow('Key Label:')} ${chalk.yellow.bold(keyLabel)}`)
    }
  }
  
  /**
   * Handle the command in web CLI mode by extracting API key from environment variables
   */
  private async handleWebCliMode(flags: any): Promise<void> {
    // Extract API key from environment variable
    const apiKey = process.env.ABLY_API_KEY
    if (!apiKey) {
      this.error('ABLY_API_KEY environment variable is not set')
    }

    // Parse components from the API key
    const appId = apiKey.split('.')[0]
    const keyComponents = apiKey.split(':')[0].split('.')
    const keyId = keyComponents.length > 1 ? keyComponents[1] : null
    const keyName = `${appId}.${keyId || ''}`
    
    if (this.shouldOutputJson(flags)) {
      this.log(this.formatJsonOutput({
        app: {
          id: appId
        },
        key: {
          id: keyName,
          label: 'Web CLI Key',
          value: apiKey
        },
        mode: 'web-cli'
      }, flags))
    } else {
      // Get account info if possible
      let accountName = 'Web CLI Account'
      let accountId = ''
      
      try {
        const controlApi = this.createControlApi(flags)
        const { user, account } = await controlApi.getMe()
        accountName = account.name
        accountId = account.id
      } catch (error) {
        // If we can't get account details, just use default values
      }
      
      this.log(`${chalk.cyan('Account:')} ${chalk.cyan.bold(accountName)} ${accountId ? chalk.gray(`(${accountId})`) : ''}`)
      this.log(`${chalk.green('App:')} ${chalk.green.bold(appId)}`)
      this.log(`${chalk.yellow('API Key:')} ${chalk.yellow.bold(keyName)}`)
      this.log(`${chalk.yellow('Key Value:')} ${chalk.yellowBright(apiKey)}`)
      this.log(`${chalk.magenta('Mode:')} ${chalk.magenta.bold('Web CLI')} ${chalk.dim('(using environment variables)')}`)
    }
  }
} 