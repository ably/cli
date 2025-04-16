import { ChatClient } from '@ably/chat'
import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'
import * as Ably from 'ably'

import { ChatBaseCommand } from '../../../chat-base-command.js'

interface ChatClients {
  chatClient: ChatClient;
  realtimeClient: any;
}

export default class RoomsReactionsSend extends ChatBaseCommand {
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
      default: '{}',
      description: 'Optional metadata for the reaction (JSON string)',
    }),
  }

  private ablyClient: Ably.Realtime | null = null

  async finally(err: Error | undefined): Promise<any> {
    if (this.ablyClient && this.ablyClient.connection.state !== 'closed' && this.ablyClient.connection.state !== 'failed') {
      this.ablyClient.close()
    }

    return super.finally(err)
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsReactionsSend)

    try {
      // Create Chat client
      const chatClient = await this.createChatClient(flags)
      // Also get the underlying Ably client for cleanup and state listeners
      this.ablyClient = await this.createAblyClient(flags)

      if (!chatClient) {
        this.error('Failed to create Chat client')
        return
      }
      if (!this.ablyClient) {
        this.error('Failed to create Ably client') // Should not happen if chatClient created
        return
      }

      // Add listeners for connection state changes
      this.ablyClient.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Realtime connection state changed to ${stateChange.current}`, { reason: stateChange.reason })
      })

      const { roomId } = args
      const reactionType = args.type
      
      // Parse the metadata
      let metadata = {}
      try {
        metadata = JSON.parse(flags.metadata)
      } catch {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            error: 'Invalid JSON metadata format. Please provide a valid JSON string.',
            reactionType,
            roomId,
            success: false
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
        metadata,
        type: reactionType
      })
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          metadata,
          reactionType,
          roomId,
          success: true
        }, flags))
      } else {
        this.log(`${chalk.green('✓')} Reaction '${chalk.yellow(reactionType)}' sent successfully to room ${chalk.blue(roomId)}`)
      }

      // Release the room
      this.logCliEvent(flags, 'room', 'releasing', `Releasing room ${roomId}`)
      await chatClient.rooms.release(roomId)
      this.logCliEvent(flags, 'room', 'released', `Room ${roomId} released`)
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: error instanceof Error ? error.message : String(error),
          reactionType: args.type,
          roomId: args.roomId,
          success: false
        }, flags))
      } else {
        this.error(`Error sending reaction: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (this.ablyClient) {
        this.ablyClient.close()
      }
    }
  }
} 