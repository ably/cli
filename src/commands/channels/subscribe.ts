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

  async run(): Promise<void> {
    const {args, flags, argv} = await this.parse(ChannelsSubscribe)

    let client: Ably.Realtime | null = null;
    // Get all channel names from argv
    const channelNames = argv as string[]

    try {
      // Create the Ably client
      client = await this.createAblyClient(flags)
      if (!client) return

      if (channelNames.length === 0) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            error: 'At least one channel name is required'
          }, flags))
        } else {
          this.error('At least one channel name is required')
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
        }
        
        // Configure delta compression
        if (flags.delta) {
          channelOptions.params = {
            ...channelOptions.params,
            delta: 'vcdiff',
          }
        }
        
        // Configure rewind
        if (flags.rewind > 0) {
          channelOptions.params = {
            ...channelOptions.params,
            rewind: flags.rewind.toString(),
          }
        }
        
        return client!.channels.get(channelName, channelOptions)
      })

      // Setup connection state change handler
      client.connection.on('connected', () => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            status: 'connected',
            channels: channelNames
          }, flags))
        } else {
          this.log('Successfully connected to Ably')
        }
      })

      client.connection.on('disconnected', () => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            status: 'disconnected',
            channels: channelNames
          }, flags))
        } else {
          this.log('Disconnected from Ably')
        }
      })

      client.connection.on('failed', (err: Ably.ConnectionStateChange) => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            status: 'failed',
            error: err.reason?.message || 'Unknown error',
            channels: channelNames
          }, flags))
        } else {
          this.error(`Connection failed: ${err.reason?.message || 'Unknown error'}`)
        }
      })

      // Subscribe to messages on all channels
      channels.forEach((channel: Ably.RealtimeChannel) => {
        if (!this.shouldOutputJson(flags)) {
          this.log(`${chalk.green('Subscribing to channel:')} ${chalk.cyan(channel.name)}`)
        }
        
        channel.subscribe((message: Ably.Message) => {
          const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString()
          
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: true,
              timestamp,
              channel: channel.name,
              event: message.name || '(none)',
              data: message.data,
              encoding: message.encoding,
              clientId: message.clientId,
              connectionId: message.connectionId,
              id: message.id
            }, flags))
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
      
      if (!this.shouldOutputJson(flags)) {
        this.log('Listening for messages. Press Ctrl+C to exit.')
      }

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = () => {
          if (!this.shouldOutputJson(flags)) {
            this.log('\nUnsubscribing and closing connection...')
          }
          
          channels.forEach((channel: Ably.RealtimeChannel) => channel.unsubscribe())
          
          if (client) {
            client.connection.once('closed', () => {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  status: 'closed',
                  channels: channelNames
                }, flags))
              } else {
                this.log('Connection closed')
              }
              resolve()
            })
            client.close()
          } else {
            resolve()
          }
        }

        process.on('SIGINT', cleanup)
        process.on('SIGTERM', cleanup)
      })
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          channels: channelNames
        }, flags))
      } else {
        this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (client) client.close()
    }
  }
} 