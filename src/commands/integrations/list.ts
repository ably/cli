import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import chalk from 'chalk'

export default class IntegrationsListCommand extends ControlBaseCommand {
  static description = 'List all integration rules'

  static examples = [
    '$ ably integrations list',
    '$ ably integrations list --app "My App" --format json',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
    'app': Flags.string({
      description: 'App ID or name to list integration rules for',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(IntegrationsListCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.getAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      const rules = await controlApi.listRules(appId)
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(rules))
      } else {
        if (rules.length === 0) {
          this.log('No integration rules found')
          return
        }
        
        this.log(`Found ${rules.length} integration rules:\n`)
        
        rules.forEach(rule => {
          this.log(chalk.bold(`Rule ID: ${rule.id}`))
          this.log(`  App ID: ${rule.appId}`)
          this.log(`  Type: ${rule.ruleType}`)
          this.log(`  Request Mode: ${rule.requestMode}`)
          this.log(`  Status: ${rule.status}`)
          this.log(`  Source:`)
          this.log(`    Type: ${rule.source.type}`)
          this.log(`    Channel Filter: ${rule.source.channelFilter || '(none)'}`)
          this.log(`  Target: ${JSON.stringify(rule.target, null, 2).replace(/\n/g, '\n    ')}`)
          this.log(`  Version: ${rule.version}`)
          this.log(`  Created: ${this.formatDate(rule.created)}`)
          this.log(`  Updated: ${this.formatDate(rule.modified)}`)
          this.log('') // Add a blank line between rules
        })
      }
    } catch (error) {
      this.error(`Error listing integration rules: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 