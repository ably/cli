import { Args, Flags } from '@oclif/core'
import { ChatBaseCommand } from '../../../chat-base-command.js'
import { ChatClient, RoomStatus } from '@ably/chat'
import chalk from 'chalk'

interface ChatClients {
  chatClient: ChatClient;
  realtimeClient: any;
}

export default class RoomsReactionsSubscribe extends ChatBaseCommand {
  static override description = 'Subscribe to reactions in a chat room'

  static override examples = [
    '$ ably rooms reactions subscribe my-room',
    '$ ably rooms reactions subscribe my-room --json',
    '$ ably rooms reactions subscribe my-room --pretty-json']

  static override flags = {
    ...ChatBaseCommand.globalFlags,
  }

  static override args = {
    roomId: Args.string({
      description: 'Room ID to subscribe to reactions in',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsReactionsSubscribe)
    
    let clients: ChatClients | null = null
    
    try {
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const { chatClient } = clients
      const roomId = args.roomId
      
      if (!this.shouldOutputJson(flags)) {
        this.log(`Connecting to Ably and subscribing to reactions in room ${chalk.cyan(roomId)}...`)
      }
      
      // Get the room
      const room = await chatClient.rooms.get(roomId, {
        reactions: {}
      })
      
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
            this.log(chalk.green('Successfully connected to Ably'))
            this.log(`Listening for reactions in room ${chalk.cyan(roomId)}. Press Ctrl+C to exit.`)
          }
        } else if (statusChange.current === RoomStatus.Detached) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              status: 'disconnected',
              roomId
            }, flags))
          } else {
            this.log(chalk.yellow('Disconnected from Ably'))
          }
        } else if (statusChange.current === RoomStatus.Failed) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              status: 'failed',
              error: room.error?.message || 'Unknown error',
              roomId
            }, flags))
          } else {
            this.error(`${chalk.red('Connection failed:')} ${room.error?.message || 'Unknown error'}`)
          }
        }
      })
      
      // Attach to the room
      await room.attach()
      
      // Subscribe to room reactions
      const { unsubscribe: unsubscribeReactions } = room.reactions.subscribe((reaction) => {
        const timestamp = new Date().toISOString()
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp,
            type: reaction.type,
            clientId: reaction.clientId,
            metadata: reaction.metadata,
            roomId
          }, flags))
        } else {
          this.log(`[${chalk.dim(timestamp)}] ${chalk.green('⚡')} ${chalk.blue(reaction.clientId || 'Unknown')} reacted with ${chalk.yellow(reaction.type || 'unknown')}`)
          
          // Show any additional metadata in the reaction
          if (reaction.metadata && Object.keys(reaction.metadata).length > 0) {
            this.log(`  ${chalk.dim('Metadata:')} ${this.formatJsonOutput(reaction.metadata, flags)}`)
          }
        }
      })

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          if (!this.shouldOutputJson(flags)) {
            this.log(`\n${chalk.yellow('Unsubscribing and closing connection...')}`)
          }
          
          // Unsubscribe from reactions
          unsubscribeReactions()
          
          // Unsubscribe from status changes
          unsubscribeStatus()
          
          try {
            await chatClient.rooms.release(roomId)
          } catch (error) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                roomId
              }, flags))
            } else {
              this.log(`Error releasing room: ${error instanceof Error ? error.message : String(error)}`)
            }
          }
          
          if (clients?.realtimeClient) {
            clients.realtimeClient.close()
          }
          
          if (!this.shouldOutputJson(flags)) {
            this.log(chalk.green('Successfully disconnected.'))
          }
          resolve()
        }

        process.on('SIGINT', () => void cleanup())
        process.on('SIGTERM', () => void cleanup())
      })
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          roomId: args.roomId
        }, flags))
      } else {
        this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 