import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../../base-command.js'
import * as Ably from 'ably'

interface OccupancyMetrics {
  connections?: number;
  publishers?: number;
  subscribers?: number;
  presenceConnections?: number;
  presenceMembers?: number;
  presenceSubscribers?: number;
}

export default class ChannelsOccupancyGet extends AblyBaseCommand {
  static description = 'Get current occupancy metrics for a channel'

  static examples = [
    '$ ably channels occupancy:get my-channel',
    '$ ably channels occupancy:get --api-key "YOUR_API_KEY" my-channel',
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
      description: 'Channel name to get occupancy for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsOccupancyGet)
    
    // Validate API key is provided
    if (!flags['api-key']) {
      this.error('An API key is required. Please provide it with --api-key flag or set the ABLY_API_KEY environment variable.')
      return
    }

    // Create the Ably Realtime client
    const realtime = this.createAblyClient(flags)

    try {
      const channelName = args.channel
      
      // Use the realtime client to get channel details
      const channel = realtime.channels.get(channelName, { 
        params: { 
          occupancy: 'metrics' 
        } 
      })
      
      // Attach to the channel to get occupancy metrics
      await new Promise<void>((resolve) => {
        channel.once('attached', () => {
          resolve()
        })
        
        channel.attach()
      })
      
      // Listen for the first occupancy update
      const occupancyMetrics = await new Promise<OccupancyMetrics>((resolve, reject) => {
        const timeout = setTimeout(() => {
          channel.unsubscribe('[meta]occupancy')
          reject(new Error('Timed out waiting for occupancy metrics'))
        }, 5000) // 5 second timeout
        
        channel.subscribe('[meta]occupancy', (message) => {
          clearTimeout(timeout)
          channel.unsubscribe('[meta]occupancy')
          
          const metrics = message.data?.metrics
          if (metrics) {
            resolve(metrics)
          } else {
            reject(new Error('No occupancy metrics received'))
          }
        })
      })
      
      // Output the occupancy metrics based on format
      if (flags.format === 'json') {
        this.log(JSON.stringify(occupancyMetrics))
      } else {
        this.log(`Occupancy metrics for channel '${channelName}':\n`)
        this.log(`Connections: ${occupancyMetrics.connections ?? 0}`)
        this.log(`Publishers: ${occupancyMetrics.publishers ?? 0}`)
        this.log(`Subscribers: ${occupancyMetrics.subscribers ?? 0}`)
        
        if (occupancyMetrics.presenceConnections !== undefined) {
          this.log(`Presence Connections: ${occupancyMetrics.presenceConnections}`)
        }
        
        if (occupancyMetrics.presenceMembers !== undefined) {
          this.log(`Presence Members: ${occupancyMetrics.presenceMembers}`)
        }
        
        if (occupancyMetrics.presenceSubscribers !== undefined) {
          this.log(`Presence Subscribers: ${occupancyMetrics.presenceSubscribers}`)
        }
      }
      
      // Clean up
      await channel.detach()
      realtime.close()
    } catch (error) {
      this.error(`Error fetching channel occupancy: ${error instanceof Error ? error.message : String(error)}`)
      realtime.close()
    }
  }
} 