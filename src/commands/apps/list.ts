import { ControlBaseCommand } from '../../control-base-command.js'
import chalk from 'chalk'
import { Flags } from '@oclif/core'

export default class AppsList extends ControlBaseCommand {
  static override description = 'List all apps in the current account'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --format json'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AppsList)
    
    await this.runControlCommand(
      flags,
      async (controlApi) => {
        const apps = await controlApi.listApps()
        
        // Get current app ID from config
        const currentAppId = this.configManager.getCurrentAppId()
        
        if (flags.format === 'json') {
          // Mark current app in JSON output
          const appsWithCurrentFlag = apps.map(app => ({
            ...app,
            isCurrent: app.id === currentAppId
          }))
          
          this.log(JSON.stringify(appsWithCurrentFlag, null, 2))
          return
        }
        
        if (apps.length === 0) {
          this.log('No apps found in this account.')
          return
        }
        
        this.log(`Found ${apps.length} apps:\n`)
        
        // Sort apps so current app is first, then alphabetically by name
        const sortedApps = [...apps].sort((a, b) => {
          // Current app first
          if (a.id === currentAppId) return -1
          if (b.id === currentAppId) return 1
          
          // Then alphabetically by name
          return (a.name || '').localeCompare(b.name || '')
        })
        
        sortedApps.forEach(app => {
          const isCurrent = app.id === currentAppId
          const prefix = isCurrent ? chalk.green('▶ ') : '  '
          const nameStyle = isCurrent ? chalk.green.bold : chalk.white
          
          this.log(`${prefix}App ID: ${nameStyle(app.id)}${isCurrent ? ' (current)' : ''}`)
          this.log(`  Name: ${app.name || 'Unnamed App'}`)
          this.log(`  Status: ${app.status}`)
          this.log(`  Account ID: ${app.accountId}`)
          this.log(`  TLS Only: ${app.tlsOnly ? 'Yes' : 'No'}`)
          
          if (app.created) {
            this.log(`  Created: ${this.formatDate(app.created)}`)
          }
          
          if (app.modified) {
            this.log(`  Updated: ${this.formatDate(app.modified)}`)
          }
          
          this.log('') // Add a blank line between apps
        })
      },
      'Error listing apps'
    )
  }
} 