import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { ControlBaseCommand } from '../../control-base-command.js'

// Interface for rule update data structure (most fields optional)
interface PartialRuleData {
  requestMode?: string;
  ruleType?: string; // Usually shouldn't be updated, but kept for structure
  source?: {
    channelFilter?: string;
    type?: string; // Usually shouldn't be updated
  };
  status?: 'disabled' | 'enabled';
  target?: Record<string, unknown>; // Target is highly variable
}

export default class IntegrationsUpdateCommand extends ControlBaseCommand {
  static args = {
    ruleId: Args.string({
      description: 'The rule ID to update',
      required: true,
    }),
  }

  static description = 'Update an integration rule'

  static examples = [
    '$ ably integrations update rule123 --status disabled',
    '$ ably integrations update rule123 --channel-filter "chat:*"',
    '$ ably integrations update rule123 --target-url "https://new-example.com/webhook"',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID or name of the app containing the integration rule',
      required: false,
    }),
    'channel-filter': Flags.string({
      description: 'Channel filter pattern',
      required: false,
    }),
    'status': Flags.string({
      description: 'Status of the rule',
      options: ['enabled', 'disabled'],
      required: false,
    }),
    'target-url': Flags.string({
      description: 'Target URL for HTTP rules',
      required: false,
    }),
    'request-mode': Flags.string({
      description: 'Request mode of the rule',
      required: false,
    }),
    'source': Flags.string({
      description: 'Source of the rule',
      required: false,
    }),
    'target': Flags.string({
      description: 'Target of the rule',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IntegrationsUpdateCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.resolveAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      // Get current rule to preserve existing fields
      const existingRule = await controlApi.getRule(appId, args.ruleId)
      
      // Prepare update data - explicitly typed
      const updatePayload: Partial<Omit<PartialRuleData, 'status'>> = {
        ...(flags['request-mode'] && { requestMode: flags['request-mode'] }),
        ...(flags.source && { source: JSON.parse(flags.source) }),
        ...(flags.target && {
          target: {
            // Properly type the existing target
            ...(existingRule.target as Record<string, unknown>),
            ...JSON.parse(flags.target)
          }
        })
      }
      
      if (flags['channel-filter']) {
        // Ensure source exists before assigning to channelFilter
        if (!updatePayload.source) updatePayload.source = {};
        updatePayload.source!.channelFilter = flags['channel-filter']
      }
      
      // Update target if it's an HTTP rule and target-url is provided
      if (existingRule.ruleType === 'http' && flags['target-url']) {
        // Ensure target exists before assigning to url
        if (!updatePayload.target) updatePayload.target = {};
        updatePayload.target!.url = flags['target-url']
      }
      
      const updatedRule = await controlApi.updateRule(appId, args.ruleId, updatePayload)
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ rule: updatedRule }, flags))
      } else {
        this.log(chalk.green('Integration Rule Updated Successfully:'))
        this.log(`ID: ${updatedRule.id}`)
        this.log(`App ID: ${updatedRule.appId}`)
        this.log(`Rule Type: ${updatedRule.ruleType}`)
        this.log(`Request Mode: ${updatedRule.requestMode}`)
        this.log(`Source Channel Filter: ${updatedRule.source.channelFilter}`)
        this.log(`Source Type: ${updatedRule.source.type}`)
        if (typeof updatedRule.target === 'object' && updatedRule.target !== null && 'url' in updatedRule.target) {
          this.log(`Target URL: ${(updatedRule.target as Record<string, unknown>).url}`)
        }
        // Cast target for formatJsonOutput
        this.log(`Target: ${this.formatJsonOutput(updatedRule.target as Record<string, unknown>, flags)}`)
      }
    } catch (error) {
      this.error(`Error updating integration rule: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 