import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../../base-command.js'
import * as Ably from 'ably'

export default class ChannelsOccupancySubscribe extends AblyBaseCommand {
  static description = 'Subscribe to real-time occupancy metrics for a channel'

  static examples = [
    '$ ably channels occupancy subscribe my-channel',
    '$ ably channels occupancy subscribe --api-key "YOUR_API_KEY" my-channel',
    '$ ably channels occupancy subscribe --format json my-channel',
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
      description: 'Channel name to subscribe to occupancy for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsOccupancySubscribe)
    
    let client: Ably.Realtime | null = null;
    
    try {
      this.log('Connecting to Ably...')
      
      // Create the Ably client
      client = await this.createAblyClient(flags)
      if (!client) return

      // Get the channel with occupancy option enabled
      const channelName = args.channel
      const channelOptions = {
        params: {
          occupancy: 'metrics' // Enable occupancy events
        }
      }
      
      const channel = client.channels.get(channelName, channelOptions)

      // Setup connection state change handler
      client.connection.on('connected', () => {
        this.log('Successfully connected to Ably')
        this.log(`Subscribing to occupancy events for channel '${channelName}'...`)
      })

      client.connection.on('disconnected', () => {
        this.log('Disconnected from Ably')
      })

      client.connection.on('failed', (err: Ably.ConnectionStateChange) => {
        this.error(`Connection failed: ${err.reason?.message || 'Unknown error'}`)
      })

      this.log('Listening for occupancy updates. Press Ctrl+C to exit.')
      
      // Subscribe to occupancy events
      channel.subscribe('[meta]occupancy', (message: any) => {
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

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = () => {
          this.log('\nUnsubscribing and closing connection...')
          channel.unsubscribe()
          if (client) {
            client.connection.once('closed', () => {
              this.log('Connection closed')
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
      this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (client) client.close()
    }
  }
} 