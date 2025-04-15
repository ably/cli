import { Args, Flags } from '@oclif/core'

import { ControlBaseCommand } from '../../../control-base-command.js'

export default class KeysSwitchCommand extends ControlBaseCommand {
  static args = {
    keyNameOrValue: Args.string({
      description: 'Key name (APP_ID.KEY_ID) or full value of the key to switch to',
      required: false
    })
  }

  static description = 'Switch to a different API key for the current app'

  static examples = [
    '$ ably auth keys switch',
    '$ ably auth keys switch APP_ID.KEY_ID',
    '$ ably auth keys switch KEY_ID --app APP_ID'
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID to switch keys for (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(KeysSwitchCommand)
    
    const controlApi = this.createControlApi(flags)
    
    // Get app ID from flag or current config
    let appId = flags.app || this.configManager.getCurrentAppId()
    let keyId: string | undefined = args.keyNameOrValue
    
    // If keyNameOrValue includes a period, it might be in the app_id.key_id format
    if (args.keyNameOrValue && args.keyNameOrValue.includes('.')) {
      const parts = args.keyNameOrValue.split('.')
      // If it has exactly one period and no colon, it's likely an app_id.key_id
      if (parts.length === 2 && !args.keyNameOrValue.includes(':')) {
        appId = parts[0]
        keyId = parts[1]
      }
    }
    
    if (!appId) {
      this.error('No app specified. Please provide --app flag, include APP_ID in the key name, or switch to an app with "ably apps switch".')
    }
    
    try {
      // Get current app name (if available) to preserve it
      const existingAppName = this.configManager.getAppName(appId)
      
      // If key ID or value is provided, switch directly
      if (args.keyNameOrValue && keyId) {
        await this.switchToKey(appId, keyId, controlApi, existingAppName)
        return
      }
      
      // Otherwise, show interactive selection
      this.log('Select a key to switch to:')
      const selectedKey = await this.interactiveHelper.selectKey(controlApi, appId)
      
      if (selectedKey) {
        const keyName = `${appId}.${selectedKey.id}`
        
        // Get app details to ensure we have the app name
        let appName = existingAppName
        
        // Fetch app details if we don't have a name
        if (!appName) {
          try {
            const app = await controlApi.getApp(appId)
            appName = app.name
          } catch {
            // If we can't get the app, continue with just the app ID
            appName = undefined
          }
        }
        
        // Store key with metadata
        this.configManager.storeAppKey(
          appId, 
          selectedKey.key, 
          {
            appName,
            keyId: selectedKey.id,
            keyName: selectedKey.name || 'Unnamed key'
          }
        )
        this.log(`Switched to key: ${selectedKey.name || 'Unnamed key'} (${keyName})`)
      } else {
        this.log('Key switch cancelled.')
      }
    } catch (error) {
      this.error(`Error switching key: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  private async switchToKey(appId: string, keyIdOrValue: string, controlApi: any, existingAppName?: string): Promise<void> {
    try {
      // Verify the key exists and get full details
      const key = await controlApi.getKey(appId, keyIdOrValue)
      
      const keyName = `${appId}.${key.id}`
      
      // Get app details to ensure we have the app name
      let appName = existingAppName
      
      // Fetch app details if we don't have a name
      if (!appName) {
        try {
          const app = await controlApi.getApp(appId)
          appName = app.name
        } catch {
          // If we can't get the app, continue with just the app ID
          appName = undefined
        }
      }
      
      // Save to config with metadata
      this.configManager.storeAppKey(
        appId, 
        key.key, 
        {
          appName,
          keyId: key.id,
          keyName: key.name || 'Unnamed key'
        }
      )
      
      this.log(`Switched to key: ${key.name || 'Unnamed key'} (${keyName})`)
    } catch {
      this.error(`Key "${keyIdOrValue}" not found or access denied.`)
    }
  }
} 