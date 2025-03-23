import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../../base-command.js'

export default class ChannelsOccupancyLive extends AblyBaseCommand {
  static description = 'Subscribe to real-time occupancy metrics for a channel'

  static examples = [
    '$ ably channels occupancy:live my-channel',
    '$ ably channels occupancy:live --api-key "YOUR_API_KEY" my-channel',
    '$ ably channels occupancy:live --format json my-channel',
  ]

  static flags = {
    ...AblyBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  static args = {
    channel: Args.string({
      description: 'Channel name to get live occupancy for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsOccupancyLive)
    
    // Validate API key is provided
    if (!flags['api-key']) {
      this.error('An API key is required. Please provide it with --api-key flag or set the ABLY_API_KEY environment variable.')
      return
    }

    // Create the Ably client
    const realtime = this.createAblyClient(flags)

    try {
      // Get the channel with occupancy option enabled
      const channelName = args.channel
      const channelOptions = {
        params: {
          occupancy: 'metrics' // Enable occupancy events
        }
      }
      
      const channel = realtime.channels.get(channelName, channelOptions)

      // Setup connection state change handler
      realtime.connection.on('connected', () => {
        this.log('Successfully connected to Ably')
        this.log(`Subscribing to occupancy events for channel '${channelName}'...`)
      })

      realtime.connection.on('disconnected', () => {
        this.log('Disconnected from Ably')
      })

      realtime.connection.on('failed', (err) => {
        this.error(`Connection failed: ${err.reason?.message || 'Unknown error'}`)
        process.exit(1)
      })

      // Subscribe to occupancy events
      channel.subscribe('[meta]occupancy', (message) => {
        const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString()
        
        // Extract occupancy metrics from the message
        const occupancyMetrics = message.data?.metrics
        
        if (!occupancyMetrics) {
          this.log(`[${timestamp}] Received occupancy update but no metrics available`)
          return
        }

        // Output the occupancy metrics based on format
        if (flags.format === 'json') {
          const jsonOutput = {
            timestamp,
            channel: channelName,
            metrics: occupancyMetrics
          }
          this.log(JSON.stringify(jsonOutput))
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

      // Setup graceful shutdown
      const cleanup = () => {
        this.log('\nUnsubscribing and closing connection...')
        channel.unsubscribe()
        realtime.close()
        process.exit(0)
      }

      process.on('SIGINT', cleanup)
      process.on('SIGTERM', cleanup)
      
      this.log('Connecting to Ably...')
      this.log('Listening for occupancy updates. Press Ctrl+C to exit.')
    } catch (error) {
      this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      realtime.close()
    }
  }
} 