import {Args, Flags} from '@oclif/core'
import {ChatBaseCommand} from '../../../chat-base-command.js'
import chalk from 'chalk'

export default class TypingStart extends ChatBaseCommand {
  static override description = 'Start typing in an Ably Chat room (will remain typing until terminated)'

  static override examples = [
    '$ ably rooms typing start my-room',
    '$ ably rooms typing start --api-key "YOUR_API_KEY" my-room',
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
  }

  static override args = {
    roomId: Args.string({
      description: 'The room ID to start typing in',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TypingStart)
    
    let clients = null
    
    try {
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const {chatClient, realtimeClient} = clients
      
      // Get the room with typing enabled
      const room = await chatClient.rooms.get(args.roomId, {
        typing: { timeoutMs: 5000 },
      })
      
      // Create an interval to keep typing active
      let typingInterval: NodeJS.Timeout | null = null
      
      // Subscribe to room status changes
      const { off: unsubscribeStatus } = room.onStatusChange((statusChange) => {
        if (statusChange.current === 'attached') {
          this.log(`${chalk.green('Connected to room:')} ${chalk.bold(args.roomId)}`)
          
          // Start typing immediately
          room.typing.start()
          this.log(`${chalk.green('Started typing in room.')}`)
          this.log(`${chalk.dim('Will remain typing until this command is terminated. Press Ctrl+C to exit.')}`)
          
          // Keep typing active by calling start() periodically
          // We want this to be less than the timeout value to ensure continuous typing
          typingInterval = setInterval(() => {
            room.typing.start()
          }, 4000) // Slightly less than the 5 second timeout
        } else if (statusChange.current === 'failed') {
          this.error(`Failed to attach to room: ${room.error?.message || 'Unknown error'}`)
        }
      })
      
      // Attach to the room
      await room.attach()
      
      // Keep the process running until Ctrl+C
      await new Promise(() => {
        // This promise intentionally never resolves
        process.on('SIGINT', async () => {
          this.log('')
          this.log(`${chalk.yellow('Stopping typing and disconnecting from room...')}`)
          
          // Clear the typing interval
          if (typingInterval) {
            clearInterval(typingInterval)
          }
          
          // Clean up subscriptions
          unsubscribeStatus()
          
          // Release the room and close connection
          await chatClient.rooms.release(args.roomId)
          realtimeClient.close()
          
          this.log(`${chalk.green('Successfully disconnected.')}`)
          process.exit(0)
        })
      })
    } catch (error) {
      // Close the connection in case of error
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
      this.error(`Failed to start typing: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 