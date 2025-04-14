import {Args, Flags} from '@oclif/core'
import {ChatBaseCommand} from '../../../chat-base-command.js'
import chalk from 'chalk'
import { RoomStatus } from '@ably/chat'

export default class TypingStart extends ChatBaseCommand {
  static override description = 'Start typing in an Ably Chat room (will remain typing until terminated)'

  static override examples = [
    '$ ably rooms typing start my-room',
    '$ ably rooms typing start --api-key "YOUR_API_KEY" my-room',
    '$ ably rooms typing start my-room --json',
    '$ ably rooms typing start my-room --pretty-json'
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

  private clients: { chatClient: any, realtimeClient: any } | null = null;
  private typingIntervalId: NodeJS.Timeout | null = null;
  private unsubscribeStatusFn: (() => void) | null = null;

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TypingStart)

    try {
      // Create Chat client
      this.clients = await this.createChatClient(flags)
      if (!this.clients) return

      const {chatClient, realtimeClient} = this.clients
      const roomId = args.roomId;

      // Add listeners for connection state changes
      realtimeClient.connection.on((stateChange: any) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Realtime connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Get the room with typing enabled
      this.logCliEvent(flags, 'room', 'gettingRoom', `Getting room handle for ${roomId}`);
      const room = await chatClient.rooms.get(roomId, {
        typing: { timeoutMs: 5000 }, // Default timeout is 5s, interval should be < 5s
      })
      this.logCliEvent(flags, 'room', 'gotRoom', `Got room handle for ${roomId}`);

      // Subscribe to room status changes
      this.logCliEvent(flags, 'room', 'subscribingToStatus', 'Subscribing to room status changes');
      const { off: unsubscribeStatus } = room.onStatusChange((statusChange: any) => {
          let reason: string | Error | undefined | null = undefined;
          if (statusChange.current === RoomStatus.Failed) {
              reason = room.error; // Get reason from room.error on failure
          }
          const reasonMsg = reason instanceof Error ? reason.message : reason;
          this.logCliEvent(flags, 'room', `status-${statusChange.current}`, `Room status changed to ${statusChange.current}`, { reason: reasonMsg });

        if (statusChange.current === RoomStatus.Attached) {
            if (!this.shouldOutputJson(flags)) {
              this.log(`${chalk.green('Connected to room:')} ${chalk.bold(roomId)}`);
            }

            // Start typing immediately
            this.logCliEvent(flags, 'typing', 'startAttempt', 'Attempting to start typing...');
            room.typing.start()
                .then(() => {
                    this.logCliEvent(flags, 'typing', 'started', 'Successfully started typing');
                    if (!this.shouldOutputJson(flags)) {
                        this.log(`${chalk.green('Started typing in room.')}`);
                        this.log(`${chalk.dim('Will remain typing until this command is terminated. Press Ctrl+C to exit.')}`);
                    }
                    // Keep typing active by calling start() periodically
                    if (this.typingIntervalId) clearInterval(this.typingIntervalId);
                    this.typingIntervalId = setInterval(() => {
                       room.typing.start().catch((err: any) => {
                            this.logCliEvent(flags, 'typing', 'startErrorPeriodic', `Error refreshing typing state: ${err.message}`, { error: err.message });
                       }); // Refresh typing state
                       this.logCliEvent(flags, 'typing', 'refreshing', 'Refreshed typing state');
                    }, 4000); // Interval < timeoutMs
                })
                .catch((err: any) => {
                    this.logCliEvent(flags, 'typing', 'startErrorInitial', `Failed to start typing initially: ${err.message}`, { error: err.message });
                     if (!this.shouldOutputJson(flags)) {
                        this.error(`Failed to start typing: ${err.message}`);
                     }
                });
        } else if (statusChange.current === RoomStatus.Failed) {
             if (!this.shouldOutputJson(flags)) {
               this.error(`Failed to attach to room: ${reasonMsg || 'Unknown error'}`);
             }
        }
      });
      this.unsubscribeStatusFn = unsubscribeStatus;
      this.logCliEvent(flags, 'room', 'subscribedToStatus', 'Successfully subscribed to room status changes');

      // Attach to the room
      this.logCliEvent(flags, 'room', 'attaching', `Attaching to room ${roomId}`);
      await room.attach()
      // Successful attach and initial typing start logged by onStatusChange handler

      this.logCliEvent(flags, 'typing', 'listening', 'Maintaining typing status...');
      // Keep the process running until Ctrl+C
      await new Promise(() => {
        // This promise intentionally never resolves
        process.on('SIGINT', async () => {
          this.logCliEvent(flags, 'typing', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');
          if (!this.shouldOutputJson(flags)) {
            this.log('')
            this.log(`${chalk.yellow('Stopping typing and disconnecting from room...')}`)
          }

          // Clear the typing interval
          if (this.typingIntervalId) {
            this.logCliEvent(flags, 'typing', 'clearingInterval', 'Clearing typing refresh interval');
            clearInterval(this.typingIntervalId);
            this.typingIntervalId = null;
          }

          // Clean up subscriptions
          if (this.unsubscribeStatusFn) {
              try {
                  this.logCliEvent(flags, 'room', 'unsubscribingStatus', 'Unsubscribing from room status');
                  this.unsubscribeStatusFn();
                  this.logCliEvent(flags, 'room', 'unsubscribedStatus', 'Unsubscribed from room status');
              } catch (err) { this.logCliEvent(flags, 'room', 'unsubscribeStatusError', 'Error unsubscribing status', { error: err instanceof Error ? err.message : String(err) }); }
          }

          // Stop typing explicitly (optional, but good practice)
          try {
             this.logCliEvent(flags, 'typing', 'stopAttempt', 'Attempting to stop typing indicator');
             await room.typing.stop();
             this.logCliEvent(flags, 'typing', 'stopped', 'Stopped typing indicator');
          } catch(err) { this.logCliEvent(flags, 'typing', 'stopError', 'Error stopping typing', { error: err instanceof Error ? err.message : String(err) }); }

          // Release the room and close connection
          try {
            this.logCliEvent(flags, 'room', 'releasing', `Releasing room ${roomId}`);
            await chatClient.rooms.release(roomId);
            this.logCliEvent(flags, 'room', 'released', `Room ${roomId} released`);
          } catch(err) { this.logCliEvent(flags, 'room', 'releaseError', 'Error releasing room', { error: err instanceof Error ? err.message : String(err) }); }

          if (realtimeClient) {
             this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
             realtimeClient.close();
             this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed');
          }

          if (!this.shouldOutputJson(flags)) {
            this.log(`${chalk.green('Successfully disconnected.')}`)
          }
          process.exit(0)
        })
      })
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logCliEvent(flags, 'typing', 'fatalError', `Failed to start typing: ${errorMsg}`, { error: errorMsg, roomId: args.roomId });
      // Close the connection in case of error
      if (this.clients?.realtimeClient) {
        this.clients.realtimeClient.close()
      }

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ success: false, error: errorMsg, roomId: args.roomId }, flags))
      } else {
        this.error(`Failed to start typing: ${errorMsg}`)
      }
    }
  }

   // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.typingIntervalId) {
        clearInterval(this.typingIntervalId);
        this.typingIntervalId = null;
     }
     if (this.unsubscribeStatusFn) { try { this.unsubscribeStatusFn(); } catch (e) { /* ignore */ } }
     if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed') {
       if (this.clients.realtimeClient.connection.state !== 'failed') {
           this.clients.realtimeClient.close();
       }
     }
     return super.finally(err);
   }
} 