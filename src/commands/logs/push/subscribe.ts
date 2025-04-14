import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'
import { formatJson, isJsonData } from '../../../utils/json-formatter.js'

export default class LogsPushSubscribe extends AblyBaseCommand {
  static override description = 'Stream logs from the push notifications meta channel [meta]log:push'

  static override examples = [
    '$ ably logs push subscribe',
    '$ ably logs push subscribe --rewind 10',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    rewind: Flags.integer({
      description: 'Number of messages to rewind when subscribing',
      default: 0,
    }),
    json: Flags.boolean({
      description: 'Output results as JSON',
      default: false,
    }),
  }

  private client: Ably.Realtime | null = null;

  async run(): Promise<void> {
    const {flags} = await this.parse(LogsPushSubscribe)

    try {
      // Create the Ably client
      this.client = await this.createAblyClient(flags)
      if (!this.client) return

      const client = this.client; // local const
      const channelName = '[meta]log:push'
      const channelOptions: Ably.ChannelOptions = {}

      // Add listeners for connection state changes
      client.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Configure rewind if specified
      if (flags.rewind > 0) {
        this.logCliEvent(flags, 'logs', 'rewindEnabled', `Rewind enabled for ${channelName}`, { channel: channelName, count: flags.rewind });
        channelOptions.params = {
          ...channelOptions.params,
          rewind: flags.rewind.toString(),
        }
      }

      const channel = client.channels.get(channelName, channelOptions)

       // Listen to channel state changes
       channel.on((stateChange: Ably.ChannelStateChange) => {
           this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${channelName}' state changed to ${stateChange.current}`, { channel: channelName, reason: stateChange.reason });
       });

      this.logCliEvent(flags, 'logs', 'subscribing', `Subscribing to ${channelName}...`);
      if (!this.shouldOutputJson(flags)) {
         this.log(`Subscribing to ${chalk.cyan(channelName)}...`);
         this.log('Press Ctrl+C to exit');
         this.log('');
      }

      // Subscribe to the channel
      channel.subscribe((message) => {
        const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString()
        const event = message.name || 'unknown'
        const logEvent = {
            timestamp,
            channel: channelName,
            event,
            data: message.data
        };
        this.logCliEvent(flags, 'logs', 'logReceived', `Log received on ${channelName}`, logEvent);

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput(logEvent, flags))
          return
        }

        // Color-code different event types based on severity
        let eventColor = chalk.blue

        // For push log events - based on examples and severity
        if (message.data && typeof message.data === 'object' && 'severity' in message.data) {
          const severity = message.data.severity as string
          if (severity === 'error') {
            eventColor = chalk.red
          } else if (severity === 'warning') {
            eventColor = chalk.yellow
          } else if (severity === 'info') {
            eventColor = chalk.green
          } else if (severity === 'debug') {
            eventColor = chalk.blue
          }
        }

        // Format the log output
        this.log(`${chalk.dim(`[${timestamp}]`)} Channel: ${chalk.cyan(channelName)} | Event: ${eventColor(event)}`)
        if (message.data) {
          if (isJsonData(message.data)) {
            this.log('Data:')
            this.log(formatJson(message.data))
          } else {
            this.log(`Data: ${message.data}`)
          }
        }
        this.log('')
      })
      this.logCliEvent(flags, 'logs', 'subscribed', `Successfully subscribed to ${channelName}`);

      // Set up cleanup for when the process is terminated
      const cleanup = () => {
         this.logCliEvent(flags, 'logs', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');
         if (client) {
           this.logCliEvent(flags, 'connection', 'closing', 'Closing Ably connection.');
           client.close()
           this.logCliEvent(flags, 'connection', 'closed', 'Ably connection closed.');
         }
      }

      // Handle process termination
      process.on('SIGINT', () => {
         if (!this.shouldOutputJson(flags)) {
            this.log('\nSubscription ended');
         }
         cleanup();
         process.exit(0);
      });
      process.on('SIGTERM', () => {
          cleanup();
          process.exit(0);
      });

      this.logCliEvent(flags, 'logs', 'listening', 'Listening for logs...');
      // Wait indefinitely
      await new Promise(() => {})
    } catch (error: unknown) {
      const err = error as Error
       this.logCliEvent(flags, 'logs', 'fatalError', `Error during log subscription: ${err.message}`, { error: err.message });
      this.error(err.message)
    } finally {
       // Ensure client is closed
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