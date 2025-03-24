import {Args, Flags} from '@oclif/core'
import {ChatBaseCommand} from '../../../chat-base-command.js'

export default class MessagesSend extends ChatBaseCommand {
  static override description = 'Send a message to an Ably Chat room'

  static override examples = [
    '$ ably rooms messages send my-room "Hello World!"',
    '$ ably rooms messages send --api-key "YOUR_API_KEY" my-room "Welcome to the chat!"',
    '$ ably rooms messages send --metadata \'{"isImportant":true}\' my-room "Attention please!"',
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    metadata: Flags.string({
      description: 'Additional metadata for the message (JSON format)',
    }),
  }

  static override args = {
    roomId: Args.string({
      description: 'The room ID to send the message to',
      required: true,
    }),
    text: Args.string({
      description: 'The message text to send',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessagesSend)
    
    let clients = null
    
    try {
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const {chatClient, realtimeClient} = clients
      
      // Parse metadata if provided
      let metadata = undefined
      if (flags.metadata) {
        try {
          metadata = JSON.parse(flags.metadata)
        } catch (error) {
          this.error(`Invalid metadata JSON: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      
      // Get the room with default options
      const room = await chatClient.rooms.get(args.roomId, {})
      
      // Attach to the room
      await room.attach()
      
      // Send the message
      await room.messages.send({
        text: args.text,
        ...(metadata ? { metadata } : {}),
      })
      
      // Release the room
      await chatClient.rooms.release(args.roomId)
      
      this.log('Message sent successfully.')
    } catch (error) {
      this.error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      // Close the connection
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 