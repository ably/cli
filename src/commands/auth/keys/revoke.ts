import { Args, Flags } from '@oclif/core'

import { ControlBaseCommand } from '../../../control-base-command.js'

export default class KeysRevokeCommand extends ControlBaseCommand {
  static args = {
    keyName: Args.string({
      description: 'Key name (APP_ID.KEY_ID) of the key to revoke',
      required: true
    })
  }

  static description = 'Revoke an API key (permanently disables the key)'

  static examples = [
    '$ ably auth keys revoke APP_ID.KEY_ID',
    '$ ably auth keys revoke KEY_ID --app APP_ID',
    '$ ably auth keys revoke APP_ID.KEY_ID --force',
    '$ ably auth keys revoke APP_ID.KEY_ID --json',
    '$ ably auth keys revoke APP_ID.KEY_ID --pretty-json'
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID the key belongs to (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
    'force': Flags.boolean({
      default: false,
      description: 'Skip confirmation prompt',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(KeysRevokeCommand)
    
    const controlApi = this.createControlApi(flags)
    
    let appId = flags.app || this.configManager.getCurrentAppId()
    let keyId = args.keyName
    
    // If keyName includes a period, it might be in the app_id.key_id format
    if (args.keyName.includes('.')) {
      const parts = args.keyName.split('.')
      // If it has exactly one period and no colon, it's likely an app_id.key_id
      if (parts.length === 2 && !args.keyName.includes(':')) {
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
      // Get the key details first to show info to the user
      const key = await controlApi.getKey(appId, keyId)
      
      const keyName = `${key.appId}.${key.id}`
      
      if (!this.shouldOutputJson(flags)) {
        this.log(`Key to revoke:`)
        this.log(`Key Name: ${keyName}`)
        this.log(`Key Label: ${key.name || 'Unnamed key'}`)
        this.log(`Full key: ${key.key}`)
        
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
        
        this.log('')
      }
      
      let confirmed = flags.force
      
      if (!confirmed) {
        confirmed = await this.interactiveHelper.confirm(
          'This will permanently revoke this key and any applications using it will stop working. Continue?'
        )
      }
      
      if (!confirmed) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            error: 'Revocation cancelled by user',
            keyName,
            success: false
          }, flags))
        } else {
          this.log('Revocation cancelled.')
        }

        return
      }
      
      await controlApi.revokeKey(appId, keyId)
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          keyName,
          message: 'Key has been revoked',
          success: true
        }, flags))
      } else {
        this.log(`Key ${keyName} has been revoked.`)
      }
      
      // Check if the revoked key is the current key for this app
      const currentKey = this.configManager.getApiKey(appId)
      if (currentKey === key.key) {
        // Ask to delete the key from the config
        const shouldRemove = await this.interactiveHelper.confirm(
          'The revoked key was your current key for this app. Remove it from configuration?'
        )
        
        if (shouldRemove) {
          this.configManager.removeApiKey(appId)
          if (!this.shouldOutputJson(flags)) {
            this.log('Key removed from configuration.')
          }
        }
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
        this.error(`Error revoking key: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
} 