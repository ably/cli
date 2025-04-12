import { Flags } from '@oclif/core'
import { ChatBaseCommand } from '../../chat-base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

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
    'prefix': Flags.string({
      description: 'Filter rooms by prefix',
      char: 'p',
    }),
    'limit': Flags.integer({
      description: 'Maximum number of rooms to return',
      default: 100,
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
      const params: any = {
        limit: flags.limit * 5, // Request more to allow for filtering
      }

      if (flags.prefix) {
        params.prefix = flags.prefix
      }

      // Fetch channels
      const channelsResponse = await rest.request('get', '/channels', params)

      if (channelsResponse.statusCode !== 200) {
        this.error(`Failed to list rooms: ${channelsResponse.statusCode}`)
        return
      }

      // Filter to only include chat channels
      const allChannels = channelsResponse.items || []
      
      // Map to store deduplicated rooms
      const chatRooms = new Map<string, any>()
      
      // Filter for chat channels and deduplicate
      allChannels.forEach(channel => {
        const channelId = channel.channelId
        
        // Check if this is a chat channel (has ::$chat suffix)
        if (channelId.includes('::$chat')) {
          // Extract the base room name (everything before the first ::$chat)
          // We need to escape the $ in the regex pattern since it's a special character
          const roomNameMatch = channelId.match(/^(.+?)(?:::\$chat.*)$/)
          if (roomNameMatch && roomNameMatch[1]) {
            const roomName = roomNameMatch[1]
            // Only add if we haven't seen this room before
            if (!chatRooms.has(roomName)) {
              // Store the original channel data but with the simple room name
              const roomData = { ...channel, roomName, channelId: roomName }
              chatRooms.set(roomName, roomData)
            }
          }
        }
      })
      
      // Convert map to array
      const rooms = Array.from(chatRooms.values())
      
      // Limit the results to the requested number
      const limitedRooms = rooms.slice(0, flags.limit)

      // Output rooms based on format
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput(limitedRooms, flags))
      } else {
        if (limitedRooms.length === 0) {
          this.log('No active chat rooms found.')
          return
        }

        this.log(`Found ${chalk.cyan(limitedRooms.length.toString())} active chat rooms:`)
        
        limitedRooms.forEach(room => {
          this.log(`${chalk.green(room.roomName)}`)
          
          // Show occupancy if available
          if (room.status?.occupancy?.metrics) {
            const metrics = room.status.occupancy.metrics
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
        })

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