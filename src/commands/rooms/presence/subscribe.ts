import { PresenceMember, RoomStatus, Subscription, PresenceEvents } from '@ably/chat'
import { Args, Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { ChatBaseCommand } from '../../../chat-base-command.js'

export default class RoomsPresenceSubscribe extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: 'Room ID to subscribe to presence for',
      required: true,
    }),
  }

  static override description = 'Subscribe to presence events in a chat room'

  static override examples = [
    '$ ably rooms presence subscribe my-room',
    '$ ably rooms presence subscribe my-room --json',
    '$ ably rooms presence subscribe my-room --pretty-json']

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    
  }

  private ablyClient: Ably.Realtime | null = null;
  private presenceSubscription: Subscription | null = null;
  private unsubscribeStatusFn: (() => void) | null = null;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsPresenceSubscribe)
    
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

      const {roomId} = args
      
      // Add listeners for connection state changes
      this.ablyClient.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Realtime connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });
      
      // Get the room with presence option
      this.logCliEvent(flags, 'room', 'gettingRoom', `Getting room handle for ${roomId}`);
      const room = await chatClient.rooms.get(roomId, {
        presence: {}
      })
      this.logCliEvent(flags, 'room', 'gotRoom', `Got room handle for ${roomId}`);
      
      // Subscribe to room status changes
      this.logCliEvent(flags, 'room', 'subscribingToStatus', 'Subscribing to room status changes');
      const { off: unsubscribeStatus } = room.onStatusChange((statusChange) => {
        let reason: Error | null | string | undefined;
        if (statusChange.current === RoomStatus.Failed) {
          reason = room.error; // Get reason from room.error on failure
        }

        const reasonMsg = reason instanceof Error ? reason.message : reason;
        this.logCliEvent(flags, 'room', `status-${statusChange.current}`, `Room status changed to ${statusChange.current}`, { reason: reasonMsg });

        switch (statusChange.current) {
        case RoomStatus.Attached: {
          if (!this.shouldOutputJson(flags)) {
            this.log(`${chalk.green('Successfully connected to room:')} ${chalk.cyan(roomId)}`);
          }
        
        break;
        }

        case RoomStatus.Detached: {
          if (!this.shouldOutputJson(flags)) {
            this.log(chalk.yellow('Disconnected from room'));
          }
        
        break;
        }

        case RoomStatus.Failed: {
          if (!this.shouldOutputJson(flags)) {
            this.error(`${chalk.red('Connection failed:')} ${reasonMsg || 'Unknown error'}`);
          }
        
        break;
        }
        // No default
        }
      });
      this.unsubscribeStatusFn = unsubscribeStatus;
      this.logCliEvent(flags, 'room', 'subscribedToStatus', 'Successfully subscribed to room status changes');
      
      // Attach to the room
      this.logCliEvent(flags, 'room', 'attaching', `Attaching to room ${roomId}`);
      await room.attach()
      // Successful attach logged by onStatusChange handler
      
      // Get current presence set
      this.logCliEvent(flags, 'presence', 'gettingInitialMembers', `Fetching initial presence members for room ${roomId}`);
      if (!this.shouldOutputJson(flags)) {
        this.log(`Fetching current presence members for room ${chalk.cyan(roomId)}...`);
      }
      
      const members: PresenceMember[] = await room.presence.get()
      const initialMembers = members.map(member => ({
        clientId: member.clientId,
        data: member.data,
        // ConnectionId is not available in Chat SDK PresenceMember
      }));
      this.logCliEvent(flags, 'presence', 'initialMembersFetched', `Fetched ${members.length} initial members`, { count: members.length, members: initialMembers });
      
      // Output current members based on format
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ members: initialMembers, roomId, success: true }, flags))
      } else if (members.length === 0) {
          this.log(chalk.yellow('No members are currently present in this room.'))
        } else {
          this.log(`\n${chalk.cyan('Current presence members')} (${chalk.bold(members.length.toString())}):\n`)
          
          for (const member of members) {
            this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)
            
            if (member.data && Object.keys(member.data).length > 0) {
              this.log(`  ${chalk.dim('Data:')} ${this.formatJsonOutput({ data: member.data }, flags)}`)
            }
            
            // Connection ID isn't available in the Chat SDK's PresenceMember type
          }
        }
      
      // Subscribe to presence events
      this.logCliEvent(flags, 'presence', 'subscribingToEvents', 'Subscribing to presence events');
      if (!this.shouldOutputJson(flags)) {
        this.log(`\n${chalk.dim('Subscribing to presence events. Press Ctrl+C to exit.')}\n`);
      }
      
      this.presenceSubscription = room.presence.subscribe(PresenceEvents.Update, (member) => {
        const timestamp = new Date().toISOString() // Chat SDK doesn't provide timestamp in event
        const action = member.action || 'unknown'
        const eventData = {
          action,
          member: {
            clientId: member.clientId,
            data: member.data
          },
          roomId,
          timestamp
        };
        this.logCliEvent(flags, 'presence', action, `Presence event '${action}' received`, eventData);

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: true, ...eventData }, flags))
        } else {
          let actionSymbol = '•'
          let actionColor = chalk.white
          
          switch (action) {
            case 'enter': {
              actionSymbol = '✓'
              actionColor = chalk.green
              break
            }

            case 'leave': {
              actionSymbol = '✗'
              actionColor = chalk.red
              break
            }

            case 'update': {
              actionSymbol = '⟲'
              actionColor = chalk.yellow
              break
            }
          }
          
          this.log(`[${timestamp}] ${actionColor(actionSymbol)} ${chalk.blue(member.clientId || 'Unknown')} ${actionColor(action)}`)
          
          if (member.data && Object.keys(member.data).length > 0) {
            this.log(`  ${chalk.dim('Data:')} ${this.formatJsonOutput({ data: member.data }, flags)}`)
          }
        }
      })
      this.logCliEvent(flags, 'presence', 'subscribedToEvents', 'Successfully subscribed to presence events');

      this.logCliEvent(flags, 'presence', 'listening', 'Listening for presence events...');
      // Keep the process running until interrupted
      await new Promise<void>((resolve, reject) => {
        let cleanupInProgress = false
        
        const cleanup = async () => {
          if (cleanupInProgress) return
          cleanupInProgress = true
          
          this.logCliEvent(flags, 'presence', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');
          if (!this.shouldOutputJson(flags)) {
            this.log(`\n${chalk.yellow('Unsubscribing and closing connection...')}`);
          }
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            const errorMsg = 'Force exiting after timeout during cleanup';
            this.logCliEvent(flags, 'presence', 'forceExit', errorMsg, { roomId });
            if (!this.shouldOutputJson(flags)) {
              this.log(chalk.red('Force exiting after timeout...'));
            }

            process.exit(1)
          }, 5000)
          
          try {
            // Unsubscribe from presence events
            if (this.presenceSubscription) {
              try {
                this.logCliEvent(flags, 'presence', 'unsubscribingEvents', 'Unsubscribing from presence events');
                this.presenceSubscription.unsubscribe()
                this.logCliEvent(flags, 'presence', 'unsubscribedEvents', 'Successfully unsubscribed from presence events');
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.logCliEvent(flags, 'presence', 'unsubscribeEventsError', `Error unsubscribing from presence: ${errorMsg}`, { error: errorMsg });
                if (!this.shouldOutputJson(flags)) {
                  this.log(`Note: ${errorMsg}`);
                  this.log('Continuing with cleanup.');
                }
              }
            }
            
            // Unsubscribe from status changes
            if (this.unsubscribeStatusFn) {
              try {
                this.logCliEvent(flags, 'room', 'unsubscribingStatus', 'Unsubscribing from room status');
                this.unsubscribeStatusFn()
                this.logCliEvent(flags, 'room', 'unsubscribedStatus', 'Successfully unsubscribed from status events');
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.logCliEvent(flags, 'room', 'unsubscribeStatusError', `Error unsubscribing from status: ${errorMsg}`, { error: errorMsg });
                if (!this.shouldOutputJson(flags)) {
                  this.log(`Note: ${errorMsg}`);
                  this.log('Continuing with cleanup.');
                }
              }
            }
            
            // Release the room
            try {
              this.logCliEvent(flags, 'room', 'releasing', `Releasing room ${roomId}`);
              await chatClient.rooms.release(roomId)
              this.logCliEvent(flags, 'room', 'released', `Room ${roomId} released`);
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              this.logCliEvent(flags, 'room', 'releaseError', `Error releasing room: ${errorMsg}`, { error: errorMsg });
              if (!this.shouldOutputJson(flags)) {
                this.log(`Note: ${errorMsg}`);
                this.log('Continuing with cleanup.');
              }
            }
            
            if (this.ablyClient) {
              this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
              this.ablyClient.close();
              this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed');
            }
            
            if (!this.shouldOutputJson(flags)) {
              this.log(chalk.green('Successfully disconnected.'));
            }

            clearTimeout(forceExitTimeout)
            resolve()
             
            process.exit(0)
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logCliEvent(flags, 'presence', 'cleanupError', `Error during cleanup: ${errorMsg}`, { error: errorMsg });
            if (!this.shouldOutputJson(flags)) {
              this.log(`Error during cleanup: ${errorMsg}`);
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
       this.logCliEvent(flags, 'presence', 'fatalError', `Error: ${errorMsg}`, { error: errorMsg, roomId: args.roomId });
       this.error(`Error: ${errorMsg}`);
    } finally {
       // Ensure client is closed even if cleanup promise didn't resolve
       if (this.ablyClient && this.ablyClient.connection.state !== 'closed') {
           this.logCliEvent(flags || {}, 'connection', 'finalCloseAttempt', 'Ensuring connection is closed in finally block.');
           this.ablyClient.close();
       }
    }
  }
} 