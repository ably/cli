import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'

export default class AppsListCommand extends ControlBaseCommand {
  static description = 'List all apps'

  static examples = [
    '$ ably apps list',
    '$ ably apps list --access-token "YOUR_ACCESS_TOKEN"',
    '$ ably apps list --format json',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AppsListCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      const apps = await controlApi.listApps()
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(apps))
      } else {
        if (apps.length === 0) {
          this.log('No apps found')
          return
        }
        
        this.log(`Found ${apps.length} apps:\n`)
        
        apps.forEach(app => {
          this.log(`App ID: ${app.id}`)
          this.log(`Name: ${app.name}`)
          this.log(`Status: ${app.status}`)
          this.log(`Account ID: ${app.accountId}`)
          this.log(`TLS Only: ${app.tlsOnly ? 'Yes' : 'No'}`)
          this.log(`Created: ${this.formatDate(app.created)}`)
          this.log(`Updated: ${this.formatDate(app.updated)}`)
          if (app.apnsUsesSandboxCert !== undefined) {
            this.log(`APNS Uses Sandbox Cert: ${app.apnsUsesSandboxCert ? 'Yes' : 'No'}`)
          }
          this.log('') // Add a blank line between apps
        })
      }
    } catch (error) {
      this.error(`Error listing apps: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 