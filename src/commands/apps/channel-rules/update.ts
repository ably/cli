import { Flags, Args } from '@oclif/core'
import { ControlBaseCommand } from '../../../control-base-command.js'

export default class ChannelRulesUpdateCommand extends ControlBaseCommand {
  static description = 'Update a channel rule'

  static examples = [
    '$ ably apps channel-rules update chat --persisted',
    '$ ably apps channel-rules update events --push-enabled=false',
    '$ ably apps channel-rules update notifications --persisted --push-enabled --app "My App"',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'persisted': Flags.boolean({
      description: 'Whether messages on channels matching this rule should be persisted',
      required: false,
      allowNo: true,
    }),
    'push-enabled': Flags.boolean({
      description: 'Whether push notifications should be enabled for channels matching this rule',
      required: false,
      allowNo: true,
    }),
    'authenticated': Flags.boolean({
      description: 'Whether channels matching this rule require clients to be authenticated',
      required: false,
      allowNo: true,
    }),
    'persist-last': Flags.boolean({
      description: 'Whether to persist only the last message on channels matching this rule',
      required: false,
      allowNo: true,
    }),
    'expose-time-serial': Flags.boolean({
      description: 'Whether to expose the time serial for messages on channels matching this rule',
      required: false,
      allowNo: true,
    }),
    'populate-channel-registry': Flags.boolean({
      description: 'Whether to populate the channel registry for channels matching this rule',
      required: false,
      allowNo: true,
    }),
    'batching-enabled': Flags.boolean({
      description: 'Whether to enable batching for messages on channels matching this rule',
      required: false,
      allowNo: true,
    }),
    'batching-interval': Flags.integer({
      description: 'The batching interval for messages on channels matching this rule',
      required: false,
    }),
    'conflation-enabled': Flags.boolean({
      description: 'Whether to enable conflation for messages on channels matching this rule',
      required: false,
      allowNo: true,
    }),
    'conflation-interval': Flags.integer({
      description: 'The conflation interval for messages on channels matching this rule',
      required: false,
    }),
    'conflation-key': Flags.string({
      description: 'The conflation key for messages on channels matching this rule',
      required: false,
    }),
    'tls-only': Flags.boolean({
      description: 'Whether to enforce TLS for channels matching this rule',
      required: false,
      allowNo: true,
    }),
    'app': Flags.string({
      description: 'App ID or name to update the channel rule in',
      required: false,
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  static args = {
    nameOrId: Args.string({
      description: 'Name or ID of the channel rule to update',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelRulesUpdateCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.getAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      // Find the namespace by name or ID
      const namespaces = await controlApi.listNamespaces(appId)
      const namespace = namespaces.find(n => n.id === args.nameOrId)
      
      if (!namespace) {
        this.error(`Channel rule "${args.nameOrId}" not found`)
        return
      }
      
      // Prepare update data
      const updateData: Record<string, boolean | number | string | undefined> = {}
      
      if (flags.persisted !== undefined) {
        updateData.persisted = flags.persisted
      }
      
      if (flags['push-enabled'] !== undefined) {
        updateData.pushEnabled = flags['push-enabled']
      }
      
      if (flags.authenticated !== undefined) {
        updateData.authenticated = flags.authenticated
      }
      
      if (flags['persist-last'] !== undefined) {
        updateData.persistLast = flags['persist-last']
      }
      
      if (flags['expose-time-serial'] !== undefined) {
        updateData.exposeTimeSerial = flags['expose-time-serial']
      }
      
      if (flags['populate-channel-registry'] !== undefined) {
        updateData.populateChannelRegistry = flags['populate-channel-registry']
      }
      
      if (flags['batching-enabled'] !== undefined) {
        updateData.batchingEnabled = flags['batching-enabled']
      }
      
      if (flags['batching-interval'] !== undefined) {
        updateData.batchingInterval = flags['batching-interval']
      }
      
      if (flags['conflation-enabled'] !== undefined) {
        updateData.conflationEnabled = flags['conflation-enabled']
      }
      
      if (flags['conflation-interval'] !== undefined) {
        updateData.conflationInterval = flags['conflation-interval']
      }
      
      if (flags['conflation-key'] !== undefined) {
        updateData.conflationKey = flags['conflation-key']
      }
      
      if (flags['tls-only'] !== undefined) {
        updateData.tlsOnly = flags['tls-only']
      }
      
      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        this.error('No update parameters provided. Use one of the flag options to update the channel rule.')
        return
      }
      
      const updatedNamespace = await controlApi.updateNamespace(appId, namespace.id, updateData)
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(updatedNamespace))
      } else {
        this.log('Channel rule updated successfully:')
        this.log(`ID: ${updatedNamespace.id}`)
        this.log(`Persisted: ${updatedNamespace.persisted ? 'Yes' : 'No'}`)
        this.log(`Push Enabled: ${updatedNamespace.pushEnabled ? 'Yes' : 'No'}`)
        
        if (updatedNamespace.authenticated !== undefined) {
          this.log(`Authenticated: ${updatedNamespace.authenticated ? 'Yes' : 'No'}`)
        }
        if (updatedNamespace.persistLast !== undefined) {
          this.log(`Persist Last: ${updatedNamespace.persistLast ? 'Yes' : 'No'}`)
        }
        if (updatedNamespace.exposeTimeSerial !== undefined) {
          this.log(`Expose Time Serial: ${updatedNamespace.exposeTimeSerial ? 'Yes' : 'No'}`)
        }
        if (updatedNamespace.populateChannelRegistry !== undefined) {
          this.log(`Populate Channel Registry: ${updatedNamespace.populateChannelRegistry ? 'Yes' : 'No'}`)
        }
        if (updatedNamespace.batchingEnabled !== undefined) {
          this.log(`Batching Enabled: ${updatedNamespace.batchingEnabled ? 'Yes' : 'No'}`)
        }
        if (updatedNamespace.batchingInterval !== undefined) {
          this.log(`Batching Interval: ${updatedNamespace.batchingInterval}`)
        }
        if (updatedNamespace.conflationEnabled !== undefined) {
          this.log(`Conflation Enabled: ${updatedNamespace.conflationEnabled ? 'Yes' : 'No'}`)
        }
        if (updatedNamespace.conflationInterval !== undefined) {
          this.log(`Conflation Interval: ${updatedNamespace.conflationInterval}`)
        }
        if (updatedNamespace.conflationKey !== undefined) {
          this.log(`Conflation Key: ${updatedNamespace.conflationKey}`)
        }
        if (updatedNamespace.tlsOnly !== undefined) {
          this.log(`TLS Only: ${updatedNamespace.tlsOnly ? 'Yes' : 'No'}`)
        }
        
        this.log(`Updated: ${this.formatDate(updatedNamespace.modified)}`)
      }
    } catch (error) {
      this.error(`Error updating channel rule: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 