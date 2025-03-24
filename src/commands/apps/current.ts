import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import chalk from 'chalk'

export default class AppsCurrent extends ControlBaseCommand {
  static override description = 'Show the currently selected app'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --format json'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppsCurrent)
    
    // Get the current account and app
    const currentAccountAlias = this.configManager.getCurrentAccountAlias()
    const currentAccount = this.configManager.getCurrentAccount()
    const currentAppId = this.configManager.getCurrentAppId()
    
    if (!currentAccountAlias || !currentAccount) {
      this.error('No account selected. Use "ably accounts switch" to select an account.')
    }
    
    if (!currentAppId) {
      this.error('No app selected. Use "ably apps switch" to select an app.')
    }
    
    // Get app name from local config
    const appName = this.configManager.getAppName(currentAppId) || currentAppId
    
    try {
      if (flags.format === 'json') {
        // Get key information for JSON output
        const apiKey = this.configManager.getApiKey(currentAppId)
        let keyInfo = null
        
        if (apiKey) {
          const keyId = this.configManager.getKeyId(currentAppId) || apiKey.split(':')[0]
          const keyLabel = this.configManager.getKeyName(currentAppId) || 'Unnamed key'
          const keyName = keyId.includes('.') ? keyId : `${currentAppId}.${keyId.split('.')[1] || keyId}`
          
          keyInfo = {
            keyName,
            label: keyLabel
          }
        }
        
        this.log(JSON.stringify({
          account: {
            alias: currentAccountAlias,
            ...currentAccount
          },
          app: {
            id: currentAppId,
            name: appName
          },
          key: keyInfo
        }))
      } else {
        this.log(chalk.bold(`Account: ${currentAccount.accountName || currentAccountAlias} (${currentAccount.accountId || 'Unknown ID'})`))
        this.log(chalk.bold(`Current App: ${appName} (${currentAppId})`))
        
        // Show the currently selected API key if one is set
        const apiKey = this.configManager.getApiKey(currentAppId)
        if (apiKey) {
          // Extract the key ID and format the full key name (app_id.key_id)
          const keyId = this.configManager.getKeyId(currentAppId) || apiKey.split(':')[0]
          const keyLabel = this.configManager.getKeyName(currentAppId) || 'Unnamed key'
          
          // Format the full key name (app_id.key_id)
          const keyName = keyId.includes('.') ? keyId : `${currentAppId}.${keyId.split('.')[1] || keyId}`
          
          this.log(chalk.bold(`Current API Key Name: ${keyName}`))
          this.log(chalk.bold(`Key Label: ${keyLabel}`))
        } else {
          this.log('No API key selected. Use "ably auth keys switch" to select a key.')
        }
      }
    } catch (error) {
      this.error(`Error retrieving app information: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 