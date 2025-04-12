import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../../control-base-command.js'
import chalk from 'chalk'

export default class KeysListCommand extends ControlBaseCommand {
  static description = 'List all keys in the app'

  static examples = [
    '$ ably auth keys list',
    '$ ably auth keys list --app APP_ID',
    '$ ably auth keys list --json',
    '$ ably auth keys list --pretty-json']

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID to list keys for (uses current app if not specified)',
      env: 'ABLY_APP_ID',
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
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: 'No app specified. Please provide --app flag or switch to an app with "ably apps switch".'
        }, flags))
      } else {
        this.error('No app specified. Please provide --app flag or switch to an app with "ably apps switch".')
      }
      return
    }
    
    try {
      const keys = await controlApi.listKeys(appId)
      
      // Get the current key name for highlighting (app_id.key_Id)
      const currentKeyId = this.configManager.getKeyId(appId)
      const currentKeyName = currentKeyId && currentKeyId.includes('.') 
        ? currentKeyId 
        : currentKeyId ? `${appId}.${currentKeyId}` : undefined
      
      if (this.shouldOutputJson(flags)) {
        // Add a "current" flag to the key if it's the currently selected one
        const keysWithCurrent = keys.map(key => {
          const keyName = `${key.appId}.${key.id}`
          return {
            ...key,
            keyName, // Add the full key name
            current: keyName === currentKeyName
          }
        })
        this.log(this.formatJsonOutput({
          success: true,
          appId,
          keys: keysWithCurrent
        }, flags))
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
          
          this.log('')
        })
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          appId
        }, flags))
      } else {
        this.error(`Error listing keys: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
} 