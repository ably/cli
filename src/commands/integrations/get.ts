import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { ControlBaseCommand } from '../../control-base-command.js'

export default class IntegrationsGetCommand extends ControlBaseCommand {
  static args = {
    ruleId: Args.string({
      description: 'The rule ID to get',
      required: true,
    }),
  }

  static description = 'Get an integration rule by ID'

  static examples = [
    '$ ably integrations get rule123',
    '$ ably integrations get rule123 --json',
    '$ ably integrations get rule123 --app "My App" --pretty-json']

  static flags = {
    ...ControlBaseCommand.globalFlags,
    
    'app': Flags.string({
      description: 'App ID or name to get the integration rule from',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IntegrationsGetCommand)
    
    // Display authentication information
    this.showAuthInfoIfNeeded(flags)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.resolveAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      const rule = await controlApi.getRule(appId, args.ruleId)
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput(JSON.parse(JSON.stringify(rule)), flags))
      } else {
        this.log(chalk.bold(`Rule ID: ${rule.id}`))
        this.log(`App ID: ${rule.appId}`)
        this.log(`Type: ${rule.ruleType}`)
        this.log(`Request Mode: ${rule.requestMode}`)
        this.log(`Status: ${rule.status}`)
        this.log(`Source:`)
        this.log(`  Type: ${rule.source.type}`)
        this.log(`  Channel Filter: ${rule.source.channelFilter || '(none)'}`)
        this.log(`Target: ${this.formatJsonOutput(JSON.parse(JSON.stringify(rule.target)), flags).replaceAll('\n', '\n  ')}`)
        this.log(`Version: ${rule.version}`)
        this.log(`Created: ${this.formatDate(rule.created)}`)
        this.log(`Updated: ${this.formatDate(rule.modified)}`)
      }
    } catch (error) {
      this.error(`Error getting integration rule: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 