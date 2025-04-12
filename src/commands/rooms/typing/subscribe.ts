import {Args, Flags} from '@oclif/core'
import {ChatBaseCommand} from '../../../chat-base-command.js'
import chalk from 'chalk'

export default class TypingSubscribe extends ChatBaseCommand {
  static override description = 'Subscribe to typing indicators in an Ably Chat room'

  static override examples = [
    '$ ably rooms typing subscribe my-room',
    '$ ably rooms typing subscribe --api-key "YOUR_API_KEY" my-room',
    '$ ably rooms typing subscribe my-room --json',
    '$ ably rooms typing subscribe my-room --pretty-json'
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
  }

  static override args = {
    roomId: Args.string({
      description: 'The room ID to subscribe to typing indicators from',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TypingSubscribe)
    
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
      
      // Set up typing indicators
      const { unsubscribe } = room.typing.subscribe((typingEvent) => {
        const timestamp = new Date().toISOString()
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp,
            currentlyTyping: Array.from(typingEvent.currentlyTyping || []),
            roomId: args.roomId
          }, flags))
        } else {
          // Clear the line and show who's typing
          process.stdout.write('\r\x1b[K')
          
          if (typingEvent.currentlyTyping && typingEvent.currentlyTyping.size > 0) {
            const typingUsers = Array.from(typingEvent.currentlyTyping)
            const memberNames = typingUsers.join(', ')
            process.stdout.write(chalk.yellow(`${memberNames} ${typingUsers.length === 1 ? 'is' : 'are'} typing...`))
          }
        }
      })
      
      // Subscribe to room status changes
      const { off: unsubscribeStatus } = room.onStatusChange((statusChange) => {
        if (statusChange.current === 'attached') {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: true,
              status: 'connected',
              roomId: args.roomId
            }, flags))
          } else {
            this.log(`${chalk.green('Connected to room:')} ${chalk.bold(args.roomId)}`)
            this.log(`${chalk.dim('Listening for typing indicators. Press Ctrl+C to exit.')}`)
          }
        } else if (statusChange.current === 'failed') {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              status: 'failed',
              error: room.error?.message || 'Unknown error',
              roomId: args.roomId
            }, flags))
          } else {
            this.error(`Failed to attach to room: ${room.error?.message || 'Unknown error'}`)
          }
        }
      })
      
      // Attach to the room
      await room.attach()
      
      // Keep the process running until Ctrl+C
      await new Promise(() => {
        // This promise intentionally never resolves
        process.on('SIGINT', async () => {
          if (!this.shouldOutputJson(flags)) {
            // Move to a new line to not override typing status
            this.log('\n')
            this.log(`${chalk.yellow('Disconnecting from room...')}`)
          }
          
          // Clean up subscriptions
          unsubscribe()
          unsubscribeStatus()
          
          // Release the room and close connection
          await chatClient.rooms.release(args.roomId)
          realtimeClient.close()
          
          if (!this.shouldOutputJson(flags)) {
            this.log(`${chalk.green('Successfully disconnected.')}`)
          }
          process.exit(0)
        })
      })
    } catch (error) {
      // Close the connection in case of error
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          roomId: args.roomId
        }, flags))
      } else {
        this.error(`Failed to subscribe to typing indicators: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
} 