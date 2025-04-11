import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../../control-base-command.js'
import chalk from 'chalk'

export default class KeysListCommand extends ControlBaseCommand {
  static description = 'List all keys in the app'

  static examples = [
    '$ ably auth keys list',
    '$ ably auth keys list --app APP_ID',
    '$ ably auth keys list --format json'
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID to list keys for (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(KeysListCommand)
    
    // Display authentication information
    this.showAuthInfoIfNeeded(flags)
    
    const controlApi = this.createControlApi(flags)
    
    // Get app ID from flag or current config
    const appId = flags.app || this.configManager.getCurrentAppId()
    
    if (!appId) {
      this.error('No app specified. Please provide --app flag or switch to an app with "ably apps switch".')
    }
    
    try {
      const keys = await controlApi.listKeys(appId)
      
      // Get the current key name for highlighting (app_id.key_Id)
      const currentKeyId = this.configManager.getKeyId(appId)
      const currentKeyName = currentKeyId && currentKeyId.includes('.') 
        ? currentKeyId 
        : currentKeyId ? `${appId}.${currentKeyId}` : undefined
      
      if (flags.format === 'json') {
        // Add a "current" flag to the key if it's the currently selected one
        const keysWithCurrent = keys.map(key => {
          const keyName = `${key.appId}.${key.id}`
          return {
            ...key,
            keyName, // Add the full key name
            current: keyName === currentKeyName
          }
        })
        this.log(JSON.stringify(keysWithCurrent))
      } else {
        if (keys.length === 0) {
          this.log('No keys found for this app')
          return
        }
        
        this.log(`Found ${keys.length} keys for app ${appId}:\n`)
        
        keys.forEach(key => {
          const keyName = `${key.appId}.${key.id}`
          const isCurrent = keyName === currentKeyName
          const prefix = isCurrent ? chalk.green('▶ ') : '  '
          const titleStyle = isCurrent ? chalk.green.bold : chalk.bold
          
          this.log(prefix + titleStyle(`Key Name: ${keyName}`) + (isCurrent ? chalk.green(' (current)') : ''))
          this.log(`  Key Label: ${key.name || 'Unnamed key'}`)
          
          // Format the capabilities
          if (key.capability) {
            const capEntries = Object.entries(key.capability)
            if (capEntries.length === 0) {
              this.log(`  Capabilities: None`)
            } else if (capEntries.length === 1) {
              const [scope, privileges] = capEntries[0]
              this.log(`  Capabilities: ${scope} → ${Array.isArray(privileges) ? privileges.join(', ') : privileges}`)
            } else {
              this.log(`  Capabilities:`)
              capEntries.forEach(([scope, privileges]) => {
                this.log(`    • ${scope} → ${Array.isArray(privileges) ? privileges.join(', ') : privileges}`)
              })
            }
          } else {
            this.log(`  Capabilities: None`)
          }
          
          this.log(`  Created: ${this.formatDate(key.created)}`)
          this.log(`  Updated: ${this.formatDate(key.modified)}`)
          this.log(`  Full key: ${key.key}`)
          this.log('') // Add a blank line between keys
        })
      }
    } catch (error) {
      this.error(`Error listing keys: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 