import {Args, Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'
import * as Ably from 'ably'

export default class ChannelsSubscribe extends AblyBaseCommand {
  static override description = 'Subscribe to messages published on one or more Ably channels'

  static override examples = [
    '$ ably channels subscribe my-channel',
    '$ ably channels subscribe my-channel another-channel',
    '$ ably channels subscribe --api-key "YOUR_API_KEY" my-channel',
    '$ ably channels subscribe --rewind 10 my-channel',
    '$ ably channels subscribe --delta my-channel',
    '$ ably channels subscribe --cipher-key YOUR_CIPHER_KEY my-channel',
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

    // Validate API key is provided
    if (!flags['api-key']) {
      this.error('An API key is required. Please provide it with --api-key flag or set the ABLY_API_KEY environment variable.')
      return
    }

    // Create the Ably client
    const realtime = this.createAblyClient(flags)

    try {
      // Get all channel names from argv
      const channelNames = argv as string[]

      if (channelNames.length === 0) {
        this.error('At least one channel name is required')
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
        
        return realtime.channels.get(channelName, channelOptions)
      })

      // Setup connection state change handler
      realtime.connection.on('connected', () => {
        this.log('Successfully connected to Ably')
      })

      realtime.connection.on('disconnected', () => {
        this.log('Disconnected from Ably')
      })

      realtime.connection.on('failed', (err: Ably.ConnectionStateChange) => {
        this.error(`Connection failed: ${err.reason?.message || 'Unknown error'}`)
        process.exit(1)
      })

      // Subscribe to messages on all channels
      channels.forEach((channel: Ably.RealtimeChannel) => {
        this.log(`Subscribing to channel: ${channel.name}`)
        
        channel.subscribe((message: Ably.Message) => {
          const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString()
          const name = message.name ? message.name : '(none)'
          
          this.log(`[${timestamp}] Channel: ${channel.name} | Event: ${name}`)
          this.log(`Data: ${JSON.stringify(message.data, null, 2)}`)
        })
      })

      // Setup graceful shutdown
      const cleanup = () => {
        this.log('\nUnsubscribing and closing connection...')
        channels.forEach((channel: Ably.RealtimeChannel) => channel.unsubscribe())
        realtime.close()
        process.exit(0)
      }

      process.on('SIGINT', cleanup)
      process.on('SIGTERM', cleanup)

      this.log('Listening for messages. Press Ctrl+C to exit.')
    } catch (error) {
      this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      realtime.close()
    }
  }
} 