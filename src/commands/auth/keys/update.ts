import { Args, Flags } from '@oclif/core'

import { ControlBaseCommand } from '../../../control-base-command.js'

export default class KeysUpdateCommand extends ControlBaseCommand {
  static args = {
    keyName: Args.string({
      description: 'Key name (APP_ID.KEY_ID) of the key to update',
      required: true
    })
  }

  static description = 'Update a key\'s properties'

  static examples = [
    '$ ably auth keys update APP_ID.KEY_ID --name "New Name"',
    '$ ably auth keys update KEY_ID --app APP_ID --capabilities "publish,subscribe"',
    '$ ably auth keys update APP_ID.KEY_ID --name "New Name" --capabilities "publish,subscribe"'
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID the key belongs to (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
    'capabilities': Flags.string({
      description: 'New capabilities for the key (comma-separated list)',
      required: false,
    }),
    'name': Flags.string({
      description: 'New name for the key',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(KeysUpdateCommand)
    
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
      this.error('No app specified. Please provide --app flag, include APP_ID in the key name, or switch to an app with "ably apps switch".')
    }
    
    // Check if any update flags were provided
    if (!flags.name && !flags.capabilities) {
      this.error('No updates specified. Please provide at least one property to update (--name or --capabilities).')
    }
    
    try {
      // Get original key details
      const originalKey = await controlApi.getKey(appId, keyId)
      
      // Prepare the update data
      const updateData: { capability?: any, name?: string } = {}
      
      if (flags.name) {
        updateData.name = flags.name
      }
      
      if (flags.capabilities) {
        // Parse the capabilities - this depends on how the Control API expects the format
        updateData.capability = flags.capabilities
      }
      
      // Update the key
      const updatedKey = await controlApi.updateKey(appId, keyId, updateData)
      
      const keyName = `${updatedKey.appId}.${updatedKey.id}`
      this.log(`Key Name: ${keyName}`)
      
      if (flags.name) {
        this.log(`Key Label: "${originalKey.name || 'Unnamed key'}" → "${updatedKey.name || 'Unnamed key'}"`)
      }
      
      if (flags.capabilities) {
        this.log(`Capabilities:`)
        this.log(`  Before: ${this.formatCapability(originalKey.capability)}`)
        this.log(`  After:  ${this.formatCapability(updatedKey.capability)}`)
      }
      
    } catch (error) {
      this.error(`Error updating key: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Helper function to format capabilities
  private formatCapability(capability: any): string {
    if (!capability) return 'None';
    
    const capEntries = Object.entries(capability);
    if (capEntries.length === 0) {
      return 'None';
    }
    
    return capEntries.map(([scope, privileges]) => 
      `${scope} → ${Array.isArray(privileges) ? privileges.join(', ') : privileges}`
    ).join('\n    ');
  }
} 