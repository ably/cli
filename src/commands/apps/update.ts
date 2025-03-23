import { Args, Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'

export default class AppsUpdateCommand extends ControlBaseCommand {
  static description = 'Update an app'

  static examples = [
    '$ ably apps update app-id --name "Updated App Name"',
    '$ ably apps update app-id --tls-only',
    '$ ably apps update app-id --name "Updated App Name" --tls-only',
    '$ ably apps update app-id --name "Updated App Name" --access-token "YOUR_ACCESS_TOKEN"',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'name': Flags.string({
      description: 'New name for the app',
    }),
    'tls-only': Flags.boolean({
      description: 'Whether the app should accept TLS connections only',
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  static args = {
    id: Args.string({
      description: 'App ID to update',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsUpdateCommand)
    
    // Ensure at least one update parameter is provided
    if (flags.name === undefined && flags['tls-only'] === undefined) {
      this.error('At least one update parameter (--name or --tls-only) must be provided')
      return
    }
    
    const controlApi = this.createControlApi(flags)
    
    try {
      this.log(`Updating app ${args.id}...`)
      
      const updateData: { name?: string; tlsOnly?: boolean } = {}
      
      if (flags.name !== undefined) {
        updateData.name = flags.name
      }
      
      if (flags['tls-only'] !== undefined) {
        updateData.tlsOnly = flags['tls-only']
      }
      
      const app = await controlApi.updateApp(args.id, updateData)
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(app))
      } else {
        this.log(`\nApp updated successfully!`)
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
      }
    } catch (error) {
      this.error(`Error updating app: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 