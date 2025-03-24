import {Args, Flags} from '@oclif/core'
import {ChatBaseCommand} from '../../../chat-base-command.js'
import chalk from 'chalk'

export default class MessagesGet extends ChatBaseCommand {
  static override description = 'Get historical messages from an Ably Chat room'

  static override examples = [
    '$ ably rooms messages get my-room',
    '$ ably rooms messages get --api-key "YOUR_API_KEY" my-room',
    '$ ably rooms messages get --limit 50 my-room',
    '$ ably rooms messages get --show-metadata my-room',
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    limit: Flags.integer({
      char: 'l',
      description: 'Maximum number of messages to retrieve',
      default: 20,
    }),
    'show-metadata': Flags.boolean({
      description: 'Display message metadata if available',
      default: false,
    }),
  }

  static override args = {
    roomId: Args.string({
      description: 'The room ID to get messages from',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessagesGet)
    
    let clients = null
    
    try {
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const {chatClient, realtimeClient} = clients
      
      // Get the room
      const room = await chatClient.rooms.get(args.roomId, {})
      
      // Attach to the room
      await room.attach()
      
      this.log(`${chalk.green('Fetching')} ${chalk.yellow(flags.limit.toString())} ${chalk.green('most recent messages from room:')} ${chalk.bold(args.roomId)}`)
      
      // Get historical messages
      const messagesResult = await room.messages.get({ limit: flags.limit })
      const items = messagesResult.items
      
      // Display messages count
      this.log(`${chalk.green('Retrieved')} ${chalk.yellow(items.length.toString())} ${chalk.green('messages.')}`)
      
      if (items.length === 0) {
        this.log(chalk.dim('No messages found in this room.'))
      } else {
        this.log(chalk.dim('---'))
        
        // Display messages in chronological order (oldest first)
        const messagesInOrder = [...items].reverse()
        for (const message of messagesInOrder) {
          // Format message with timestamp, author and content
          const timestamp = new Date(message.timestamp).toLocaleTimeString()
          const author = message.clientId || 'Unknown'
          
          this.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`${author}:`)} ${message.text}`)
          
          // Show metadata if enabled and available
          if (flags['show-metadata'] && message.metadata) {
            this.log(`${chalk.gray('  Metadata:')} ${chalk.yellow(JSON.stringify(message.metadata))}`)
          }
        }
      }
      
      // Release the room
      await chatClient.rooms.release(args.roomId)
      
    } catch (error) {
      this.error(`Failed to get messages: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      // Close the connection
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 