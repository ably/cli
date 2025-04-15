import { Flags } from '@oclif/core'

import { ControlBaseCommand } from '../../../control-base-command.js'

export default class KeysCreateCommand extends ControlBaseCommand {
  static description = 'Create a new API key for an app'

  static examples = [
    `$ ably auth keys create --name "My New Key"`,
    `$ ably auth keys create --name "My New Key" --app APP_ID`,
    `$ ably auth keys create --name "My New Key" --capabilities '{"*":["*"]}'`,
    `$ ably auth keys create --name "My New Key" --capabilities '{"channel1":["publish","subscribe"],"channel2":["history"]}'`,
    `$ ably auth keys create --name "My New Key" --json`,
    `$ ably auth keys create --name "My New Key" --pretty-json`,
    `$ ably auth keys create --app <appId> --name "MyKey" --capabilities '{"channel:*":["publish"]}'`,
    `$ ably auth keys create --app <appId> --name "MyOtherKey" --capabilities '{"channel:chat-*":["subscribe"],"channel:updates":["publish"]}' --ttl 86400`,
    `$ ably auth keys create --name "My New Key" --capabilities '{"channel1":["publish","subscribe"],"channel2":["history"]}'`,
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID the key belongs to (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
    'capabilities': Flags.string({
      default: '{"*":["*"]}',
      description: `Capability object as a JSON string. Example: '{"channel:*":["publish"]}'`,
    }),
    'name': Flags.string({
      description: 'Name of the key',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(KeysCreateCommand)
    
    const controlApi = this.createControlApi(flags)
    
    const appId = flags.app || this.configManager.getCurrentAppId()
    
    if (!appId) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: 'No app specified. Please provide --app flag or switch to an app with "ably apps switch".',
          success: false
        }, flags))
      } else {
        this.error('No app specified. Please provide --app flag or switch to an app with "ably apps switch".')
      }

      return
    }
    
    let capabilities
    try {
      capabilities = JSON.parse(flags.capabilities)
    } catch {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: 'Invalid capabilities JSON format. Please provide a valid JSON string.',
          success: false
        }, flags))
      } else {
        this.error('Invalid capabilities JSON format. Please provide a valid JSON string.')
      }

      return
    }
    
    try {
      if (!this.shouldOutputJson(flags)) {
        this.log(`Creating key "${flags.name}" for app ${appId}...`)
      }
      
      const key = await controlApi.createKey(appId, {
        capability: capabilities,
        name: flags.name,
      })
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          key: {
            ...key,
            keyName: `${key.appId}.${key.id}`
          },
          success: true
        }, flags))
      } else {
        this.log(`\nKey created successfully!`)
        
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
        
        // Tell the user how to switch to this key instead of doing it automatically
        this.log(`\nTo switch to this key, run: ably auth keys switch ${keyName}`)
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          appId,
          error: error instanceof Error ? error.message : String(error),
          success: false
        }, flags))
      } else {
        this.error(`Error creating key: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
} 