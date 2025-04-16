import { Args, Flags } from '@oclif/core'

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
      
      // Prepare update data
      const updateData: PartialRuleData = {
        // Start with existing values for required fields, but make them optional
        requestMode: existingRule.requestMode,
        // Use existing values for mandatory fields
        ruleType: existingRule.ruleType,
        source: { 
          ...existingRule.source 
        },
        target: { 
          ...existingRule.target 
        }
      }
      
      // Only update fields that are explicitly set
      if (flags.status) {
        updateData.status = flags.status as 'disabled' | 'enabled'
      }
      
      if (flags['channel-filter']) {
        updateData.source!.channelFilter = flags['channel-filter']
      }
      
      // Update target if it's an HTTP rule and target-url is provided
      if (existingRule.ruleType === 'http' && flags['target-url']) {
        updateData.target!.url = flags['target-url']
      }
      
      const updatedRule = await controlApi.updateRule(appId, args.ruleId, updateData)
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ rule: updatedRule }, flags))
      } else {
        this.log('Integration rule updated successfully:')
        this.log(`Rule ID: ${updatedRule.id}`)
        this.log(`Type: ${updatedRule.ruleType}`)
        this.log(`Request Mode: ${updatedRule.requestMode}`)
        this.log(`Status: ${updatedRule.status}`)
        this.log(`Source Type: ${updatedRule.source.type}`)
        this.log(`Channel Filter: ${updatedRule.source.channelFilter || '(none)'}`)
        
        if (updatedRule.ruleType === 'http') {
          this.log(`Target URL: ${updatedRule.target.url}`)
        }
        
        this.log(`Updated: ${this.formatDate(updatedRule.modified)}`)
      }
    } catch (error) {
      this.error(`Error updating integration rule: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 