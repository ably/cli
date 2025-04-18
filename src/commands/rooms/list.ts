import { Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { ChatBaseCommand } from '../../chat-base-command.js'

// Add interface definitions at the beginning of the file
interface RoomMetrics {
  connections?: number;
  presenceConnections?: number;
  presenceMembers?: number;
  publishers?: number;
  subscribers?: number;
}

interface RoomStatus {
  occupancy?: {
    metrics?: RoomMetrics;
  };
}

interface RoomItem {
  channelId: string;
  roomName: string;
  status?: RoomStatus;
  [key: string]: unknown;
}

interface RoomListParams {
  limit: number;
  prefix?: string;
}

export default class RoomsList extends ChatBaseCommand {
  static override description = 'List active chat rooms'

  static override examples = [
    '$ ably rooms list',
    '$ ably rooms list --prefix my-room',
    '$ ably rooms list --limit 50',
    '$ ably rooms list --json',
    '$ ably rooms list --pretty-json']

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    'limit': Flags.integer({
      default: 100,
      description: 'Maximum number of rooms to return',
    }),
    'prefix': Flags.string({
      char: 'p',
      description: 'Filter rooms by prefix',
    }),
    
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(RoomsList)

    // Create the Ably client
    const client = await this.createAblyClient(flags)
    if (!client) return

    try {
      // REST client for channel enumeration
      const rest = new Ably.Rest(this.getClientOptions(flags))

      // Build params for channel listing
      // We request more channels than the limit to account for filtering
      const params: RoomListParams = {
        limit: flags.limit * 5, // Request more to allow for filtering
      }

      if (flags.prefix) {
        params.prefix = flags.prefix
      }

      // Fetch channels
      const channelsResponse = await rest.request('get', '/channels', 2, params, null)

      if (channelsResponse.statusCode !== 200) {
        this.error(`Failed to list rooms: ${channelsResponse.statusCode}`)
        return
      }

      // Filter to only include chat channels
      const allChannels = channelsResponse.items || []
      
      // Map to store deduplicated rooms
      const chatRooms = new Map<string, RoomItem>()
      
      // Filter for chat channels and deduplicate
      for (const channel of allChannels) {
        const {channelId} = channel
        
        // Check if this is a chat channel (has ::$chat suffix)
        if (channelId.includes('::$chat')) {
          // Extract the base room name (everything before the first ::$chat)
          // We need to escape the $ in the regex pattern since it's a special character
          const roomNameMatch = channelId.match(/^(.+?)::\$chat.*$/)
          if (roomNameMatch && roomNameMatch[1]) {
            const roomName = roomNameMatch[1]
            // Only add if we haven't seen this room before
            if (!chatRooms.has(roomName)) {
              // Store the original channel data but with the simple room name
              const roomData = { ...channel, channelId: roomName, roomName }
              chatRooms.set(roomName, roomData)
            }
          }
        }
      }
      
      // Convert map to array
      const rooms = [...chatRooms.values()]
      
      // Limit the results to the requested number
      const limitedRooms = rooms.slice(0, flags.limit)

      // Output rooms based on format
      if (this.shouldOutputJson(flags)) {
        // Wrap the array in an object for formatJsonOutput
        this.log(this.formatJsonOutput({ items: limitedRooms }, flags))
      } else {
        if (limitedRooms.length === 0) {
          this.log('No active chat rooms found.')
          return
        }

        this.log(`Found ${chalk.cyan(limitedRooms.length.toString())} active chat rooms:`)
        
        for (const room of limitedRooms) {
          this.log(`${chalk.green(room.roomName)}`)
          
          // Show occupancy if available
          if (room.status?.occupancy?.metrics) {
            const {metrics} = room.status.occupancy
            this.log(`  ${chalk.dim('Connections:')} ${metrics.connections || 0}`)
            this.log(`  ${chalk.dim('Publishers:')} ${metrics.publishers || 0}`)
            this.log(`  ${chalk.dim('Subscribers:')} ${metrics.subscribers || 0}`)
            
            if (metrics.presenceConnections !== undefined) {
              this.log(`  ${chalk.dim('Presence Connections:')} ${metrics.presenceConnections}`)
            }
            
            if (metrics.presenceMembers !== undefined) {
              this.log(`  ${chalk.dim('Presence Members:')} ${metrics.presenceMembers}`)
            }
          }
          
          this.log('') // Add a line break between rooms
        }

        if (rooms.length > flags.limit) {
          this.log(chalk.yellow(`Showing ${flags.limit} of ${rooms.length} rooms. Use --limit to show more.`))
        }
      }
    } catch (error) {
      this.error(`Error listing rooms: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      client.close()
    }
  }
} 