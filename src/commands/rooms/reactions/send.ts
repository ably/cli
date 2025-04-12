import { Args, Flags } from '@oclif/core'
import { ChatBaseCommand } from '../../../chat-base-command.js'
import { ChatClient } from '@ably/chat'
import chalk from 'chalk'

interface ChatClients {
  chatClient: ChatClient;
  realtimeClient: any;
}

export default class RoomsReactionsSend extends ChatBaseCommand {
  static override description = 'Send a reaction to a chat room'

  static override examples = [
    '$ ably rooms reactions send my-room thumbs_up',
    '$ ably rooms reactions send my-room heart --metadata \'{"effect":"fireworks"}\'',
    '$ ably rooms reactions send my-room thumbs_up --json',
    '$ ably rooms reactions send my-room heart --metadata \'{"effect":"fireworks"}\' --pretty-json'
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    'metadata': Flags.string({
      description: 'Optional metadata for the reaction (JSON string)',
      default: '{}',
    }),
  }

  static override args = {
    roomId: Args.string({
      description: 'Room ID to send the reaction to',
      required: true,
    }),
    type: Args.string({
      description: 'Reaction type/emoji to send',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsReactionsSend)

    let clients: ChatClients | null = null

    try {
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const { chatClient } = clients
      const roomId = args.roomId
      const reactionType = args.type
      
      // Parse the metadata
      let metadata = {}
      try {
        metadata = JSON.parse(flags.metadata)
      } catch (error) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            error: 'Invalid JSON metadata format. Please provide a valid JSON string.',
            roomId,
            reactionType
          }, flags))
        } else {
          this.error('Invalid JSON metadata format. Please provide a valid JSON string.')
        }
        return
      }

      // Get the room
      const room = await chatClient.rooms.get(roomId, {
        reactions: {}
      })

      // Attach to the room
      await room.attach()
      
      // Send room reaction using the reactions API
      await room.reactions.send({
        type: reactionType,
        metadata: metadata
      })
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: true,
          roomId,
          reactionType,
          metadata
        }, flags))
      } else {
        this.log(`${chalk.green('✓')} Reaction '${chalk.yellow(reactionType)}' sent successfully to room ${chalk.blue(roomId)}`)
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          roomId: args.roomId,
          reactionType: args.type
        }, flags))
      } else {
        this.error(`Error sending reaction: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 