import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../../base-command.js'
import * as Ably from 'ably'

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

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsOccupancySubscribe)
    
    let client: Ably.Realtime | null = null;
    const channelName = args.channel
    
    try {
      if (!this.shouldOutputJson(flags)) {
        this.log('Connecting to Ably...')
      }
      
      // Create the Ably client
      client = await this.createAblyClient(flags)
      if (!client) return

      // Get the channel with occupancy option enabled
      const channelOptions = {
        params: {
          occupancy: 'metrics' // Enable occupancy events
        }
      }
      
      const channel = client.channels.get(channelName, channelOptions)

      // Setup connection state change handler
      client.connection.on('connected', () => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            status: 'connected',
            channel: channelName
          }, flags))
        } else {
          this.log('Successfully connected to Ably')
          this.log(`Subscribing to occupancy events for channel '${channelName}'...`)
        }
      })

      client.connection.on('disconnected', () => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            status: 'disconnected',
            channel: channelName
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
            channel: channelName
          }, flags))
        } else {
          this.error(`Connection failed: ${err.reason?.message || 'Unknown error'}`)
        }
      })

      if (!this.shouldOutputJson(flags)) {
        this.log('Listening for occupancy updates. Press Ctrl+C to exit.')
      }
      
      // Subscribe to occupancy events
      channel.subscribe('[meta]occupancy', (message: any) => {
        const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString()
        
        // Extract occupancy metrics from the message
        const occupancyMetrics = message.data?.metrics
        
        if (!occupancyMetrics) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              timestamp,
              error: 'Received occupancy update but no metrics available',
              channel: channelName
            }, flags))
          } else {
            this.log(`[${timestamp}] Received occupancy update but no metrics available`)
          }
          return
        }

        // Output the occupancy metrics based on format
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp,
            channel: channelName,
            metrics: occupancyMetrics
          }, flags))
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
          if (!this.shouldOutputJson(flags)) {
            this.log('\nUnsubscribing and closing connection...')
          }
          
          channel.unsubscribe()
          
          if (client) {
            client.connection.once('closed', () => {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  status: 'closed',
                  channel: channelName
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
          channel: channelName
        }, flags))
      } else {
        this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (client) client.close()
    }
  }
} 