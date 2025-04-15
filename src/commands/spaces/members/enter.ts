import type { ProfileData, SpaceMember } from '@ably/spaces'

import Spaces, { Space } from '@ably/spaces'
import { Args, Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { SpacesBaseCommand } from '../../../spaces-base-command.js'

interface SpacesClients {
  realtimeClient: Ably.Realtime;
  spacesClient: Spaces;
}

export default class SpacesMembersEnter extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: 'Space ID to enter',
      required: true,
    }),
  }

  static override description = 'Enter a space and remain present until terminated'

  static override examples = [
    '$ ably spaces members enter my-space',
    '$ ably spaces members enter my-space --profile \'{"name":"User","status":"active"}\'',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    profile: Flags.string({
      description: 'Optional profile data to include with the member (JSON format)',
      required: false,
    }),
  }

  private cleanupInProgress = false;
  private clients: SpacesClients | null = null;
  private space: Space | null = null;
  private subscription: any = null;

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.subscription) { try { this.subscription.unsubscribe(); } catch { /* ignore */ } }
     if (!this.cleanupInProgress && this.space) {
         try { await this.space.leave(); } catch{/* ignore */} // Best effort
     }

     if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed' && this.clients.realtimeClient.connection.state !== 'failed') {
           this.clients.realtimeClient.close();
       }

     return super.finally(err);
   }

   async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesMembersEnter)
    const {spaceId} = args;

    // Keep track of the last event we've seen for each client to avoid duplicates
    const lastSeenEvents = new Map<string, {action: string, timestamp: number}>()

    try {
      // Create Spaces client
      this.clients = await this.createSpacesClient(flags)
      if (!this.clients) return

      const { realtimeClient, spacesClient } = this.clients

      // Add listeners for connection state changes
      realtimeClient.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Parse profile data if provided
      let profileData: ProfileData | undefined
      if (flags.profile) {
        try {
          profileData = JSON.parse(flags.profile)
          this.logCliEvent(flags, 'member', 'profileParsed', 'Profile data parsed successfully', { profileData });
        } catch (error) {
           const errorMsg = `Invalid profile JSON: ${error instanceof Error ? error.message : String(error)}`;
           this.logCliEvent(flags, 'member', 'profileParseError', errorMsg, { error: errorMsg, spaceId });
           if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({ error: errorMsg, spaceId, success: false }, flags))
          } else {
            this.error(errorMsg);
          }

          return;
        }
      }

      // Get the space
      this.logCliEvent(flags, 'spaces', 'gettingSpace', `Getting space: ${spaceId}...`);
      this.space = await spacesClient.get(spaceId)
      const {space} = this; // Local const
      this.logCliEvent(flags, 'spaces', 'gotSpace', `Successfully got space handle: ${spaceId}`);

      // Enter the space with optional profile
      this.logCliEvent(flags, 'member', 'enteringSpace', 'Attempting to enter space', { profileData });
      await space.enter(profileData)
      const enteredEventData = {
          connectionId: realtimeClient.connection.id,
          profile: profileData,
          spaceId,
          status: 'connected',
      };
      this.logCliEvent(flags, 'member', 'enteredSpace', 'Successfully entered space', enteredEventData);

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ success: true, ...enteredEventData }, flags))
      } else {
        this.log(`${chalk.green('Successfully entered space:')} ${chalk.cyan(spaceId)}`)
        if (profileData) {
          this.log(`${chalk.dim('Profile:')} ${JSON.stringify(profileData, null, 2)}`)
        }
      }

      // Subscribe to member presence events to show other members' activities
      this.logCliEvent(flags, 'member', 'subscribing', 'Subscribing to member updates');
      if (!this.shouldOutputJson(flags)) {
        this.log(`\n${chalk.dim('Watching for other members. Press Ctrl+C to exit.')}\n`)
      }

      this.subscription = await space.members.subscribe('update', (member: SpaceMember) => {
        const timestamp = new Date().toISOString()
        const now = Date.now()

        // Determine the action from the member's lastEvent
        const action = member.lastEvent?.name || 'unknown'
        const clientId = member.clientId || 'Unknown'
        const connectionId = member.connectionId || 'Unknown'

        // Skip self events - check connection ID
        const selfConnectionId = this.clients?.realtimeClient.connection.id
        if (member.connectionId === selfConnectionId) {
          return
        }

        // Create a unique key for this client+connection combination
        const clientKey = `${clientId}:${connectionId}`

        // Check if we've seen this exact event recently (within 500ms)
        // This helps avoid duplicate enter/leave events that might come through
        const lastEvent = lastSeenEvents.get(clientKey)

        if (lastEvent &&
            lastEvent.action === action &&
            (now - lastEvent.timestamp) < 500) {
          this.logCliEvent(flags, 'member', 'duplicateEventSkipped', `Skipping duplicate event '${action}' for ${clientId}`, { action, clientId });
          return; // Skip duplicate events within 500ms window
        }

        // Update the last seen event for this client+connection
        lastSeenEvents.set(clientKey, {
          action,
          timestamp: now
        })

         const memberEventData = {
             action,
             member: {
               clientId: member.clientId,
               connectionId: member.connectionId,
               isConnected: member.isConnected,
               profileData: member.profileData
             },
             spaceId,
             timestamp,
             type: 'member_update'
         };
         this.logCliEvent(flags, 'member', `update-${action}`, `Member event '${action}' received`, memberEventData);

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: true, ...memberEventData }, flags))
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

          this.log(`[${timestamp}] ${actionColor(actionSymbol)} ${chalk.blue(clientId)} ${actionColor(action)}`)

          if (member.profileData && Object.keys(member.profileData).length > 0) {
            this.log(`  ${chalk.dim('Profile:')} ${JSON.stringify(member.profileData, null, 2)}`)
          }

          if (connectionId !== 'Unknown') {
            this.log(`  ${chalk.dim('Connection ID:')} ${connectionId}`)
          }

          if (member.isConnected === false) {
            this.log(`  ${chalk.dim('Status:')} Not connected`)
          }
        }
      })
      this.logCliEvent(flags, 'member', 'subscribed', 'Successfully subscribed to member updates');

      this.logCliEvent(flags, 'member', 'listening', 'Listening for member updates...');
      // Keep the process running until interrupted
      await new Promise<void>((resolve, reject) => {
        const cleanup = async () => {
          if (this.cleanupInProgress) return
          this.cleanupInProgress = true
          this.logCliEvent(flags, 'member', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');

          if (!this.shouldOutputJson(flags)) {
            this.log(`\n${chalk.yellow('Leaving space and closing connection...')}`)
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
             const errorMsg = 'Force exiting after timeout during cleanup';
             this.logCliEvent(flags, 'member', 'forceExit', errorMsg, { spaceId });
             if (!this.shouldOutputJson(flags)) {
                this.log(chalk.red('Force exiting after timeout...'));
             }

            this.exit(1);
          }, 5000)

          try {
            // Unsubscribe from member events
            if (this.subscription) {
               try {
                  this.logCliEvent(flags, 'member', 'unsubscribing', 'Unsubscribing from member updates');
                  this.subscription.unsubscribe();
                  this.logCliEvent(flags, 'member', 'unsubscribed', 'Successfully unsubscribed from member updates');
               } catch(error) { this.logCliEvent(flags, 'member', 'unsubscribeError', 'Error unsubscribing', { error: error instanceof Error ? error.message : String(error) }); }
            }

            if (space) {
               try {
                 this.logCliEvent(flags, 'spaces', 'leaving', 'Leaving space...');
                 await space.leave();
                 this.logCliEvent(flags, 'spaces', 'left', 'Successfully left space');
               } catch (error) {
                  const errorMsg = `Error leaving space: ${error instanceof Error ? error.message : String(error)}`;
                  this.logCliEvent(flags, 'spaces', 'leaveError', errorMsg, { error: errorMsg });
               }
            }

            if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed') {
               try {
                  this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
                  this.clients.realtimeClient.close();
                  this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed');
               } catch (error) {
                  const errorMsg = `Error closing client: ${error instanceof Error ? error.message : String(error)}`;
                  this.logCliEvent(flags, 'connection', 'closeError', errorMsg, { error: errorMsg });
               }
            }

            clearTimeout(forceExitTimeout);
            this.logCliEvent(flags, 'member', 'cleanupComplete', 'Cleanup complete');
            if (!this.shouldOutputJson(flags)) {
               this.log(chalk.green('\nSuccessfully disconnected.'));
            }

            resolve();
          } catch (error) {
             const errorMsg = `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`;
             this.logCliEvent(flags, 'member', 'cleanupError', errorMsg, { error: errorMsg });
             if (!this.shouldOutputJson(flags)) {
                this.log(chalk.red(`\nError during cleanup: ${errorMsg}`));
             }

            reject(error);
          }
        }

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
      })
    } catch (error) {
      const errorMsg = `Error: ${error instanceof Error ? error.message : String(error)}`;
      this.logCliEvent(flags, 'error', 'unhandledError', errorMsg, { error: errorMsg });
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ error: errorMsg, success: false }, flags))
      } else {
        this.error(errorMsg);
      }
    }
  }
}
