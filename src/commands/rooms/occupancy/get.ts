import { ChatClient } from '@ably/chat'
import { Args, Flags } from '@oclif/core'

import { ChatBaseCommand } from '../../../chat-base-command.js'

interface ChatClients {
  chatClient: ChatClient;
  realtimeClient: any;
}

interface OccupancyMetrics {
  connections?: number;
  presenceMembers?: number;
}

export default class RoomsOccupancyGet extends ChatBaseCommand {
  static args = {
    roomId: Args.string({
      description: 'Room ID to get occupancy for',
      required: true,
    }),
  }

  static description = 'Get current occupancy metrics for a room'

  static examples = [
    '$ ably rooms occupancy get my-room',
    '$ ably rooms occupancy get --api-key "YOUR_API_KEY" my-room',
    '$ ably rooms occupancy get my-room --json',
    '$ ably rooms occupancy get my-room --pretty-json'
  ]

  static flags = {
    ...ChatBaseCommand.globalFlags,
    
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsOccupancyGet)
    
    let clients: ChatClients | null = null
    
    try {
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const { chatClient } = clients
      const {roomId} = args
      
      // Get the room with occupancy enabled
      const room = await chatClient.rooms.get(roomId, {
        occupancy: {}
      })
      
      // Attach to the room to access occupancy
      await room.attach()
      
      // Get occupancy metrics using the Chat SDK's occupancy API
      const occupancyMetrics = await room.occupancy.get()
      
      // Output the occupancy metrics based on format
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          metrics: occupancyMetrics,
          roomId,
          success: true
        }, flags))
      } else {
        this.log(`Occupancy metrics for room '${roomId}':\n`)
        this.log(`Connections: ${occupancyMetrics.connections ?? 0}`)
        
        if (occupancyMetrics.presenceMembers !== undefined) {
          this.log(`Presence Members: ${occupancyMetrics.presenceMembers}`)
        }
      }
      
      // Release the room
      await chatClient.rooms.release(roomId)
      
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: error instanceof Error ? error.message : String(error),
          roomId: args.roomId,
          success: false
        }, flags))
      } else {
        this.error(`Error fetching room occupancy: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 