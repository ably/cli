import {Args, Flags} from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import {AblyBaseCommand} from '../../base-command.js'
import { formatJson, isJsonData } from '../../utils/json-formatter.js'

export default class ChannelsSubscribe extends AblyBaseCommand {
  static override args = {
    channels: Args.string({
      description: 'Channel name(s) to subscribe to',
      multiple: false,
      required: true,
    }),
  }

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
    'cipher-algorithm': Flags.string({
      default: 'aes',
      description: 'Encryption algorithm to use',
    }),
    'cipher-key': Flags.string({
      description: 'Encryption key for decrypting messages (hex-encoded)',
    }),
    'cipher-key-length': Flags.integer({
      default: 256,
      description: 'Length of encryption key in bits',
    }),
    'cipher-mode': Flags.string({
      default: 'cbc',
      description: 'Cipher mode to use',
    }),
    delta: Flags.boolean({
      default: false,
      description: 'Enable delta compression for messages',
    }),
    rewind: Flags.integer({
      default: 0,
      description: 'Number of messages to rewind when subscribing',
    }),
  }

  static override strict = false

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
    const {args, argv, flags} = await this.parse(ChannelsSubscribe)

    // Get all channel names from argv
    const channelNames = argv as string[]

    try {
      // Create the Ably client
      this.client = await this.createAblyClient(flags)
      if (!this.client) return

      const {client} = this; // Local const

      if (channelNames.length === 0) {
        const errorMsg = 'At least one channel name is required';
        this.logCliEvent(flags, 'subscribe', 'validationError', errorMsg, { error: errorMsg });
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ error: errorMsg, success: false }, flags))
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
            algorithm: flags['cipher-algorithm'],
            key: flags['cipher-key'],
            keyLength: flags['cipher-key-length'],
            mode: flags['cipher-mode'],
          }
          this.logCliEvent(flags, 'subscribe', 'encryptionEnabled', `Encryption enabled for channel ${channelName}`, { algorithm: flags['cipher-algorithm'], channel: channelName });
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

      // Subscribe to messages on all channels
      for (const channel of channels) {
        this.logCliEvent(flags, 'subscribe', 'subscribing', `Subscribing to channel: ${channel.name}`, { channel: channel.name });
        if (!this.shouldOutputJson(flags)) {
          this.log(`${chalk.green('Subscribing to channel:')} ${chalk.cyan(channel.name)}`)
        }

        // Listen to channel state changes
        channel.on((stateChange: Ably.ChannelStateChange) => {
            this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${channel.name}' state changed to ${stateChange.current}`, { channel: channel.name, reason: stateChange.reason });
            if (!this.shouldOutputJson(flags)) {
               switch (stateChange.current) {
               case 'attached': {
                   this.log(`${chalk.green('✓')} Successfully attached to channel: ${chalk.cyan(channel.name)}`);
               
               break;
               }

               case 'failed': {
                    this.log(`${chalk.red('✗')} Failed to attach to channel ${chalk.cyan(channel.name)}: ${stateChange.reason?.message || 'Unknown error'}`);
               
               break;
               }

               case 'detached': {
                    this.log(`${chalk.yellow('!')} Detached from channel: ${chalk.cyan(channel.name)} ${stateChange.reason ? `(Reason: ${stateChange.reason.message})` : ''}`);
               
               break;
               }
               // No default
               }
            }
        });

        channel.subscribe((message: Ably.Message) => {
          const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString()
          const messageEvent = {
              channel: channel.name,
              clientId: message.clientId,
              connectionId: message.connectionId,
              data: message.data,
              encoding: message.encoding,
              event: message.name || '(none)',
              id: message.id,
              timestamp
          };
          this.logCliEvent(flags, 'subscribe', 'messageReceived', `Received message on channel ${channel.name}`, messageEvent);

          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput(messageEvent, flags))
          } else {
            const name = message.name || '(none)'

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
      }

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

          for (const channel of channels) {
             this.logCliEvent(flags, 'subscribe', 'unsubscribing', `Unsubscribing from channel ${channel.name}`, { channel: channel.name });
             try {
                channel.unsubscribe();
                this.logCliEvent(flags, 'subscribe', 'unsubscribed', `Unsubscribed from channel ${channel.name}`, { channel: channel.name });
             } catch (error) {
                 this.logCliEvent(flags, 'subscribe', 'unsubscribeError', `Error unsubscribing from ${channel.name}: ${error instanceof Error ? error.message : String(error)}`, { channel: channel.name, error: error instanceof Error ? error.message : String(error) });
             }
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
        this.logCliEvent(flags, 'subscribe', 'fatalError', `Error during subscription: ${errorMsg}`, { channels: channelNames, error: errorMsg });
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ channels: channelNames, error: errorMsg, success: false }, flags))
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
} 