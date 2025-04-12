import { Args, Flags } from '@oclif/core'
import { ChatBaseCommand } from '../../../chat-base-command.js'
import { ChatClient, RoomStatus, Subscription } from '@ably/chat'

interface ChatClients {
  chatClient: ChatClient;
  realtimeClient: any;
}

interface OccupancyMetrics {
  connections?: number;
  presenceMembers?: number;
}

export default class RoomsOccupancySubscribe extends ChatBaseCommand {
  static description = 'Subscribe to real-time occupancy metrics for a room'

  static examples = [
    '$ ably rooms occupancy subscribe my-room',
    '$ ably rooms occupancy subscribe my-room --json',
    '$ ably rooms occupancy subscribe --pretty-json my-room'
  ]

  static flags = {
    ...ChatBaseCommand.globalFlags,
  }

  static args = {
    roomId: Args.string({
      description: 'Room ID to subscribe to occupancy for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsOccupancySubscribe)
    
    let clients: ChatClients | null = null
    let unsubscribeOccupancy: Subscription | null = null
    
    try {
      if (!this.shouldOutputJson(flags)) {
        this.log('Connecting to Ably...')
      }
      
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const { chatClient } = clients
      
      // Get the room with occupancy option enabled
      const roomId = args.roomId
      const room = await chatClient.rooms.get(roomId, {
        occupancy: {}
      })
      
      // Subscribe to room status changes
      const { off: unsubscribeStatus } = room.onStatusChange((statusChange) => {
        if (statusChange.current === RoomStatus.Attached) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: true,
              status: 'connected',
              roomId
            }, flags))
          } else {
            this.log('Successfully connected to Ably')
            this.log(`Subscribing to occupancy events for room '${roomId}'...`)
          }
        } else if (statusChange.current === RoomStatus.Detached) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              status: 'disconnected',
              roomId
            }, flags))
          } else {
            this.log('Disconnected from Ably')
          }
        } else if (statusChange.current === RoomStatus.Failed) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              status: 'failed',
              error: room.error?.message || 'Unknown error',
              roomId
            }, flags))
          } else {
            this.error(`Connection failed: ${room.error?.message || 'Unknown error'}`)
          }
        }
      })
      
      // Attach to the room
      await room.attach()

      if (!this.shouldOutputJson(flags)) {
        this.log('Listening for occupancy updates. Press Ctrl+C to exit.')
      }
      
      // Get the initial occupancy metrics
      const initialOccupancy = await room.occupancy.get()
      this.displayOccupancyMetrics(initialOccupancy, roomId, flags, true)
      
      // Subscribe to occupancy events
      unsubscribeOccupancy = room.occupancy.subscribe((occupancyMetrics) => {
        this.displayOccupancyMetrics(occupancyMetrics, roomId, flags)
      })

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = () => {
          if (!this.shouldOutputJson(flags)) {
            this.log('\nUnsubscribing and closing connection...')
          }
          
          // Unsubscribe from occupancy events
          if (unsubscribeOccupancy) {
            unsubscribeOccupancy.unsubscribe()
          }
          
          // Unsubscribe from status changes
          unsubscribeStatus()
          
          const releaseAndClose = async () => {
            try {
              await chatClient.rooms.release(roomId)
            } catch (error) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  roomId
                }, flags))
              } else {
                this.log(`Error releasing room: ${error instanceof Error ? error.message : String(error)}`)
              }
            }
            
            if (clients?.realtimeClient) {
              clients.realtimeClient.close()
            }
            
            resolve()
          }
          
          void releaseAndClose()
        }

        process.on('SIGINT', cleanup)
        process.on('SIGTERM', cleanup)
      })
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          roomId: args.roomId
        }, flags))
      } else {
        this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
  
  private displayOccupancyMetrics(occupancyMetrics: OccupancyMetrics, roomId: string, flags: any, isInitial = false): void {
    const timestamp = new Date().toISOString()
    
    if (this.shouldOutputJson(flags)) {
      this.log(this.formatJsonOutput({
        success: true,
        timestamp,
        roomId,
        metrics: occupancyMetrics
      }, flags))
    } else {
      const prefix = isInitial ? 'Initial occupancy' : 'Occupancy update'
      this.log(`[${timestamp}] ${prefix} for room '${roomId}'`)
      this.log(`  Connections: ${occupancyMetrics.connections ?? 0}`)
      
      if (occupancyMetrics.presenceMembers !== undefined) {
        this.log(`  Presence Members: ${occupancyMetrics.presenceMembers}`)
      }
      
      this.log('') // Empty line for better readability
    }
  }
} 