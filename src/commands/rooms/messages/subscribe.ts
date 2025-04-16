import {Args, Flags} from '@oclif/core'
import * as Ably from 'ably'; // Import Ably
import { ChatClient, Message, RoomStatus, Subscription, StatusSubscription } from '@ably/chat'; // Import ChatClient and StatusSubscription
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

  private ablyClient: Ably.Realtime | null = null; // Store Ably client for cleanup
  private messageSubscription: Subscription | null = null
  private unsubscribeStatusFn: StatusSubscription | null = null

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.messageSubscription) { try { this.messageSubscription.unsubscribe(); } catch { /* ignore */ } }
     if (this.unsubscribeStatusFn) { try { this.unsubscribeStatusFn.off(); } catch { /* ignore */ } }
     if (this.ablyClient && this.ablyClient.connection.state !== 'closed' && this.ablyClient.connection.state !== 'failed') {
           this.ablyClient.close();
       }

     return super.finally(err);
   }

   async run(): Promise<void> {
    const {args, flags} = await this.parse(MessagesSubscribe)
    const {roomId} = args

    try {
      // Create Chat client
      const chatClient = await this.createChatClient(flags)
      // Also get the underlying Ably client for cleanup and state listeners
      this.ablyClient = await this.createAblyClient(flags);

      if (!chatClient) {
        this.error('Failed to create Chat client');
        return;
      }
      if (!this.ablyClient) {
        this.error('Failed to create Ably client'); // Should not happen if chatClient created
        return;
      }

      // Add listeners for connection state changes
      this.ablyClient.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Realtime connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Get the room
      this.logCliEvent(flags, 'room', 'gettingRoom', `Getting room handle for ${roomId}`);
      const room = await chatClient.rooms.get(roomId, {})
      this.logCliEvent(flags, 'room', 'gotRoom', `Got room handle for ${roomId}`);

      // Setup message handler
      this.logCliEvent(flags, 'room', 'subscribingToMessages', `Subscribing to messages in room ${roomId}`);
      this.messageSubscription = room.messages.subscribe((messageEvent: any) => {
        const {message} = messageEvent
        const messageLog = {
            clientId: message.clientId,
            text: message.text,
            timestamp: message.timestamp,
            ...(message.metadata ? { metadata: message.metadata } : {})
        };
        this.logCliEvent(flags, 'message', 'received', 'Message received', { message: messageLog, roomId: roomId });

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            message: messageLog,
            roomId: roomId,
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
      this.logCliEvent(flags, 'room', 'subscribedToMessages', `Successfully subscribed to messages in room ${roomId}`);

      // Subscribe to room status changes
      this.logCliEvent(flags, 'room', 'subscribingToStatus', `Subscribing to status changes for room ${roomId}`);
      this.unsubscribeStatusFn = room.onStatusChange((statusChange: any) => {
         this.logCliEvent(flags, 'room', `status-${statusChange.current}`, `Room status changed to ${statusChange.current}`, { reason: statusChange.reason, roomId: roomId });
         if (statusChange.current === 'attached') {
           if (!this.shouldSuppressOutput(flags)) {
             if (this.shouldOutputJson(flags)) {
               // Already logged via logCliEvent
             } else {
               this.log(`${chalk.green('Connected to room:')} ${chalk.bold(roomId)}`);
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
      this.logCliEvent(flags, 'room', 'subscribedToStatus', `Successfully subscribed to status changes for room ${roomId}`);

      // Attach to the room
      this.logCliEvent(flags, 'room', 'attaching', `Attaching to room ${roomId}`);
      await room.attach()
      // Note: successful attach logged by onStatusChange handler

      this.logCliEvent(flags, 'subscribe', 'listening', 'Now listening for messages and status changes');
      // Keep the process running until Ctrl+C
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            const errorMsg = 'Force exiting after timeout during cleanup';
            this.logCliEvent(flags, 'subscribe', 'forceExit', errorMsg, { roomId });
            if (!this.shouldOutputJson(flags)) {
               this.log(chalk.red('Force exiting after timeout...'));
            }

            process.exit(1);
          }, 5000);

          if (this.messageSubscription) {
            try {
              this.logCliEvent(flags, 'room', 'unsubscribingMessages', 'Unsubscribing from messages');
              this.messageSubscription.unsubscribe();
              this.logCliEvent(flags, 'room', 'unsubscribedMessages', 'Unsubscribed from messages');
            } catch (error) {
              this.logCliEvent(flags, 'room', 'unsubscribeMessagesError', 'Error unsubscribing messages', { error: error instanceof Error ? error.message : String(error) });
            }
          }

          if (this.unsubscribeStatusFn) {
            try {
              this.logCliEvent(flags, 'room', 'unsubscribingStatus', 'Unsubscribing from status changes');
              this.unsubscribeStatusFn.off();
              this.logCliEvent(flags, 'room', 'unsubscribedStatus', 'Unsubscribed from status changes');
            } catch (error) {
              this.logCliEvent(flags, 'room', 'unsubscribeStatusError', 'Error unsubscribing status', { error: error instanceof Error ? error.message : String(error) });
            }
          }

          // Release the room and close connection
          try {
            this.logCliEvent(flags, 'room', 'releasing', `Releasing room ${roomId}`);
            await chatClient.rooms.release(roomId);
            this.logCliEvent(flags, 'room', 'released', `Room ${roomId} released`);
          } catch (error) {
            this.logCliEvent(flags, 'room', 'releaseError', `Error releasing room: ${error instanceof Error ? error.message : String(error)}`, { error: error instanceof Error ? error.message : String(error) });
          }

          if (this.ablyClient && this.ablyClient.connection.state !== 'closed') {
             this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
             this.ablyClient.close();
             this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed');
          }

          clearTimeout(forceExitTimeout);
          this.logCliEvent(flags, 'subscribe', 'cleanupComplete', 'Cleanup complete');
          if (!this.shouldOutputJson(flags)) {
            this.log(chalk.green('Successfully disconnected.'))
          }

          resolve();
        }

        process.on('SIGINT', () => void cleanup())
        process.on('SIGTERM', () => void cleanup())
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, 'subscribe', 'fatalError', `Failed to subscribe to messages: ${errorMsg}`, { error: errorMsg, roomId: roomId });
      // Close the connection in case of error
      if (this.ablyClient) {
        this.ablyClient.close()
      }

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ error: errorMsg, roomId: roomId, success: false }, flags))
      } else {
        this.error(`Failed to subscribe to messages: ${errorMsg}`)
      }
    } finally {
      // Ensure client is closed even if cleanup promise didn't resolve
      if (this.ablyClient && this.ablyClient.connection.state !== 'closed') {
        this.logCliEvent(flags || {}, 'connection', 'finalCloseAttempt', 'Ensuring connection is closed in finally block.');
        this.ablyClient.close();
      }
    }
  }
} 