import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'

import {ChatBaseCommand} from '../../../chat-base-command.js'

export default class MessagesSubscribe extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: 'The room ID to subscribe to messages from',
      required: true,
    }),
  }

  static override description = 'Subscribe to messages in an Ably Chat room'

  static override examples = [
    '$ ably rooms messages subscribe my-room',
    '$ ably rooms messages subscribe --api-key "YOUR_API_KEY" my-room',
    '$ ably rooms messages subscribe --show-metadata my-room',
    '$ ably rooms messages subscribe my-room --json',
    '$ ably rooms messages subscribe my-room --pretty-json'
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    'show-metadata': Flags.boolean({
      default: false,
      description: 'Display message metadata if available',
    }),
  }

  private clients: { chatClient: any, realtimeClient: any } | null = null;

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed' && this.clients.realtimeClient.connection.state !== 'failed') {
           this.clients.realtimeClient.close();
       }

     return super.finally(err);
   }

   async run(): Promise<void> {
    const {args, flags} = await this.parse(MessagesSubscribe)

    try {
      // Create Chat client
      this.clients = await this.createChatClient(flags)
      if (!this.clients) return

      const {chatClient, realtimeClient} = this.clients

      // Add listeners for connection state changes
      realtimeClient.connection.on((stateChange: any) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Realtime connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Get the room
      this.logCliEvent(flags, 'room', 'gettingRoom', `Getting room handle for ${args.roomId}`);
      const room = await chatClient.rooms.get(args.roomId, {})
      this.logCliEvent(flags, 'room', 'gotRoom', `Got room handle for ${args.roomId}`);

      // Setup message handler
      this.logCliEvent(flags, 'room', 'subscribingToMessages', `Subscribing to messages in room ${args.roomId}`);
      const { unsubscribe } = room.messages.subscribe((messageEvent: any) => {
        const {message} = messageEvent
        const messageLog = {
            clientId: message.clientId,
            text: message.text,
            timestamp: message.timestamp,
            ...(message.metadata ? { metadata: message.metadata } : {})
        };
        this.logCliEvent(flags, 'message', 'received', 'Message received', { message: messageLog, roomId: args.roomId });

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            message: messageLog,
            roomId: args.roomId,
            success: true
          }, flags))
        } else {
          // Format message with timestamp, author and content
          const timestamp = new Date(message.timestamp).toLocaleTimeString()
          const author = message.clientId || 'Unknown'

          // Message content with consistent formatting
          this.log(`${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`${author}:`)} ${message.text}`)

          // Show metadata if enabled and available
          if (flags['show-metadata'] && message.metadata) {
            this.log(`${chalk.blue('  Metadata:')} ${chalk.yellow(this.formatJsonOutput(message.metadata, flags))}`)
          }

          this.log('') // Empty line for better readability
        }
      })
      this.logCliEvent(flags, 'room', 'subscribedToMessages', `Successfully subscribed to messages in room ${args.roomId}`);

      // Subscribe to room status changes
      this.logCliEvent(flags, 'room', 'subscribingToStatus', `Subscribing to status changes for room ${args.roomId}`);
      const { off: unsubscribeStatus } = room.onStatusChange((statusChange: any) => {
         this.logCliEvent(flags, 'room', `status-${statusChange.current}`, `Room status changed to ${statusChange.current}`, { reason: statusChange.reason, roomId: args.roomId });
         if (statusChange.current === 'attached') {
           if (!this.shouldSuppressOutput(flags)) {
             if (this.shouldOutputJson(flags)) {
               // Already logged via logCliEvent
             } else {
               this.log(`${chalk.green('Connected to room:')} ${chalk.bold(args.roomId)}`);
               this.log(`${chalk.dim('Listening for messages. Press Ctrl+C to exit.')}`);
             }
           }
         } else if (statusChange.current === 'failed') {
            const errorMsg = room.error?.message || 'Unknown error';
            if (this.shouldOutputJson(flags)) {
              // Logged via logCliEvent
            } else {
              this.error(`Failed to attach to room: ${errorMsg}`);
            }
         }
      })
      this.logCliEvent(flags, 'room', 'subscribedToStatus', `Successfully subscribed to status changes for room ${args.roomId}`);

      // Attach to the room
      this.logCliEvent(flags, 'room', 'attaching', `Attaching to room ${args.roomId}`);
      await room.attach()
      // Note: successful attach logged by onStatusChange handler

      this.logCliEvent(flags, 'subscribe', 'listening', 'Now listening for messages and status changes');
      // Keep the process running until Ctrl+C
      await new Promise(() => {
        // This promise intentionally never resolves
        process.on('SIGINT', async () => {
          this.logCliEvent(flags, 'subscribe', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');
          if (!this.shouldSuppressOutput(flags)) {
            if (this.shouldOutputJson(flags)) {
              // Logged via logCliEvent
            } else {
              this.log(`\n${chalk.yellow('Disconnecting from room...')}`)
            }
          }

          // Clean up subscriptions
          try {
             this.logCliEvent(flags, 'room', 'unsubscribingMessages', 'Unsubscribing from messages');
             unsubscribe();
             this.logCliEvent(flags, 'room', 'unsubscribedMessages', 'Unsubscribed from messages');
          } catch (error) { this.logCliEvent(flags, 'room', 'unsubscribeMessagesError', 'Error unsubscribing messages', { error: error instanceof Error ? error.message : String(error) }); }

          try {
             this.logCliEvent(flags, 'room', 'unsubscribingStatus', 'Unsubscribing from status changes');
             unsubscribeStatus();
             this.logCliEvent(flags, 'room', 'unsubscribedStatus', 'Unsubscribed from status changes');
          } catch (error) { this.logCliEvent(flags, 'room', 'unsubscribeStatusError', 'Error unsubscribing status', { error: error instanceof Error ? error.message : String(error) }); }

          // Release the room and close connection
          try {
            this.logCliEvent(flags, 'room', 'releasing', `Releasing room ${args.roomId}`);
            await chatClient.rooms.release(args.roomId);
            this.logCliEvent(flags, 'room', 'released', `Room ${args.roomId} released`);
          } catch(error) { this.logCliEvent(flags, 'room', 'releaseError', 'Error releasing room', { error: error instanceof Error ? error.message : String(error) }); }

          if (realtimeClient) {
             this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
             realtimeClient.close();
             this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed');
          }

          if (!this.shouldSuppressOutput(flags)) {
            if (this.shouldOutputJson(flags)) {
              // Logged via logCliEvent
            } else {
              this.log(`${chalk.green('Successfully disconnected.')}`);
            }
          }

          // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
          process.exit(0) // Reinstated: Explicit exit after connection closed
        })
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, 'subscribe', 'fatalError', `Failed to subscribe to messages: ${errorMsg}`, { error: errorMsg, roomId: args.roomId });
      // Close the connection in case of error
      if (this.clients?.realtimeClient) {
        this.clients.realtimeClient.close()
      }

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ error: errorMsg, roomId: args.roomId, success: false }, flags))
      } else {
        this.error(`Failed to subscribe to messages: ${errorMsg}`)
      }
    }
  }
} 