import { Args, Flags } from '@oclif/core'

import { ControlBaseCommand } from '../../../control-base-command.js'

export default class KeysGetCommand extends ControlBaseCommand {
  static args = {
    keyNameOrValue: Args.string({
      description: 'Key name (APP_ID.KEY_ID) or full value of the key to get details for',
      required: true
    })
  }

  static description = 'Get details for a specific key'

  static examples = [
    '$ ably auth keys get APP_ID.KEY_ID',
    '$ ably auth keys get KEY_ID --app APP_ID',
    '$ ably auth keys get APP_ID.KEY_ID --json',
    '$ ably auth keys get APP_ID.KEY_ID --pretty-json']

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID the key belongs to (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(KeysGetCommand)
    
    // Display authentication information
    this.showAuthInfoIfNeeded(flags)
    
    const controlApi = this.createControlApi(flags)
    
    let appId = flags.app || this.configManager.getCurrentAppId()
    let keyId = args.keyNameOrValue
    
    // If keyNameOrValue includes a period, it might be in the app_id.key_id format
    if (args.keyNameOrValue.includes('.')) {
      const parts = args.keyNameOrValue.split('.')
      // If it has exactly one period and no colon, it's likely an app_id.key_id
      if (parts.length === 2 && !args.keyNameOrValue.includes(':')) {
        appId = parts[0]
        keyId = parts[1]
      }
    }
    
    if (!appId) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: 'No app specified. Please provide --app flag, include APP_ID in the key name, or switch to an app with "ably apps switch".',
          success: false
        }, flags))
      } else {
        this.error('No app specified. Please provide --app flag, include APP_ID in the key name, or switch to an app with "ably apps switch".')
      }

      return
    }
    
    try {
      const key = await controlApi.getKey(appId, keyId)
      
      if (this.shouldOutputJson(flags)) {
        // Add the full key name to the JSON output
        this.log(this.formatJsonOutput({
          key: {
            ...key,
            keyName: `${key.appId}.${key.id}`
          },
          success: true
        }, flags))
      } else {
        this.log(`Key Details:\n`)
        
        const keyName = `${key.appId}.${key.id}`
        this.log(`Key Name: ${keyName}`)
        this.log(`Key Label: ${key.name || 'Unnamed key'}`)
        
        // Format the capabilities
        if (key.capability) {
          const capEntries = Object.entries(key.capability)
          if (capEntries.length === 0) {
            this.log(`Capabilities: None`)
          } else if (capEntries.length === 1) {
            const [scope, privileges] = capEntries[0]
            this.log(`Capabilities: ${scope} → ${Array.isArray(privileges) ? privileges.join(', ') : privileges}`)
          } else {
            this.log(`Capabilities:`)
            for (const [scope, privileges] of capEntries) {
              this.log(`  • ${scope} → ${Array.isArray(privileges) ? privileges.join(', ') : privileges}`)
            }
          }
        } else {
          this.log(`Capabilities: None`)
        }
        
        this.log(`Created: ${this.formatDate(key.created)}`)
        this.log(`Updated: ${this.formatDate(key.modified)}`)
        this.log(`Full key: ${key.key}`)
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          appId,
          error: error instanceof Error ? error.message : String(error),
          keyId,
          success: false
        }, flags))
      } else {
        this.error(`Error getting key details: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
} 