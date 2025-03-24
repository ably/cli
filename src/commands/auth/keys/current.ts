import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../../control-base-command.js'
import chalk from 'chalk'

export default class KeysCurrentCommand extends ControlBaseCommand {
  static description = 'Show the current API key for the selected app'

  static examples = [
    '$ ably auth keys current',
    '$ ably auth keys current --app APP_ID',
    '$ ably auth keys current --format json'
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID to check key for (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(KeysCurrentCommand)
    
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
    
    if (flags.format === 'json') {
      this.log(JSON.stringify({
        app: {
          id: appId,
          name: appName
        },
        key: {
          keyName,
          label: keyLabel
        }
      }))
    } else {
      const currentAccount = this.configManager.getCurrentAccount()
      const currentAccountAlias = this.configManager.getCurrentAccountAlias()
      
      this.log(chalk.bold(`Account: ${currentAccount?.accountName || currentAccountAlias} (${currentAccount?.accountId || 'Unknown ID'})`))
      this.log(chalk.bold(`App: ${appName} (${appId})`))
      this.log(chalk.bold(`Current API Key Name: ${keyName}`))
      this.log(chalk.bold(`Key Label: ${keyLabel}`))
    }
  }
} 