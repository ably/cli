import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../../control-base-command.js'

export default class KeysCreateCommand extends ControlBaseCommand {
  static description = 'Create a new API key for an app'

  static examples = [
    '$ ably auth keys create --name "My New Key"',
    '$ ably auth keys create --name "My New Key" --app APP_ID',
    '$ ably auth keys create --name "My New Key" --capabilities "{\\"*\\":[\\\"*\\"]}"',
    '$ ably auth keys create --name "My New Key" --capabilities "{\\"channel1\\":[\\\"publish\\\",\\\"subscribe\\"],\\"channel2\\":[\\\"history\\"]}"',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'name': Flags.string({
      description: 'Name of the key',
      required: true,
    }),
    'app': Flags.string({
      description: 'App ID the key belongs to (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
    'capabilities': Flags.string({
      description: 'JSON string of capabilities for the key, e.g. "{\\"*\\":[\\\"*\\"]}"',
      default: '{"*":["*"]}',
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(KeysCreateCommand)
    
    const controlApi = this.createControlApi(flags)
    
    let appId = flags.app || this.configManager.getCurrentAppId()
    
    if (!appId) {
      this.error('No app specified. Please provide --app flag or switch to an app with "ably apps switch".')
    }
    
    let capabilities
    try {
      capabilities = JSON.parse(flags.capabilities)
    } catch (error) {
      this.error('Invalid capabilities JSON format. Please provide a valid JSON string.')
    }
    
    try {
      this.log(`Creating key "${flags.name}" for app ${appId}...`)
      
      const key = await controlApi.createKey(appId, {
        name: flags.name,
        capability: capabilities,
      })
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(key))
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
            capEntries.forEach(([scope, privileges]) => {
              this.log(`  • ${scope} → ${Array.isArray(privileges) ? privileges.join(', ') : privileges}`)
            })
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
      this.error(`Error creating key: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 