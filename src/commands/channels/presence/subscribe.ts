import { Args } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { AblyBaseCommand } from '../../../base-command.js'

export default class ChannelsPresenceSubscribe extends AblyBaseCommand {
  static override args = {
    channel: Args.string({
      description: 'Channel name to subscribe to presence on',
      required: true,
    }),
  }

  static override description = 'Subscribe to presence events on a channel'

  static override examples = [
    '$ ably channels presence subscribe my-channel',
    '$ ably channels presence subscribe my-channel --json',
    '$ ably channels presence subscribe my-channel --pretty-json']

  static override flags = {
    ...AblyBaseCommand.globalFlags,
  }

  private client: Ably.Realtime | null = null;

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<void> {
     if (this.client && this.client.connection.state !== 'closed' && // Check state before closing to avoid errors if already closed
       this.client.connection.state !== 'failed') {
           this.client.close();
       }

     return super.finally(err);
   }

   async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsPresenceSubscribe)

    try {
      // Create the Ably client
      this.client = await this.createAblyClient(flags)
      if (!this.client) return

      const {client} = this; // Local const
      const channelName = args.channel

       // Add listeners for connection state changes
       client.connection.on((stateChange: Ably.ConnectionStateChange) => {
         this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
         if (!this.shouldOutputJson(flags)) {
             switch (stateChange.current) {
             case 'connected': {
                 this.log('Successfully connected to Ably');
             
             break;
             }

             case 'disconnected': {
                 this.log('Disconnected from Ably');
             
             break;
             }

             case 'failed': {
                  this.error(`Connection failed: ${stateChange.reason?.message || 'Unknown error'}`);
             
             break;
             }
             // No default
             }
         }
       });

      // Get the channel
      const channel = client.channels.get(channelName)

       // Add listeners for channel state changes
       channel.on((stateChange: Ably.ChannelStateChange) => {
         this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${channelName}' state changed to ${stateChange.current}`, { reason: stateChange.reason });
          if (!this.shouldOutputJson(flags)) {
             switch (stateChange.current) {
             case 'attached': {
                 this.log(`${chalk.green('✓')} Successfully attached to channel: ${chalk.cyan(channelName)}`);
             
             break;
             }

             case 'failed': {
                  this.log(`${chalk.red('✗')} Failed to attach to channel ${chalk.cyan(channelName)}: ${stateChange.reason?.message || 'Unknown error'}`);
             
             break;
             }

             case 'detached': {
                  this.log(`${chalk.yellow('!')} Detached from channel: ${chalk.cyan(channelName)} ${stateChange.reason ? `(Reason: ${stateChange.reason.message})` : ''}`);
             
             break;
             }
             // No default
             }
          }
       });

      // Get current presence set
      this.logCliEvent(flags, 'presence', 'gettingInitialMembers', `Fetching initial presence members for channel ${channelName}`);
      if (!this.shouldOutputJson(flags)) {
        this.log(`Fetching current presence members for channel ${chalk.cyan(channelName)}...`)
      }

      const members = await channel.presence.get()
      const initialMembers = members.map(member => ({
           clientId: member.clientId,
           connectionId: member.connectionId,
           data: member.data
      }));
      this.logCliEvent(flags, 'presence', 'initialMembersFetched', `Fetched ${members.length} initial members`, { count: members.length, members: initialMembers });

      // Output current members based on format
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          channel: channelName,
          members: initialMembers,
          success: true,
          timestamp: new Date().toISOString()
        }, flags))
      } else if (members.length === 0) {
          this.log('No members are currently present on this channel.')
        } else {
          this.log(`\nCurrent presence members (${chalk.cyan(members.length.toString())}):\n`)

          for (const member of members) {
            this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)

            if (member.data && Object.keys(member.data).length > 0) {
              this.log(`  Data: ${JSON.stringify(member.data, null, 2)}`)
            }

            if (member.connectionId) {
              this.log(`  Connection ID: ${chalk.dim(member.connectionId)}`)
            }
          }
        }

      this.logCliEvent(flags, 'presence', 'subscribingToEvents', 'Subscribing to subsequent presence events');
      if (!this.shouldOutputJson(flags)) {
        this.log('\nSubscribing to presence events. Press Ctrl+C to exit.\n')
      }

      channel.presence.subscribe('enter', (presenceMessage) => {
        const timestamp = presenceMessage.timestamp
          ? new Date(presenceMessage.timestamp).toISOString()
          : new Date().toISOString()
        const memberData = {
            clientId: presenceMessage.clientId,
            connectionId: presenceMessage.connectionId,
            data: presenceMessage.data
        };
        this.logCliEvent(flags, 'presence', 'memberEntered', `Member entered presence: ${presenceMessage.clientId}`, { channel: channelName, member: memberData, timestamp });

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            action: 'enter',
            channel: channelName,
            member: memberData,
            success: true,
            timestamp
          }, flags))
        } else {
          this.log(`[${chalk.dim(timestamp)}] ${chalk.green('✓')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} entered presence`)

          if (presenceMessage.data && Object.keys(presenceMessage.data).length > 0) {
            this.log(`  Data: ${this.formatJsonOutput(presenceMessage.data, flags)}`)
          }
        }
      })

      channel.presence.subscribe('leave', (presenceMessage) => {
        const timestamp = presenceMessage.timestamp
          ? new Date(presenceMessage.timestamp).toISOString()
          : new Date().toISOString()
        const memberData = {
            clientId: presenceMessage.clientId,
            connectionId: presenceMessage.connectionId,
            data: presenceMessage.data // Note: Data might not be present on leave
        };
         this.logCliEvent(flags, 'presence', 'memberLeft', `Member left presence: ${presenceMessage.clientId}`, { channel: channelName, member: memberData, timestamp });

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            action: 'leave',
            channel: channelName,
            member: memberData,
            success: true,
            timestamp
          }, flags))
        } else {
          this.log(`[${chalk.dim(timestamp)}] ${chalk.red('✗')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} left presence`)
        }
      })

      channel.presence.subscribe('update', (presenceMessage) => {
        const timestamp = presenceMessage.timestamp
          ? new Date(presenceMessage.timestamp).toISOString()
          : new Date().toISOString()
         const memberData = {
             clientId: presenceMessage.clientId,
             connectionId: presenceMessage.connectionId,
             data: presenceMessage.data
         };
         this.logCliEvent(flags, 'presence', 'memberUpdated', `Member updated presence: ${presenceMessage.clientId}`, { channel: channelName, member: memberData, timestamp });

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            action: 'update',
            channel: channelName,
            member: memberData,
            success: true,
            timestamp
          }, flags))
        } else {
          this.log(`[${chalk.dim(timestamp)}] ${chalk.yellow('⟲')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} updated presence data:`)

          if (presenceMessage.data && Object.keys(presenceMessage.data).length > 0) {
            this.log(`  Data: ${this.formatJsonOutput(presenceMessage.data, flags)}`)
          }
        }
      })
      this.logCliEvent(flags, 'presence', 'listening', 'Now listening for real-time presence events');

      // Keep the process running until interrupted
      await new Promise((resolve, reject) => {
        let cleanupInProgress = false

        const cleanup = async (): Promise<void> => {
          if (cleanupInProgress) return
          cleanupInProgress = true

           this.logCliEvent(flags, 'presence', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');
           if (!this.shouldOutputJson(flags)) {
            this.log('\nUnsubscribing from presence events and closing connection...')
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            const errorMsg = 'Force exiting after timeout during cleanup';
            this.logCliEvent(flags, 'presence', 'forceExit', errorMsg, { channel: channelName });
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({ channel: channelName, error: errorMsg, success: false }, flags))
            } else {
              this.log(chalk.red('Force exiting after timeout...'))
            }

            reject(new Error('Cleanup timed out'));
          }, 5000)

          try {
            try {
              // Attempt to unsubscribe from presence
              this.logCliEvent(flags, 'presence', 'unsubscribing', 'Unsubscribing from presence events');
              channel.presence.unsubscribe()
              this.logCliEvent(flags, 'presence', 'unsubscribed', 'Successfully unsubscribed from presence events');
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  action: 'unsubscribed',
                  channel: channelName,
                  success: true
                }, flags))
              } else {
                this.log(chalk.green('Successfully unsubscribed from presence events.'))
              }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.logCliEvent(flags, 'presence', 'unsubscribeError', `Error unsubscribing from presence: ${errorMsg}`, { channel: channelName, error: errorMsg });
                if (this.shouldOutputJson(flags)) {
                  this.log(this.formatJsonOutput({ channel: channelName, error: errorMsg, success: false }, flags))
                } else {
                  this.log(`Note: ${errorMsg}`);
                  this.log('Continuing with connection close.')
                }
            }

            // Now close the connection
            if (client) {
              this.logCliEvent(flags, 'connection', 'closing', 'Closing Ably connection.');
              client.close()
              this.logCliEvent(flags, 'connection', 'closed', 'Ably connection closed.');
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({ channel: channelName, status: 'closed', success: true }, flags))
              } else {
                this.log(chalk.green('Successfully closed connection.'))
              }
            }

            clearTimeout(forceExitTimeout)
            // eslint-disable-next-line unicorn/no-useless-undefined
            resolve(undefined) // Satisfy TS2794, disable conflicting lint rule
          } catch (error) {
             const errorMsg = error instanceof Error ? error.message : String(error);
             this.logCliEvent(flags, 'presence', 'cleanupError', `Error during cleanup: ${errorMsg}`, { channel: channelName, error: errorMsg });
             if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({ channel: channelName, error: errorMsg, success: false }, flags))
            } else {
              this.log(`Error during cleanup: ${errorMsg}`)
            }

            clearTimeout(forceExitTimeout)
            reject(new Error(`Cleanup failed: ${errorMsg}`));
          }
        }

        process.once('SIGINT', () => { cleanup().catch(reject); });
        process.once('SIGTERM', () => { cleanup().catch(reject); });
      })
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logCliEvent(flags || {}, 'presence', 'fatalError', `Error subscribing to presence: ${errorMsg}`, { channel: args.channel, error: errorMsg });
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ channel: args.channel, error: errorMsg, success: false }, flags))
        } else {
          this.error(`Error subscribing to presence: ${errorMsg}`)
        }
    } finally {
       // Ensure client is closed even if cleanup promise didn't resolve
       if (this.client && this.client.connection.state !== 'closed') {
           this.logCliEvent(flags || {}, 'connection', 'finalCloseAttempt', 'Ensuring connection is closed in finally block.');
           this.client.close();
       }
    }
  }
} 