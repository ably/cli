import {Args, Flags} from '@oclif/core'
import {ChatBaseCommand} from '../../../chat-base-command.js'
import chalk from 'chalk'

export default class MessagesSubscribe extends ChatBaseCommand {
  static override description = 'Subscribe to messages in an Ably Chat room'

  static override examples = [
    '$ ably rooms messages subscribe my-room',
    '$ ably rooms messages subscribe --api-key "YOUR_API_KEY" my-room',
    '$ ably rooms messages subscribe --show-metadata my-room',
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    'show-metadata': Flags.boolean({
      description: 'Display message metadata if available',
      default: false,
    }),
  }

  static override args = {
    roomId: Args.string({
      description: 'The room ID to subscribe to messages from',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessagesSubscribe)
    
    let clients = null
    
    try {
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const {chatClient, realtimeClient} = clients
      
      // Get the room
      const room = await chatClient.rooms.get(args.roomId, {})
      
      // Setup message handler
      const { unsubscribe } = room.messages.subscribe((messageEvent) => {
        const message = messageEvent.message
        
        // Format message with timestamp, author and content
        const timestamp = new Date(message.timestamp).toLocaleTimeString()
        const author = message.clientId || 'Unknown'
        
        // Message content with consistent formatting
        this.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`${author}:`)} ${message.text}`)
        
        // Show metadata if enabled and available
        if (flags['show-metadata'] && message.metadata) {
          this.log(`${chalk.blue('  Metadata:')} ${chalk.yellow(JSON.stringify(message.metadata))}`)
        }
        this.log('') // Empty line for better readability
      })
      
      // Subscribe to room status changes
      const { off: unsubscribeStatus } = room.onStatusChange((statusChange) => {
        if (statusChange.current === 'attached') {
          this.log(`${chalk.green('Connected to room:')} ${chalk.bold(args.roomId)}`)
          this.log(`${chalk.dim('Listening for messages. Press Ctrl+C to exit.')}`)
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
          this.log(`\n${chalk.yellow('Disconnecting from room...')}`)
          
          // Clean up subscriptions
          unsubscribe()
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
      this.error(`Failed to subscribe to messages: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 