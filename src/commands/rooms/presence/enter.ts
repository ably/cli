import { ChatClient, RoomStatus, RoomStatusChange } from '@ably/chat'
import { Args, Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { ChatBaseCommand } from '../../../chat-base-command.js'

interface ChatClients {
  chatClient: ChatClient;
  realtimeClient: any;
}

export default class RoomsPresenceEnter extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: 'Room ID to enter presence on',
      required: true,
    }),
  }

  static override description = 'Enter presence in a chat room and remain present until terminated'

  static override examples = [
    '$ ably rooms presence enter my-room',
    '$ ably rooms presence enter my-room --data \'{"status":"online","username":"john"}\'',
    '$ ably rooms presence enter my-room --client-id "user123"',
    '$ ably rooms presence enter my-room --json',
    '$ ably rooms presence enter my-room --pretty-json'
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    'data': Flags.string({
      default: '{}',
      description: 'Presence data to publish (JSON string)',
    }),
    'show-others': Flags.boolean({
      default: true,
      description: 'Show other presence events while present',
    }),
  }

  private clients: ChatClients | null = null;
  private unsubscribePresenceFn: (() => void) | null = null;
  private unsubscribeStatusFn: (() => void) | null = null;

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.unsubscribePresenceFn) { try { this.unsubscribePresenceFn(); } catch { /* ignore */ } }
     if (this.unsubscribeStatusFn) { try { this.unsubscribeStatusFn(); } catch { /* ignore */ } }
     if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed' && this.clients.realtimeClient.connection.state !== 'failed') {
           this.clients.realtimeClient.close();
       }

     return super.finally(err);
   }

   async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsPresenceEnter)

    try {
      // Create Chat client
      this.clients = await this.createChatClient(flags)
      if (!this.clients) return

      const { chatClient, realtimeClient } = this.clients
      const {roomId} = args

      // Add listeners for connection state changes
      realtimeClient.connection.on((stateChange: any) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Realtime connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Parse the data
      let presenceData = {}
      try {
        presenceData = JSON.parse(flags.data)
        this.logCliEvent(flags, 'presence', 'dataParsed', 'Presence data parsed successfully', { data: presenceData });
      } catch (error) {
        const errorMsg = 'Invalid JSON data format. Please provide a valid JSON string.';
        this.logCliEvent(flags, 'presence', 'dataParseError', errorMsg, { error: error instanceof Error ? error.message : String(error) });
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ error: errorMsg, roomId, success: false }, flags))
        } else {
          this.error(errorMsg)
        }

        return
      }

      // Get the room
      this.logCliEvent(flags, 'room', 'gettingRoom', `Getting room handle for ${roomId}`);
      const room = await chatClient.rooms.get(roomId, {
        presence: {}
      })
      this.logCliEvent(flags, 'room', 'gotRoom', `Got room handle for ${roomId}`);

      // Setup presence event handlers if we're showing other presence events
      if (flags['show-others']) {
        // Subscribe to room status changes
        this.logCliEvent(flags, 'room', 'subscribingToStatus', 'Subscribing to room status changes');
        const { off: unsubscribeStatus } = room.onStatusChange((statusChange: RoomStatusChange) => {
          let reason: Ably.ErrorInfo | null | string | undefined;
          if (statusChange.current === RoomStatus.Failed) {
              reason = room.error; // Get reason from room.error on failure
          }

          const reasonMsg = reason instanceof Error ? reason.message : reason;
          this.logCliEvent(flags, 'room', `status-${statusChange.current}`, `Room status changed to ${statusChange.current}`, { reason: reasonMsg });
          if (statusChange.current === RoomStatus.Attached && !this.shouldOutputJson(flags)) {
              this.log(`${chalk.green('Successfully connected to room:')} ${chalk.cyan(roomId)}`);
            }
        });
        this.unsubscribeStatusFn = unsubscribeStatus;

        // Subscribe to presence events using a general listener
        this.logCliEvent(flags, 'presence', 'subscribingToEvents', 'Subscribing to presence events');
        const { unsubscribe: unsubscribePresence } = room.presence.subscribe((member: any) => {
          // Only show other members, not ourselves
          if (member.clientId !== chatClient.clientId) {
            const timestamp = new Date().toISOString()
            const eventData = {
                action: member.action,
                member: {
                    clientId: member.clientId,
                    data: member.data
                },
                roomId,
                timestamp
            };
            this.logCliEvent(flags, 'presence', member.action, `Presence event '${member.action}' received`, eventData);

            if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({ success: true, ...eventData }, flags))
            } else {
                // Check what kind of presence event it is based on action property
                switch (member.action) {
                case 'enter': {
                    this.log(`${chalk.green('✓')} ${chalk.blue(member.clientId || 'Unknown')} entered room`)
                
                break;
                }

                case 'leave': {
                    this.log(`${chalk.red('✗')} ${chalk.blue(member.clientId || 'Unknown')} left room`)
                
                break;
                }

                case 'update': {
                    this.log(`${chalk.yellow('⟲')} ${chalk.blue(member.clientId || 'Unknown')} updated presence data:`);
                    this.log(`  ${chalk.dim('Data:')} ${this.formatJsonOutput(member.data, flags)}`);
                
                break;
                }
                // No default
                }
            }
          }
        })
        this.unsubscribePresenceFn = unsubscribePresence;
        this.logCliEvent(flags, 'presence', 'subscribedToEvents', 'Successfully subscribed to presence events');
      }

      // Attach to the room then enter
      this.logCliEvent(flags, 'room', 'attaching', `Attaching to room ${roomId}`);
      await room.attach()
      // Successful attach logged by onStatusChange handler

      this.logCliEvent(flags, 'presence', 'entering', 'Attempting to enter presence', { data: presenceData });
      await room.presence.enter(presenceData)
      const enterEventData = {
          action: 'enter',
          member: {
              clientId: chatClient.clientId,
              data: presenceData
          },
          roomId
      };
      this.logCliEvent(flags, 'presence', 'entered', 'Successfully entered presence', enterEventData);

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ success: true, ...enterEventData }, flags))
      } else {
        this.log(`${chalk.green('✓')} Entered room ${chalk.cyan(roomId)} as ${chalk.blue(chatClient.clientId || 'Unknown')}`)
      }

      if (flags['show-others']) {
        // Get and display current presence members
        this.logCliEvent(flags, 'presence', 'gettingInitialMembers', 'Fetching initial presence members');
        const members = await room.presence.get()
        const initialMembers = members.filter(member => member.clientId !== chatClient.clientId).map(member => ({
            clientId: member.clientId,
            data: member.data
        }));
        this.logCliEvent(flags, 'presence', 'initialMembersFetched', `Fetched ${members.length} total members (${initialMembers.length} others)`, { count: members.length, members: initialMembers, othersCount: initialMembers.length });

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            members: initialMembers,
            roomId,
            success: true
          }, flags))
        } else {
          if (members.length > 1) {
            this.log(`\n${chalk.cyan('Current users in room')} (${chalk.bold(members.length.toString())}):\n`)

            for (const member of members) {
              if (member.clientId !== chatClient.clientId) {
                this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)
                if (member.data && Object.keys(member.data).length > 0) {
                  this.log(`  ${chalk.dim('Data:')} ${this.formatJsonOutput(member.data, flags)}`)
                }
              }
            }
          } else {
            this.log(`\n${chalk.yellow('No other users are present in this room')}`)
          }

          this.log(`\n${chalk.dim('Listening for presence events until terminated. Press Ctrl+C to exit.')}`)
        }
      } else {
          this.logCliEvent(flags, 'presence', 'present', 'Staying present in the room until terminated');
          if (!this.shouldOutputJson(flags)) {
            this.log(`\n${chalk.dim('Staying present in the room until terminated. Press Ctrl+C to exit.')}`)
          }
      }

      this.logCliEvent(flags, 'presence', 'listening', 'Actively present and listening for events');
      // Keep the process running until interrupted
      await new Promise<void>((resolve, reject) => {
        let isCleaningUp = false

        const cleanup = async () => {
          if (isCleaningUp) return
          isCleaningUp = true

          this.logCliEvent(flags, 'presence', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');
          if (!this.shouldOutputJson(flags)) {
            this.log(`\n${chalk.yellow('Leaving room and closing connection...')}`)
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            const errorMsg = 'Force exiting after timeout during cleanup';
            this.logCliEvent(flags, 'presence', 'forceExit', errorMsg, { roomId });
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({ error: errorMsg, roomId, success: false }, flags))
            } else {
              this.log(chalk.red('Force exiting after timeout...'))
            }

            clearTimeout(forceExitTimeout);
            this.logCliEvent(flags, 'presence', 'cleanupComplete', 'Cleanup complete');
            resolve();
          }, 5000)

          try {
            // Unsubscribe listeners first
            if (this.unsubscribePresenceFn) {
                this.logCliEvent(flags, 'presence', 'unsubscribingEvents', 'Unsubscribing from presence events');
                try { this.unsubscribePresenceFn(); this.logCliEvent(flags, 'presence', 'unsubscribedEvents', 'Unsubscribed from presence events'); } catch { /* ignore */ }
            }

            if (this.unsubscribeStatusFn) {
                this.logCliEvent(flags, 'room', 'unsubscribingStatus', 'Unsubscribing from room status');
                try { this.unsubscribeStatusFn(); this.logCliEvent(flags, 'room', 'unsubscribedStatus', 'Unsubscribed from room status'); } catch { /* ignore */ }
            }

            // Leave the room using presence API
            try {
              this.logCliEvent(flags, 'presence', 'leaving', 'Attempting to leave presence');
              await room.presence.leave()
              this.logCliEvent(flags, 'presence', 'left', 'Successfully left room presence');
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({ action: 'leave', roomId, success: true }, flags))
              } else {
                this.log(chalk.green('Successfully left room presence.'))
              }
            } catch (error) {
               const errorMsg = error instanceof Error ? error.message : String(error);
               this.logCliEvent(flags, 'presence', 'leaveError', `Error leaving presence: ${errorMsg}`, { error: errorMsg });
               if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({ error: errorMsg, roomId, success: false }, flags))
              } else {
                this.log(`Note: ${errorMsg}`);
                this.log('Continuing with cleanup.')
              }
            }

            // Release the room
            try {
              this.logCliEvent(flags, 'room', 'releasing', `Releasing room ${roomId}`);
              await chatClient.rooms.release(roomId)
              this.logCliEvent(flags, 'room', 'released', `Room ${roomId} released`);
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({ action: 'release', roomId, success: true }, flags))
              } else {
                this.log(chalk.green('Successfully released room.'))
              }
            } catch (error) {
               const errorMsg = error instanceof Error ? error.message : String(error);
               this.logCliEvent(flags, 'room', 'releaseError', `Error releasing room: ${errorMsg}`, { error: errorMsg });
               if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({ error: errorMsg, roomId, success: false }, flags))
              } else {
                this.log(`Note: ${errorMsg}`);
                this.log('Continuing with cleanup.')
              }
            }

            if (this.clients?.realtimeClient) {
               this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
               this.clients.realtimeClient.close();
               this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed');
            }

            if (!this.shouldOutputJson(flags)) {
              this.log(`${chalk.green('Successfully disconnected.')}`)
            }

            clearTimeout(forceExitTimeout)
          } catch (error) {
             const errorMsg = error instanceof Error ? error.message : String(error);
             this.logCliEvent(flags, 'presence', 'cleanupError', `Error during cleanup: ${errorMsg}`, { error: errorMsg });
             if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({ error: errorMsg, roomId, success: false }, flags))
            } else {
              this.log(`Error during cleanup: ${errorMsg}`)
            }

            clearTimeout(forceExitTimeout)
            reject(new Error(errorMsg))
          }
        }

        process.once('SIGINT', () => void cleanup())
        process.once('SIGTERM', () => void cleanup())
      })
    } catch (error) {
       const errorMsg = error instanceof Error ? error.message : String(error);
       this.logCliEvent(flags, 'presence', 'fatalError', `Error entering room presence: ${errorMsg}`, { error: errorMsg, roomId: args.roomId });
       if (this.shouldOutputJson(flags)) {
         this.log(this.formatJsonOutput({ error: errorMsg, roomId: args.roomId, success: false }, flags))
       } else {
         this.error(`Error entering room presence: ${errorMsg}`)
       }
    } finally {
       // Ensure client is closed even if cleanup promise didn't resolve
       if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed') {
           this.logCliEvent(flags || {}, 'connection', 'finalCloseAttempt', 'Ensuring connection is closed in finally block.');
           this.clients.realtimeClient.close();
       }
    }
  }
} 