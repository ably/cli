import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'

export default class AppsCreateCommand extends ControlBaseCommand {
  static description = 'Create a new app'

  static examples = [
    '$ ably apps create --name "My New App"',
    '$ ably apps create --name "My New App" --tls-only',
    '$ ably apps create --name "My New App" --access-token "YOUR_ACCESS_TOKEN"',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'name': Flags.string({
      description: 'Name of the app',
      required: true,
    }),
    'tls-only': Flags.boolean({
      description: 'Whether the app should accept TLS connections only',
      default: false,
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AppsCreateCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      this.log(`Creating app "${flags.name}"...`)
      
      const app = await controlApi.createApp({
        name: flags.name,
        tlsOnly: flags['tls-only'],
      })
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(app))
      } else {
        this.log(`\nApp created successfully!`)
        this.log(`App ID: ${app.id}`)
        this.log(`Name: ${app.name}`)
        this.log(`Status: ${app.status}`)
        this.log(`Account ID: ${app.accountId}`)
        this.log(`TLS Only: ${app.tlsOnly ? 'Yes' : 'No'}`)
        this.log(`Created: ${this.formatDate(app.created)}`)
        this.log(`Updated: ${this.formatDate(app.modified)}`)
      }
      
      // Automatically switch to the newly created app
      this.configManager.setCurrentApp(app.id)
      this.configManager.storeAppInfo(app.id, { appName: app.name })
      this.log(`\nAutomatically switched to app: ${app.name} (${app.id})`)
    } catch (error) {
      this.error(`Error creating app: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 