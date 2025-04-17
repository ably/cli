import { ChatClient, RoomStatus, RoomStatusChange } from '@ably/chat'
import { Args, Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { ChatBaseCommand } from '../../../chat-base-command.js'

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
    'profile-data': Flags.string({
      description: 'Profile data to publish (JSON string)',
    }),
  }

  private ablyClient: Ably.Realtime | null = null;
  private unsubscribeStatusFn: (() => void) | null = null;
  private unsubscribePresenceFn: (() => void) | null = null;
  private chatClient: ChatClient | null = null;
  private profileData: Record<string, unknown> | null = null;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.unsubscribeStatusFn) { try { this.unsubscribeStatusFn(); } catch { /* ignore */ } }
    if (this.ablyClient && this.ablyClient.connection.state !== 'closed' && this.ablyClient.connection.state !== 'failed') {
        this.ablyClient.close();
    }

    return super.finally(err);
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsPresenceEnter)
    const {roomId} = args;

    try {
      // Parse profile data if provided
      if (flags['profile-data']) {
        try {
          this.profileData = JSON.parse(flags['profile-data']);
          this.logCliEvent(flags, 'presence', 'profileDataParsed', 'Profile data parsed successfully', { profileData: this.profileData });
        } catch (error) {
          const errorMsg = `Invalid profile-data JSON: ${error instanceof Error ? error.message : String(error)}`;
          this.logCliEvent(flags, 'presence', 'profileDataParseError', errorMsg, { error: errorMsg, roomId });
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({ error: errorMsg, roomId, success: false }, flags));
          } else {
            this.error(errorMsg);
          }

          return;
        }
      }

      // Create Chat client
      this.chatClient = await this.createChatClient(flags)
      // Also get the underlying Ably client for cleanup and state listeners
      this.ablyClient = await this.createAblyClient(flags);

      if (!this.chatClient) {
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
      const room = await this.chatClient.rooms.get(roomId, {
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
        const { unsubscribe: unsubscribePresence } = room.presence.subscribe((event) => {
          // Only show other members, not ourselves
          if (event.clientId !== this.chatClient?.clientId) {
            const timestamp = new Date().toISOString()
            const eventData = {
                action: event.action,
                member: {
                    clientId: event.clientId,
                    data: event.data
                },
                roomId,
                timestamp
            };
            this.logCliEvent(flags, 'presence', event.action, `Presence event '${event.action}' received`, eventData);

            if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({ success: true, ...eventData }, flags))
            } else {
                // Check what kind of presence event it is based on action property
                switch (event.action) {
                case 'enter': {
                    this.log(`${chalk.green('✓')} ${chalk.blue(event.clientId || 'Unknown')} entered room`)
                
                break;
                }

                case 'leave': {
                    this.log(`${chalk.red('✗')} ${chalk.blue(event.clientId || 'Unknown')} left room`)
                
                break;
                }

                case 'update': {
                    this.log(`${chalk.yellow('⟲')} ${chalk.blue(event.clientId || 'Unknown')} updated presence data:`);
                    this.log(`  ${chalk.dim('Data:')} ${this.formatJsonOutput(event.data as Record<string, unknown>, flags)}`);
                
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

      this.logCliEvent(flags, 'presence', 'entering', 'Attempting to enter presence', { data: this.profileData || {} });
      await room.presence.enter(this.profileData || {});
      const enterEventData = {
          action: 'enter',
          member: {
              clientId: this.chatClient?.clientId,
              data: this.profileData || {}
          },
          roomId
      };
      this.logCliEvent(flags, 'presence', 'entered', 'Successfully entered presence', { profileData: this.profileData });

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ success: true, ...enterEventData }, flags))
      } else {
        this.log(`${chalk.green('✓')} Entered room ${chalk.cyan(roomId)} as ${chalk.blue(this.chatClient?.clientId || 'Unknown')}`)
      }

      if (flags['show-others']) {
        // Get and display current presence members
        this.logCliEvent(flags, 'presence', 'gettingInitialMembers', 'Fetching initial presence members');
        const members = await room.presence.get()
        const initialMembers = members.filter(member => member.clientId !== this.chatClient?.clientId).map(member => ({
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
              if (member.clientId !== this.chatClient?.clientId) {
                this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)
                if (member.data && Object.keys(member.data).length > 0) {
                  this.log(`  ${chalk.dim('Data:')} ${this.formatJsonOutput(member.data as Record<string, unknown>, flags)}`)
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
              await this.chatClient?.rooms.release(roomId)
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

            if (this.ablyClient) {
               this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
               this.ablyClient.close();
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
       if (this.ablyClient && this.ablyClient.connection.state !== 'closed') {
           this.logCliEvent(flags || {}, 'connection', 'finalCloseAttempt', 'Ensuring connection is closed in finally block.');
           this.ablyClient.close();
       }
    }
  }
} 