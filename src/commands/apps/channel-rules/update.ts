import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { ControlBaseCommand } from '../../../control-base-command.js'

export default class ChannelRulesUpdateCommand extends ControlBaseCommand {
  static args = {
    nameOrId: Args.string({
      description: 'Name or ID of the channel rule to update',
      required: true,
    }),
  }

  static description = 'Update a channel rule'

  static examples = [
    '$ ably apps channel-rules update chat --persisted',
    '$ ably apps channel-rules update events --push-enabled=false',
    '$ ably apps channel-rules update notifications --persisted --push-enabled --app "My App"',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID or name to update the channel rule in',
      required: false,
    }),
    'authenticated': Flags.boolean({
      allowNo: true,
      description: 'Whether channels matching this rule require clients to be authenticated',
      required: false,
    }),
    'batching-enabled': Flags.boolean({
      allowNo: true,
      description: 'Whether to enable batching for messages on channels matching this rule',
      required: false,
    }),
    'batching-interval': Flags.integer({
      description: 'The batching interval for messages on channels matching this rule',
      required: false,
    }),
    'conflation-enabled': Flags.boolean({
      allowNo: true,
      description: 'Whether to enable conflation for messages on channels matching this rule',
      required: false,
    }),
    'conflation-interval': Flags.integer({
      description: 'The conflation interval for messages on channels matching this rule',
      required: false,
    }),
    'conflation-key': Flags.string({
      description: 'The conflation key for messages on channels matching this rule',
      required: false,
    }),
    'expose-time-serial': Flags.boolean({
      allowNo: true,
      description: 'Whether to expose the time serial for messages on channels matching this rule',
      required: false,
    }),
    'persist-last': Flags.boolean({
      allowNo: true,
      description: 'Whether to persist only the last message on channels matching this rule',
      required: false,
    }),
    'persisted': Flags.boolean({
      allowNo: true,
      description: 'Whether messages on channels matching this rule should be persisted',
      required: false,
    }),
    'populate-channel-registry': Flags.boolean({
      allowNo: true,
      description: 'Whether to populate the channel registry for channels matching this rule',
      required: false,
    }),
    'push-enabled': Flags.boolean({
      allowNo: true,
      description: 'Whether push notifications should be enabled for channels matching this rule',
      required: false,
    }),
    'tls-only': Flags.boolean({
      allowNo: true,
      description: 'Whether to enforce TLS for channels matching this rule',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelRulesUpdateCommand)
    
    const controlApi = this.createControlApi(flags)
    let appId: string | undefined;
    
    try {
      let appId = flags.app
      if (!appId) {
        appId = await this.resolveAppId(flags)
      }
      
      if (!appId) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            error: 'No app specified. Use --app flag or select an app with "ably apps switch"',
            status: 'error',
            success: false
          }, flags));
        } else {
          this.error('No app specified. Use --app flag or select an app with "ably apps switch"');
        }

        return;
      }
      
      // Find the namespace by name or ID
      const namespaces = await controlApi.listNamespaces(appId)
      const namespace = namespaces.find(n => n.id === args.nameOrId)
      
      if (!namespace) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            appId,
            error: `Channel rule "${args.nameOrId}" not found`,
            status: 'error',
            success: false
          }, flags));
        } else {
          this.error(`Channel rule "${args.nameOrId}" not found`);
        }

        return;
      }
      
      // Prepare update data
      const updateData: Record<string, boolean | number | string | undefined> = {}
      
      if (flags.persisted !== undefined) {
        updateData.persisted = flags.persisted;
      }
      
      if (flags['push-enabled'] !== undefined) {
        updateData.pushEnabled = flags['push-enabled'];
      }
      
      if (flags.authenticated !== undefined) {
        updateData.authenticated = flags.authenticated;
      }
      
      if (flags['persist-last'] !== undefined) {
        updateData.persistLast = flags['persist-last'];
      }
      
      if (flags['expose-time-serial'] !== undefined) {
        updateData.exposeTimeSerial = flags['expose-time-serial'];
      }
      
      if (flags['populate-channel-registry'] !== undefined) {
        updateData.populateChannelRegistry = flags['populate-channel-registry'];
      }
      
      if (flags['batching-enabled'] !== undefined) {
        updateData.batchingEnabled = flags['batching-enabled'];
      }
      
      if (flags['batching-interval'] !== undefined) {
        updateData.batchingInterval = flags['batching-interval'];
      }
      
      if (flags['conflation-enabled'] !== undefined) {
        updateData.conflationEnabled = flags['conflation-enabled'];
      }
      
      if (flags['conflation-interval'] !== undefined) {
        updateData.conflationInterval = flags['conflation-interval'];
      }
      
      if (flags['conflation-key'] !== undefined) {
        updateData.conflationKey = flags['conflation-key'];
      }
      
      if (flags['tls-only'] !== undefined) {
        updateData.tlsOnly = flags['tls-only'];
      }
      
      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            appId,
            error: 'No update parameters provided. Use one of the flag options to update the channel rule.',
            ruleId: namespace.id,
            status: 'error',
            success: false
          }, flags));
        } else {
          this.error('No update parameters provided. Use one of the flag options to update the channel rule.');
        }

        return;
      }
      
      const updatedNamespace = await controlApi.updateNamespace(appId, namespace.id, updateData)
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          appId,
          rule: {
            authenticated: updatedNamespace.authenticated,
            batchingEnabled: updatedNamespace.batchingEnabled,
            batchingInterval: updatedNamespace.batchingInterval,
            conflationEnabled: updatedNamespace.conflationEnabled,
            conflationInterval: updatedNamespace.conflationInterval,
            conflationKey: updatedNamespace.conflationKey,
            created: new Date(updatedNamespace.created).toISOString(),
            exposeTimeSerial: updatedNamespace.exposeTimeSerial,
            id: updatedNamespace.id,
            modified: new Date(updatedNamespace.modified).toISOString(),
            persistLast: updatedNamespace.persistLast,
            persisted: updatedNamespace.persisted,
            populateChannelRegistry: updatedNamespace.populateChannelRegistry,
            pushEnabled: updatedNamespace.pushEnabled,
            tlsOnly: updatedNamespace.tlsOnly
          },
          success: true,
          timestamp: new Date().toISOString()
        }, flags));
      } else {
        this.log('Channel rule updated successfully:');
        this.log(`ID: ${updatedNamespace.id}`);
        this.log(`Persisted: ${updatedNamespace.persisted ? chalk.green('Yes') : 'No'}`);
        this.log(`Push Enabled: ${updatedNamespace.pushEnabled ? chalk.green('Yes') : 'No'}`);
        
        if (updatedNamespace.authenticated !== undefined) {
          this.log(`Authenticated: ${updatedNamespace.authenticated ? chalk.green('Yes') : 'No'}`);
        }

        if (updatedNamespace.persistLast !== undefined) {
          this.log(`Persist Last: ${updatedNamespace.persistLast ? chalk.green('Yes') : 'No'}`);
        }

        if (updatedNamespace.exposeTimeSerial !== undefined) {
          this.log(`Expose Time Serial: ${updatedNamespace.exposeTimeSerial ? chalk.green('Yes') : 'No'}`);
        }

        if (updatedNamespace.populateChannelRegistry !== undefined) {
          this.log(`Populate Channel Registry: ${updatedNamespace.populateChannelRegistry ? chalk.green('Yes') : 'No'}`);
        }

        if (updatedNamespace.batchingEnabled !== undefined) {
          this.log(`Batching Enabled: ${updatedNamespace.batchingEnabled ? chalk.green('Yes') : 'No'}`);
        }

        if (updatedNamespace.batchingInterval !== undefined) {
          this.log(`Batching Interval: ${chalk.green(updatedNamespace.batchingInterval.toString())}`);
        }

        if (updatedNamespace.conflationEnabled !== undefined) {
          this.log(`Conflation Enabled: ${updatedNamespace.conflationEnabled ? chalk.green('Yes') : 'No'}`);
        }

        if (updatedNamespace.conflationInterval !== undefined) {
          this.log(`Conflation Interval: ${chalk.green(updatedNamespace.conflationInterval.toString())}`);
        }

        if (updatedNamespace.conflationKey !== undefined) {
          this.log(`Conflation Key: ${chalk.green(updatedNamespace.conflationKey)}`);
        }

        if (updatedNamespace.tlsOnly !== undefined) {
          this.log(`TLS Only: ${updatedNamespace.tlsOnly ? chalk.green('Yes') : 'No'}`);
        }
        
        this.log(`Created: ${this.formatDate(updatedNamespace.created)}`);
        this.log(`Updated: ${this.formatDate(updatedNamespace.modified)}`);
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          appId,
          error: error instanceof Error ? error.message : String(error),
          status: 'error',
          success: false
        }, flags));
      } else {
        this.error(`Error updating channel rule: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
} 