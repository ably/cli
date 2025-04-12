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
    '$ ably rooms presence enter my-room --json',
    '$ ably rooms presence enter my-room --pretty-json'
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
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            error: 'Invalid JSON data format. Please provide a valid JSON string.',
            roomId
          }, flags))
        } else {
          this.error('Invalid JSON data format. Please provide a valid JSON string.')
        }
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
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: true,
                status: 'connected',
                roomId
              }, flags))
            } else {
              this.log(`${chalk.green('Successfully connected to room:')} ${chalk.cyan(roomId)}`)
            }
          }
        })
        
        // Subscribe to presence events using a general listener
        const { unsubscribe: unsubscribePresence } = room.presence.subscribe(member => {
          // Only show other members, not ourselves
          if (member.clientId !== chatClient.clientId) {
            const timestamp = new Date().toISOString()
            // Check what kind of presence event it is based on action property
            if (member.action === 'enter') {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  timestamp,
                  action: 'enter',
                  member: {
                    clientId: member.clientId,
                    data: member.data
                  },
                  roomId
                }, flags))
              } else {
                this.log(`${chalk.green('✓')} ${chalk.blue(member.clientId || 'Unknown')} entered room`)
              }
            } else if (member.action === 'leave') {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  timestamp,
                  action: 'leave',
                  member: {
                    clientId: member.clientId,
                    data: member.data
                  },
                  roomId
                }, flags))
              } else {
                this.log(`${chalk.red('✗')} ${chalk.blue(member.clientId || 'Unknown')} left room`)
              }
            } else if (member.action === 'update') {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  timestamp,
                  action: 'update',
                  member: {
                    clientId: member.clientId,
                    data: member.data
                  },
                  roomId
                }, flags))
              } else {
                this.log(`${chalk.yellow('⟲')} ${chalk.blue(member.clientId || 'Unknown')} updated presence data:`)
                this.log(`  ${chalk.dim('Data:')} ${this.formatJsonOutput(member.data, flags)}`)
              }
            }
          }
        })
      }

      // Attach to the room then enter
      await room.attach()
      await room.presence.enter(presenceData)
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: true,
          action: 'enter',
          member: {
            clientId: chatClient.clientId,
            data: presenceData
          },
          roomId
        }, flags))
      } else {
        this.log(`${chalk.green('✓')} Entered room ${chalk.cyan(roomId)} as ${chalk.blue(chatClient.clientId || 'Unknown')}`)
      }
      
      if (flags['show-others']) {
        // Get and display current presence members
        const members = await room.presence.get()
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            members: members.filter(member => member.clientId !== chatClient.clientId).map(member => ({
              clientId: member.clientId,
              data: member.data
            })),
            roomId
          }, flags))
        } else {
          if (members.length > 1) {
            this.log(`\n${chalk.cyan('Current users in room')} (${chalk.bold(members.length.toString())}):\n`)
            
            members.forEach(member => {
              if (member.clientId !== chatClient.clientId) {
                this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)
                if (member.data && Object.keys(member.data).length > 0) {
                  this.log(`  ${chalk.dim('Data:')} ${this.formatJsonOutput(member.data, flags)}`)
                }
              }
            })
          } else {
            this.log(`\n${chalk.yellow('No other users are present in this room')}`)
          }
          
          this.log(`\n${chalk.dim('Listening for presence events until terminated. Press Ctrl+C to exit.')}`)
        }
      } else {
        if (!this.shouldOutputJson(flags)) {
          this.log(`\n${chalk.dim('Staying present in the room until terminated. Press Ctrl+C to exit.')}`)
        }
      }

      // Keep the process running until interrupted
      await new Promise((resolve) => {
        let isCleaningUp = false
        
        const cleanup = async () => {
          if (isCleaningUp) return
          isCleaningUp = true
          
          if (!this.shouldOutputJson(flags)) {
            this.log(`\n${chalk.yellow('Leaving room and closing connection...')}`)
          }
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                error: 'Force exiting after timeout',
                roomId
              }, flags))
            } else {
              this.log(chalk.red('Force exiting after timeout...'))
            }
            process.exit(1)
          }, 5000)
          
          try {
            // Leave the room using presence API
            try {
              await room.presence.leave()
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  action: 'leave',
                  roomId
                }, flags))
              } else {
                this.log(chalk.green('Successfully left room presence.'))
              }
            } catch (error) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  roomId
                }, flags))
              } else {
                this.log(`Note: ${error instanceof Error ? error.message : String(error)}`)
                this.log('Continuing with cleanup.')
              }
            }
            
            // Release the room
            try {
              await chatClient.rooms.release(roomId)
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  action: 'release',
                  roomId
                }, flags))
              } else {
                this.log(chalk.green('Successfully released room.'))
              }
            } catch (error) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  roomId
                }, flags))
              } else {
                this.log(`Note: ${error instanceof Error ? error.message : String(error)}`)
                this.log('Continuing with cleanup.')
              }
            }
            
            if (clients?.realtimeClient) {
              clients.realtimeClient.close()
            }
            
            if (!this.shouldOutputJson(flags)) {
              this.log(`${chalk.green('Successfully disconnected.')}`)
            }
            clearTimeout(forceExitTimeout)
            resolve(null)
            process.exit(0)
          } catch (error) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                roomId
              }, flags))
            } else {
              this.log(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`)
            }
            clearTimeout(forceExitTimeout)
            process.exit(1)
          }
        }

        process.once('SIGINT', () => void cleanup())
        process.once('SIGTERM', () => void cleanup())
      })
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          roomId: args.roomId
        }, flags))
      } else {
        this.error(`Error entering room presence: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 