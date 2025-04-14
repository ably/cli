import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ChannelsPresenceSubscribe extends AblyBaseCommand {
  static override description = 'Subscribe to presence events on a channel'

  static override examples = [
    '$ ably channels presence subscribe my-channel',
    '$ ably channels presence subscribe my-channel --json',
    '$ ably channels presence subscribe my-channel --pretty-json']

  static override flags = {
    ...AblyBaseCommand.globalFlags,
  }

  static override args = {
    channel: Args.string({
      description: 'Channel name to subscribe to presence on',
      required: true,
    }),
  }

  private client: Ably.Realtime | null = null;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsPresenceSubscribe)

    try {
      // Create the Ably client
      this.client = await this.createAblyClient(flags)
      if (!this.client) return

      const client = this.client; // Local const
      const channelName = args.channel

       // Add listeners for connection state changes
       client.connection.on((stateChange: Ably.ConnectionStateChange) => {
         this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
         if (!this.shouldOutputJson(flags)) {
             if (stateChange.current === 'connected') {
                 this.log('Successfully connected to Ably');
             } else if (stateChange.current === 'disconnected') {
                 this.log('Disconnected from Ably');
             } else if (stateChange.current === 'failed') {
                  this.error(`Connection failed: ${stateChange.reason?.message || 'Unknown error'}`);
             }
         }
       });

      // Get the channel
      const channel = client.channels.get(channelName)

       // Add listeners for channel state changes
       channel.on((stateChange: Ably.ChannelStateChange) => {
         this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${channelName}' state changed to ${stateChange.current}`, { reason: stateChange.reason });
          if (!this.shouldOutputJson(flags)) {
             if (stateChange.current === 'attached') {
                 this.log(`${chalk.green('✓')} Successfully attached to channel: ${chalk.cyan(channelName)}`);
             } else if (stateChange.current === 'failed') {
                  this.log(`${chalk.red('✗')} Failed to attach to channel ${chalk.cyan(channelName)}: ${stateChange.reason?.message || 'Unknown error'}`);
             } else if (stateChange.current === 'detached') {
                  this.log(`${chalk.yellow('!')} Detached from channel: ${chalk.cyan(channelName)} ${stateChange.reason ? `(Reason: ${stateChange.reason.message})` : ''}`);
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
          success: true,
          timestamp: new Date().toISOString(),
          channel: channelName,
          members: initialMembers
        }, flags))
      } else {
        if (members.length === 0) {
          this.log('No members are currently present on this channel.')
        } else {
          this.log(`\nCurrent presence members (${chalk.cyan(members.length.toString())}):\n`)

          members.forEach(member => {
            this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)

            if (member.data && Object.keys(member.data).length > 0) {
              this.log(`  Data: ${JSON.stringify(member.data, null, 2)}`)
            }

            if (member.connectionId) {
              this.log(`  Connection ID: ${chalk.dim(member.connectionId)}`)
            }
          })
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
        this.logCliEvent(flags, 'presence', 'memberEntered', `Member entered presence: ${presenceMessage.clientId}`, { timestamp, channel: channelName, member: memberData });

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp,
            action: 'enter',
            channel: channelName,
            member: memberData
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
         this.logCliEvent(flags, 'presence', 'memberLeft', `Member left presence: ${presenceMessage.clientId}`, { timestamp, channel: channelName, member: memberData });

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp,
            action: 'leave',
            channel: channelName,
            member: memberData
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
         this.logCliEvent(flags, 'presence', 'memberUpdated', `Member updated presence: ${presenceMessage.clientId}`, { timestamp, channel: channelName, member: memberData });

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp,
            action: 'update',
            channel: channelName,
            member: memberData
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
      await new Promise((resolve) => {
        let cleanupInProgress = false

        const cleanup = async () => {
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
              this.log(this.formatJsonOutput({ success: false, error: errorMsg, channel: channelName }, flags))
            } else {
              this.log(chalk.red('Force exiting after timeout...'))
            }
            process.exit(1)
          }, 5000)

          try {
            try {
              // Attempt to unsubscribe from presence
              this.logCliEvent(flags, 'presence', 'unsubscribing', 'Unsubscribing from presence events');
              channel.presence.unsubscribe()
              this.logCliEvent(flags, 'presence', 'unsubscribed', 'Successfully unsubscribed from presence events');
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  action: 'unsubscribed',
                  channel: channelName
                }, flags))
              } else {
                this.log(chalk.green('Successfully unsubscribed from presence events.'))
              }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.logCliEvent(flags, 'presence', 'unsubscribeError', `Error unsubscribing from presence: ${errorMsg}`, { channel: channelName, error: errorMsg });
                if (this.shouldOutputJson(flags)) {
                  this.log(this.formatJsonOutput({ success: false, error: errorMsg, channel: channelName }, flags))
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
                this.log(this.formatJsonOutput({ success: true, status: 'closed', channel: channelName }, flags))
              } else {
                this.log(chalk.green('Successfully closed connection.'))
              }
            }

            clearTimeout(forceExitTimeout)
            resolve(null)
            process.exit(0)
          } catch (error) {
             const errorMsg = error instanceof Error ? error.message : String(error);
             this.logCliEvent(flags, 'presence', 'cleanupError', `Error during cleanup: ${errorMsg}`, { channel: channelName, error: errorMsg });
             if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({ success: false, error: errorMsg, channel: channelName }, flags))
            } else {
              this.log(`Error during cleanup: ${errorMsg}`)
            }
            clearTimeout(forceExitTimeout)
            process.exit(1)
          }
        }

        process.once('SIGINT', () => void cleanup())
        process.once('SIGTERM', () => void cleanup())
      })
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logCliEvent(flags || {}, 'presence', 'fatalError', `Error subscribing to presence: ${errorMsg}`, { error: errorMsg, channel: args.channel });
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: false, error: errorMsg, channel: args.channel }, flags))
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

   // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.client && this.client.connection.state !== 'closed') {
       // Check state before closing to avoid errors if already closed
       if (this.client.connection.state !== 'failed') {
           this.client.close();
       }
     }
     return super.finally(err);
   }
} 