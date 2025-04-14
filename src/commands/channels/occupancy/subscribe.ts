import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ChannelsOccupancySubscribe extends AblyBaseCommand {
  static description = 'Subscribe to real-time occupancy metrics for a channel'

  static examples = [
    '$ ably channels occupancy subscribe my-channel',
    '$ ably channels occupancy subscribe my-channel --json',
    '$ ably channels occupancy subscribe --pretty-json my-channel']

  static flags = {
    ...AblyBaseCommand.globalFlags,
  }

  static args = {
    channel: Args.string({
      description: 'Channel name to subscribe to occupancy for',
      required: true,
    }),
  }

  private client: Ably.Realtime | null = null;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsOccupancySubscribe)

    const channelName = args.channel

    try {
      this.logCliEvent(flags, 'subscribe', 'connecting', 'Connecting to Ably...');

      // Create the Ably client
      this.client = await this.createAblyClient(flags)
      if (!this.client) return

      const client = this.client; // local const

      // Get the channel with occupancy option enabled
      const channelOptions = {
        params: {
          occupancy: 'metrics' // Enable occupancy events
        }
      }

      const channel = client.channels.get(channelName, channelOptions)

      // Setup connection state change handler
      client.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
        if (!this.shouldOutputJson(flags)) {
            if (stateChange.current === 'connected') {
                this.log('Successfully connected to Ably');
                this.log(`Subscribing to occupancy events for channel '${channelName}'...`);
            } else if (stateChange.current === 'disconnected') {
                this.log('Disconnected from Ably');
            } else if (stateChange.current === 'failed') {
                 this.error(`Connection failed: ${stateChange.reason?.message || 'Unknown error'}`);
            }
        }
      });

       // Listen to channel state changes
       channel.on((stateChange: Ably.ChannelStateChange) => {
           this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${channelName}' state changed to ${stateChange.current}`, { channel: channelName, reason: stateChange.reason });
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

       this.logCliEvent(flags, 'subscribe', 'listening', 'Listening for occupancy updates. Press Ctrl+C to exit.');
       if (!this.shouldOutputJson(flags)) {
         this.log('Listening for occupancy updates. Press Ctrl+C to exit.')
       }

      // Subscribe to occupancy events
      channel.subscribe('[meta]occupancy', (message: any) => {
        const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString()

        // Extract occupancy metrics from the message
        const occupancyMetrics = message.data?.metrics

        if (!occupancyMetrics) {
          const errorMsg = 'Received occupancy update but no metrics available';
          this.logCliEvent(flags, 'subscribe', 'metricsUnavailable', errorMsg, { timestamp, channel: channelName });
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({ success: false, timestamp, error: errorMsg, channel: channelName }, flags))
          } else {
            this.log(`[${timestamp}] ${errorMsg}`)
          }
          return
        }

        const occupancyEvent = {
            timestamp,
            channel: channelName,
            metrics: occupancyMetrics
        };
        this.logCliEvent(flags, 'subscribe', 'occupancyUpdate', 'Received occupancy update', occupancyEvent);

        // Output the occupancy metrics based on format
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: true, ...occupancyEvent }, flags))
        } else {
          this.log(`[${timestamp}] Occupancy update for channel '${channelName}'`)
          this.log(`  Connections: ${occupancyMetrics.connections ?? 0}`)
          this.log(`  Publishers: ${occupancyMetrics.publishers ?? 0}`)
          this.log(`  Subscribers: ${occupancyMetrics.subscribers ?? 0}`)

          if (occupancyMetrics.presenceConnections !== undefined) {
            this.log(`  Presence Connections: ${occupancyMetrics.presenceConnections}`)
          }

          if (occupancyMetrics.presenceMembers !== undefined) {
            this.log(`  Presence Members: ${occupancyMetrics.presenceMembers}`)
          }

          if (occupancyMetrics.presenceSubscribers !== undefined) {
            this.log(`  Presence Subscribers: ${occupancyMetrics.presenceSubscribers}`)
          }
          this.log('') // Empty line for better readability
        }
      })
      this.logCliEvent(flags, 'subscribe', 'subscribedToOccupancy', `Subscribed to [meta]occupancy on channel ${channelName}`, { channel: channelName });

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = () => {
          this.logCliEvent(flags, 'subscribe', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');
          if (!this.shouldOutputJson(flags)) {
            this.log('\nUnsubscribing and closing connection...')
          }

          this.logCliEvent(flags, 'subscribe', 'unsubscribingOccupancy', `Unsubscribing from [meta]occupancy on ${channelName}`, { channel: channelName });
          try {
             channel.unsubscribe(); // Unsubscribe from all listeners on the channel
             this.logCliEvent(flags, 'subscribe', 'unsubscribedOccupancy', `Unsubscribed from [meta]occupancy on ${channelName}`, { channel: channelName });
          } catch (err) {
               this.logCliEvent(flags, 'subscribe', 'unsubscribeError', `Error unsubscribing from ${channelName}: ${err instanceof Error ? err.message : String(err)}`, { channel: channelName, error: err instanceof Error ? err.message : String(err) });
          }

          if (client) {
            client.connection.once('closed', () => {
               this.logCliEvent(flags, 'connection', 'closed', 'Connection closed gracefully.');
               if (!this.shouldOutputJson(flags)) {
                 this.log('Connection closed')
               }
               resolve()
            })
            this.logCliEvent(flags, 'connection', 'closing', 'Closing Ably connection.');
            client.close()
          } else {
            this.logCliEvent(flags, 'subscribe', 'noClientToClose', 'No active client connection to close.');
            resolve()
          }
        }

        process.on('SIGINT', cleanup)
        process.on('SIGTERM', cleanup)
      })
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logCliEvent(flags, 'subscribe', 'fatalError', `Error during occupancy subscription: ${errorMsg}`, { error: errorMsg, channel: channelName });
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: false, error: errorMsg, channel: channelName }, flags))
        } else {
          this.error(`Error: ${errorMsg}`)
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