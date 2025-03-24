import { Args, Flags } from '@oclif/core'
import { ChatBaseCommand } from '../../../chat-base-command.js'
import { ChatClient, RoomStatus } from '@ably/chat'
import chalk from 'chalk'

interface ChatClients {
  chatClient: ChatClient;
  realtimeClient: any;
}

export default class RoomsPresenceEnter extends ChatBaseCommand {
  static override description = 'Enter presence in a chat room and remain present until terminated'

  static override examples = [
    '$ ably rooms presence enter my-room',
    '$ ably rooms presence enter my-room --data \'{"status":"online","username":"john"}\'',
    '$ ably rooms presence enter my-room --client-id "user123"',
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    'data': Flags.string({
      description: 'Presence data to publish (JSON string)',
      default: '{}',
    }),
    'show-others': Flags.boolean({
      description: 'Show other presence events while present',
      default: true,
    }),
  }

  static override args = {
    roomId: Args.string({
      description: 'Room ID to enter presence on',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsPresenceEnter)

    let clients: ChatClients | null = null

    try {
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const { chatClient } = clients
      const roomId = args.roomId
      
      // Parse the data
      let presenceData = {}
      try {
        presenceData = JSON.parse(flags.data)
      } catch (error) {
        this.error('Invalid JSON data format. Please provide a valid JSON string.')
        return
      }

      // Get the room
      const room = await chatClient.rooms.get(roomId, {
        presence: {}
      })
      
      // Setup presence event handlers if we're showing other presence events
      if (flags['show-others']) {
        // Subscribe to room status changes
        const { off: unsubscribeStatus } = room.onStatusChange((statusChange) => {
          if (statusChange.current === RoomStatus.Attached) {
            this.log(`${chalk.green('Successfully connected to room:')} ${chalk.cyan(roomId)}`)
          }
        })
        
        // Subscribe to presence events using a general listener
        const { unsubscribe: unsubscribePresence } = room.presence.subscribe(member => {
          // Only show other members, not ourselves
          if (member.clientId !== chatClient.clientId) {
            // Check what kind of presence event it is based on action property
            if (member.action === 'enter') {
              this.log(`${chalk.green('✓')} ${chalk.blue(member.clientId || 'Unknown')} entered room`)
            } else if (member.action === 'leave') {
              this.log(`${chalk.red('✗')} ${chalk.blue(member.clientId || 'Unknown')} left room`)
            } else if (member.action === 'update') {
              this.log(`${chalk.yellow('⟲')} ${chalk.blue(member.clientId || 'Unknown')} updated presence data:`)
              this.log(JSON.stringify(member.data, null, 2))
            }
          }
        })
      }

      // Attach to the room then enter
      await room.attach()
      await room.presence.enter(presenceData)
      
      this.log(`${chalk.green('✓')} Entered room ${chalk.cyan(roomId)} as ${chalk.blue(chatClient.clientId || 'Unknown')}`)
      
      if (flags['show-others']) {
        // Get and display current presence members
        const members = await room.presence.get()
        
        if (members.length > 1) {
          this.log(`\n${chalk.cyan('Current users in room')} (${chalk.bold(members.length.toString())}):\n`)
          
          members.forEach(member => {
            if (member.clientId !== chatClient.clientId) {
              this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)
              if (member.data && Object.keys(member.data).length > 0) {
                this.log(`  ${chalk.dim('Data:')} ${JSON.stringify(member.data, null, 2)}`)
              }
            }
          })
        } else {
          this.log(`\n${chalk.yellow('No other users are present in this room')}`)
        }
        
        this.log(`\n${chalk.dim('Listening for presence events until terminated. Press Ctrl+C to exit.')}`)
      } else {
        this.log(`\n${chalk.dim('Staying present in the room until terminated. Press Ctrl+C to exit.')}`)
      }

      // Keep the process running until interrupted
      await new Promise((resolve) => {
        let isCleaningUp = false
        
        const cleanup = async () => {
          if (isCleaningUp) return
          isCleaningUp = true
          
          this.log(`\n${chalk.yellow('Leaving room and closing connection...')}`)
          
          try {
            // Leave the room using presence API
            await room.presence.leave()
            
            // Release the room
            await chatClient.rooms.release(roomId)
          } catch (error) {
            this.log(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`)
          }
          
          if (clients?.realtimeClient) {
            clients.realtimeClient.close()
          }
          
          this.log(`${chalk.green('Successfully disconnected.')}`)
          resolve(null)
        }

        process.on('SIGINT', () => void cleanup())
        process.on('SIGTERM', () => void cleanup())
      })
    } catch (error) {
      this.error(`Error entering room presence: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 