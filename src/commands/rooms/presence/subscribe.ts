import { Args, Flags } from '@oclif/core'
import { ChatBaseCommand } from '../../../chat-base-command.js'
import { ChatClient, RoomStatus, Subscription } from '@ably/chat'
import chalk from 'chalk'

interface ChatClients {
  chatClient: ChatClient;
  realtimeClient: any;
}

export default class RoomsPresenceSubscribe extends ChatBaseCommand {
  static override description = 'Subscribe to presence events in a chat room'

  static override examples = [
    '$ ably rooms presence subscribe my-room',
    '$ ably rooms presence subscribe my-room --format json',
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  static override args = {
    roomId: Args.string({
      description: 'Room ID to subscribe to presence for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsPresenceSubscribe)
    
    let clients: ChatClients | null = null
    let presenceSubscription: Subscription | null = null
    
    try {
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const { chatClient } = clients
      const roomId = args.roomId
      
      // Get the room with presence option
      const room = await chatClient.rooms.get(roomId, {
        presence: {}
      })
      
      // Subscribe to room status changes
      const { off: unsubscribeStatus } = room.onStatusChange((statusChange) => {
        if (statusChange.current === RoomStatus.Attached) {
          this.log(`${chalk.green('Successfully connected to room:')} ${chalk.cyan(roomId)}`)
        } else if (statusChange.current === RoomStatus.Detached) {
          this.log(chalk.yellow('Disconnected from room'))
        } else if (statusChange.current === RoomStatus.Failed) {
          this.error(`${chalk.red('Connection failed:')} ${room.error?.message || 'Unknown error'}`)
        }
      })
      
      // Attach to the room
      await room.attach()
      
      // Get current presence set
      this.log(`Fetching current presence members for room ${chalk.cyan(roomId)}...`)
      
      const members = await room.presence.get()
      
      // Output current members based on format
      if (flags.format === 'json') {
        this.log(JSON.stringify(members, null, 2))
      } else {
        if (members.length === 0) {
          this.log(chalk.yellow('No members are currently present in this room.'))
        } else {
          this.log(`\n${chalk.cyan('Current presence members')} (${chalk.bold(members.length.toString())}):\n`)
          
          members.forEach(member => {
            this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)
            
            if (member.data && Object.keys(member.data).length > 0) {
              this.log(`  ${chalk.dim('Data:')} ${JSON.stringify(member.data, null, 2)}`)
            }
            
            // Connection ID isn't available in the Chat SDK's PresenceMember type
          })
        }
      }
      
      // Subscribe to presence events
      this.log(`\n${chalk.dim('Subscribing to presence events. Press Ctrl+C to exit.')}\n`)
      
      presenceSubscription = room.presence.subscribe(member => {
        const timestamp = new Date().toISOString()
        const action = member.action || 'unknown'
        
        if (flags.format === 'json') {
          const jsonOutput = {
            timestamp,
            action,
            member: {
              clientId: member.clientId,
              data: member.data
            }
          }
          this.log(JSON.stringify(jsonOutput))
        } else {
          let actionSymbol = '•'
          let actionColor = chalk.white
          
          switch (action) {
            case 'enter':
              actionSymbol = '✓'
              actionColor = chalk.green
              break
            case 'leave':
              actionSymbol = '✗'
              actionColor = chalk.red
              break
            case 'update':
              actionSymbol = '⟲'
              actionColor = chalk.yellow
              break
          }
          
          this.log(`[${timestamp}] ${actionColor(actionSymbol)} ${chalk.blue(member.clientId || 'Unknown')} ${actionColor(action)}`)
          
          if (member.data && Object.keys(member.data).length > 0) {
            this.log(`  ${chalk.dim('Data:')} ${JSON.stringify(member.data, null, 2)}`)
          }
        }
      })

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          this.log(`\n${chalk.yellow('Unsubscribing and closing connection...')}`)
          
          // Unsubscribe from presence events
          if (presenceSubscription) {
            presenceSubscription.unsubscribe()
          }
          
          // Unsubscribe from status changes
          unsubscribeStatus()
          
          try {
            await chatClient.rooms.release(roomId)
          } catch (error) {
            this.log(`Error releasing room: ${error instanceof Error ? error.message : String(error)}`)
          }
          
          if (clients?.realtimeClient) {
            clients.realtimeClient.close()
          }
          
          this.log(chalk.green('Successfully disconnected.'))
          resolve()
        }

        process.on('SIGINT', () => void cleanup())
        process.on('SIGTERM', () => void cleanup())
      })
    } catch (error) {
      this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 