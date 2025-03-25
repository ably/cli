import { Flags, Args } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import chalk from 'chalk'

export default class IntegrationsGetCommand extends ControlBaseCommand {
  static description = 'Get an integration rule by ID'

  static examples = [
    '$ ably integrations get rule123',
    '$ ably integrations get rule123 --app "My App" --format json',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
    'app': Flags.string({
      description: 'App ID or name to get the integration rule from',
      required: false,
    }),
  }

  static args = {
    ruleId: Args.string({
      description: 'The rule ID to get',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IntegrationsGetCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.getAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      const rule = await controlApi.getRule(appId, args.ruleId)
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(rule))
      } else {
        this.log(chalk.bold(`Rule ID: ${rule.id}`))
        this.log(`App ID: ${rule.appId}`)
        this.log(`Type: ${rule.ruleType}`)
        this.log(`Request Mode: ${rule.requestMode}`)
        this.log(`Status: ${rule.status}`)
        this.log(`Source:`)
        this.log(`  Type: ${rule.source.type}`)
        this.log(`  Channel Filter: ${rule.source.channelFilter || '(none)'}`)
        this.log(`Target: ${JSON.stringify(rule.target, null, 2).replace(/\n/g, '\n  ')}`)
        this.log(`Version: ${rule.version}`)
        this.log(`Created: ${this.formatDate(rule.created)}`)
        this.log(`Updated: ${this.formatDate(rule.modified)}`)
      }
    } catch (error) {
      this.error(`Error getting integration rule: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 