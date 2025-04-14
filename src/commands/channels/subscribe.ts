import {Args, Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'
import { formatJson, isJsonData } from '../../utils/json-formatter.js'

export default class ChannelsSubscribe extends AblyBaseCommand {
  static override description = 'Subscribe to messages published on one or more Ably channels'

  static override examples = [
    '$ ably channels subscribe my-channel',
    '$ ably channels subscribe my-channel another-channel',
    '$ ably channels subscribe --api-key "YOUR_API_KEY" my-channel',
    '$ ably channels subscribe --token "YOUR_ABLY_TOKEN" my-channel',
    '$ ably channels subscribe --rewind 10 my-channel',
    '$ ably channels subscribe --delta my-channel',
    '$ ably channels subscribe --cipher-key YOUR_CIPHER_KEY my-channel',
    '$ ably channels subscribe my-channel --json',
    '$ ably channels subscribe my-channel --pretty-json'
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    rewind: Flags.integer({
      description: 'Number of messages to rewind when subscribing',
      default: 0,
    }),
    delta: Flags.boolean({
      description: 'Enable delta compression for messages',
      default: false,
    }),
    'cipher-key': Flags.string({
      description: 'Encryption key for decrypting messages (hex-encoded)',
    }),
    'cipher-algorithm': Flags.string({
      description: 'Encryption algorithm to use',
      default: 'aes',
    }),
    'cipher-key-length': Flags.integer({
      description: 'Length of encryption key in bits',
      default: 256,
    }),
    'cipher-mode': Flags.string({
      description: 'Cipher mode to use',
      default: 'cbc',
    }),
  }

  static override args = {
    channels: Args.string({
      description: 'Channel name(s) to subscribe to',
      required: true,
      multiple: false,
    }),
  }

  static override strict = false

  private client: Ably.Realtime | null = null;

  async run(): Promise<void> {
    const {args, flags, argv} = await this.parse(ChannelsSubscribe)

    // Get all channel names from argv
    const channelNames = argv as string[]

    try {
      // Create the Ably client
      this.client = await this.createAblyClient(flags)
      if (!this.client) return

      const client = this.client; // Local const

      if (channelNames.length === 0) {
        const errorMsg = 'At least one channel name is required';
        this.logCliEvent(flags, 'subscribe', 'validationError', errorMsg, { error: errorMsg });
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: false, error: errorMsg }, flags))
        } else {
          this.error(errorMsg)
        }
        return
      }

      // Setup channels with appropriate options
      const channels = channelNames.map((channelName: string) => {
        const channelOptions: Ably.ChannelOptions = {}

        // Configure encryption if cipher key is provided
        if (flags['cipher-key']) {
          channelOptions.cipher = {
            key: flags['cipher-key'],
            algorithm: flags['cipher-algorithm'],
            keyLength: flags['cipher-key-length'],
            mode: flags['cipher-mode'],
          }
          this.logCliEvent(flags, 'subscribe', 'encryptionEnabled', `Encryption enabled for channel ${channelName}`, { channel: channelName, algorithm: flags['cipher-algorithm'] });
        }

        // Configure delta compression
        if (flags.delta) {
          channelOptions.params = {
            ...channelOptions.params,
            delta: 'vcdiff',
          }
           this.logCliEvent(flags, 'subscribe', 'deltaEnabled', `Delta compression enabled for channel ${channelName}`, { channel: channelName });
        }

        // Configure rewind
        if (flags.rewind > 0) {
          channelOptions.params = {
            ...channelOptions.params,
            rewind: flags.rewind.toString(),
          }
          this.logCliEvent(flags, 'subscribe', 'rewindEnabled', `Rewind enabled for channel ${channelName}`, { channel: channelName, count: flags.rewind });
        }

        return client!.channels.get(channelName, channelOptions)
      })

      // Setup connection state change handler
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

      // Subscribe to messages on all channels
      channels.forEach((channel: Ably.RealtimeChannel) => {
        this.logCliEvent(flags, 'subscribe', 'subscribing', `Subscribing to channel: ${channel.name}`, { channel: channel.name });
        if (!this.shouldOutputJson(flags)) {
          this.log(`${chalk.green('Subscribing to channel:')} ${chalk.cyan(channel.name)}`)
        }

        // Listen to channel state changes
        channel.on((stateChange: Ably.ChannelStateChange) => {
            this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${channel.name}' state changed to ${stateChange.current}`, { channel: channel.name, reason: stateChange.reason });
            if (!this.shouldOutputJson(flags)) {
               if (stateChange.current === 'attached') {
                   this.log(`${chalk.green('✓')} Successfully attached to channel: ${chalk.cyan(channel.name)}`);
               } else if (stateChange.current === 'failed') {
                    this.log(`${chalk.red('✗')} Failed to attach to channel ${chalk.cyan(channel.name)}: ${stateChange.reason?.message || 'Unknown error'}`);
               } else if (stateChange.current === 'detached') {
                    this.log(`${chalk.yellow('!')} Detached from channel: ${chalk.cyan(channel.name)} ${stateChange.reason ? `(Reason: ${stateChange.reason.message})` : ''}`);
               }
            }
        });

        channel.subscribe((message: Ably.Message) => {
          const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString()
          const messageEvent = {
              timestamp,
              channel: channel.name,
              event: message.name || '(none)',
              data: message.data,
              encoding: message.encoding,
              clientId: message.clientId,
              connectionId: message.connectionId,
              id: message.id
          };
          this.logCliEvent(flags, 'subscribe', 'messageReceived', `Received message on channel ${channel.name}`, messageEvent);

          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput(messageEvent, flags))
          } else {
            const name = message.name ? message.name : '(none)'

            // Message header with timestamp and channel info
            this.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`Channel: ${channel.name}`)} | ${chalk.yellow(`Event: ${name}`)}`)

            // Message data with consistent formatting
            if (isJsonData(message.data)) {
              this.log(chalk.blue('Data:'))
              this.log(formatJson(message.data))
            } else {
              this.log(`${chalk.blue('Data:')} ${message.data}`)
            }
            this.log('') // Empty line for better readability
          }
        })
      })

      this.logCliEvent(flags, 'subscribe', 'listening', 'Listening for messages. Press Ctrl+C to exit.');
      if (!this.shouldOutputJson(flags)) {
        this.log('Listening for messages. Press Ctrl+C to exit.')
      }

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = () => {
          this.logCliEvent(flags, 'subscribe', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');
          if (!this.shouldOutputJson(flags)) {
            this.log('\nUnsubscribing and closing connection...')
          }

          channels.forEach((channel: Ably.RealtimeChannel) => {
             this.logCliEvent(flags, 'subscribe', 'unsubscribing', `Unsubscribing from channel ${channel.name}`, { channel: channel.name });
             try {
                channel.unsubscribe();
                this.logCliEvent(flags, 'subscribe', 'unsubscribed', `Unsubscribed from channel ${channel.name}`, { channel: channel.name });
             } catch (err) {
                 this.logCliEvent(flags, 'subscribe', 'unsubscribeError', `Error unsubscribing from ${channel.name}: ${err instanceof Error ? err.message : String(err)}`, { channel: channel.name, error: err instanceof Error ? err.message : String(err) });
             }
          })

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
        this.logCliEvent(flags, 'subscribe', 'fatalError', `Error during subscription: ${errorMsg}`, { error: errorMsg, channels: channelNames });
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: false, error: errorMsg, channels: channelNames }, flags))
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