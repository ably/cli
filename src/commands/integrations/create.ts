import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'

export default class IntegrationsCreateCommand extends ControlBaseCommand {
  static description = 'Create an integration rule'

  static examples = [
    '$ ably integrations create --rule-type "http" --source-type "channel.message" --target-url "https://example.com/webhook"',
    '$ ably integrations create --rule-type "amqp" --source-type "channel.message" --channel-filter "chat:*"',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID or name to create the integration rule in',
      required: false,
    }),
    'rule-type': Flags.string({
      description: 'Type of integration rule (http, amqp, etc.)',
      required: true,
      options: ['http', 'amqp', 'kinesis', 'firehose', 'pulsar', 'kafka', 'azure', 'azure-functions', 'mqtt', 'cloudmqtt'],
    }),
    'source-type': Flags.string({
      description: 'The event source type',
      required: true,
      options: ['channel.message', 'channel.presence', 'channel.lifecycle', 'presence.message'],
    }),
    'channel-filter': Flags.string({
      description: 'Channel filter pattern',
      required: false,
    }),
    'request-mode': Flags.string({
      description: 'Request mode for the rule',
      required: false,
      options: ['single', 'batch'],
      default: 'single',
    }),
    'status': Flags.string({
      description: 'Initial status of the rule',
      required: false,
      options: ['enabled', 'disabled'],
      default: 'enabled',
    }),
    'target-url': Flags.string({
      description: 'Target URL for HTTP rules',
      required: false,
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(IntegrationsCreateCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.getAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      // Prepare rule data
      const ruleData: any = {
        ruleType: flags['rule-type'],
        requestMode: flags['request-mode'],
        status: flags.status === 'enabled' ? 'enabled' : 'disabled',
        source: {
          channelFilter: flags['channel-filter'] || '',
          type: flags['source-type'],
        },
        target: {},
      }
      
      // Add target data based on rule type
      switch (flags['rule-type']) {
      case 'http':
        if (!flags['target-url']) {
          this.error('--target-url is required for HTTP integration rules')
          return
        }
        ruleData.target = {
          url: flags['target-url'],
          format: 'json',
          enveloped: true,
        }
        break
      case 'amqp':
        // Simplified AMQP config for demo purposes
        ruleData.target = {
          queueType: 'classic',
          exchangeName: 'ably',
          routingKey: 'events',
          mandatory: true,
          immediate: false,
          persistent: true,
          headers: {},
          format: 'json',
          enveloped: true,
        }
        break
      default:
        this.log(`Note: Using default target for ${flags['rule-type']}. In a real implementation, more target options would be required.`)
        ruleData.target = { format: 'json', enveloped: true }
      }
      
      const createdRule = await controlApi.createRule(appId, ruleData)
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(createdRule))
      } else {
        this.log('Integration rule created successfully:')
        this.log(`Rule ID: ${createdRule.id}`)
        this.log(`Type: ${createdRule.ruleType}`)
        this.log(`Request Mode: ${createdRule.requestMode}`)
        this.log(`Status: ${createdRule.status}`)
        this.log(`Source Type: ${createdRule.source.type}`)
        this.log(`Channel Filter: ${createdRule.source.channelFilter || '(none)'}`)
        this.log(`Created: ${this.formatDate(createdRule.created)}`)
      }
    } catch (error) {
      this.error(`Error creating integration rule: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 