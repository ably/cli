import type { SpaceMember } from '@ably/spaces'

import Spaces, { type Space } from '@ably/spaces'
import { Args, Flags as _Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { SpacesBaseCommand } from '../../../spaces-base-command.js'

export default class SpacesMembersSubscribe extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: 'Space ID to subscribe to members for',
      required: true,
    }),
  }

  static override description = 'Subscribe to member presence events in a space'

  static override examples = [
    '$ ably spaces members subscribe my-space',
    '$ ably spaces members subscribe my-space --json',
    '$ ably spaces members subscribe my-space --pretty-json']

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
  }

  private cleanupInProgress = false;
  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: Spaces | null = null;
  private space: Space | null = null;
  private listener: ((member: SpaceMember) => void) | null = null;

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<void> {
     if (this.listener && this.space) { try { await this.space.members.unsubscribe(this.listener); } catch { /* ignore */ } }
     if (!this.cleanupInProgress && this.space) {
         try { await this.space.leave(); } catch{/* ignore */} // Best effort
     }

     if (this.realtimeClient && this.realtimeClient.connection.state !== 'closed' && this.realtimeClient.connection.state !== 'failed') {
           this.realtimeClient.close();
       }

     return super.finally(err);
   }

   async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesMembersSubscribe)
    const {spaceId} = args;

    // Keep track of the last event we've seen for each client to avoid duplicates
    const lastSeenEvents = new Map<string, {action: string, timestamp: number}>()

    try {
      // Create Spaces client using setupSpacesClient
      const setupResult = await this.setupSpacesClient(flags, spaceId);
      this.realtimeClient = setupResult.realtimeClient;
      this.spacesClient = setupResult.spacesClient;
      this.space = setupResult.space;
      if (!this.realtimeClient || !this.spacesClient || !this.space) {
        this.error('Failed to initialize clients or space');
        return;
      }

      // Add listeners for connection state changes
      this.realtimeClient!.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Get the space
      this.logCliEvent(flags, 'spaces', 'gettingSpace', `Getting space: ${spaceId}...`);
      this.logCliEvent(flags, 'spaces', 'gotSpace', `Successfully got space handle: ${spaceId}`);

      // Enter the space to subscribe
      this.logCliEvent(flags, 'spaces', 'entering', 'Entering space...');
      if (!this.space) { this.error('Space object is null before entering'); return; }
      await this.space.enter()
      this.logCliEvent(flags, 'spaces', 'entered', 'Successfully entered space', { clientId: this.realtimeClient!.auth.clientId });

      // Get current members
      this.logCliEvent(flags, 'member', 'gettingInitial', 'Fetching initial members');
      if (!this.space) { this.error('Space object is null before getting members'); return; }
      const members = await this.space.members.getAll()
      const initialMembers = members.map(member => ({
          clientId: member.clientId,
          connectionId: member.connectionId,
          isConnected: member.isConnected,
          profileData: member.profileData
      }));
      this.logCliEvent(flags, 'member', 'gotInitial', `Fetched ${members.length} initial members`, { count: members.length, members: initialMembers });

      // Output current members
      if (members.length === 0) {
        if (!this.shouldOutputJson(flags)) {
           this.log(chalk.yellow('No members are currently present in this space.'));
        }
      } else if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            members: initialMembers,
            spaceId,
            status: 'connected',
            success: true
          }, flags))
        } else {
          this.log(`\n${chalk.cyan('Current members')} (${chalk.bold(members.length.toString())}):\n`)

          for (const member of members) {
            this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)

            if (member.profileData && Object.keys(member.profileData).length > 0) {
              this.log(`  ${chalk.dim('Profile:')} ${JSON.stringify(member.profileData, null, 2)}`)
            }

            if (member.connectionId) {
              this.log(`  ${chalk.dim('Connection ID:')} ${member.connectionId}`)
            }

            if (member.isConnected === false) {
              this.log(`  ${chalk.dim('Status:')} Not connected`)
            }
          }
        }

      if (!this.shouldOutputJson(flags)) {
          this.log(`\n${chalk.dim('Subscribing to member events. Press Ctrl+C to exit.')}\n`);
      }

      // Subscribe to member presence events
      this.logCliEvent(flags, 'member', 'subscribing', 'Subscribing to member updates');
      if (!this.space) { this.error('Space object is null before subscribing to members'); return; }

      // Define the listener function
      this.listener = (member: SpaceMember) => {
        const timestamp = new Date().toISOString()
        const now = Date.now()

        // Determine the action from the member's lastEvent
        const action = member.lastEvent?.name || 'unknown'
        const clientId = member.clientId || 'Unknown'
        const connectionId = member.connectionId || 'Unknown'

        // Skip self events - check connection ID
        const selfConnectionId = this.realtimeClient!.connection.id
        if (member.connectionId === selfConnectionId) {
          return
        }

        // Create a unique key for this client+connection combination
        const clientKey = `${clientId}:${connectionId}`

        // Check if we've seen this exact event recently (within 500ms)
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
      };

      // Subscribe using the stored listener
      await this.space.members.subscribe('update', this.listener);

      this.logCliEvent(flags, 'member', 'subscribed', 'Successfully subscribed to member updates');

      this.logCliEvent(flags, 'member', 'listening', 'Listening for member updates...');
      // Keep the process running until interrupted
      await new Promise<void>((_resolve, _reject) => {
        // eslint-disable-next-line unicorn/consistent-function-scoping
        const cleanup = async () => {
          if (this.cleanupInProgress) return
          this.cleanupInProgress = true
          this.logCliEvent(flags, 'member', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');

          if (!this.shouldOutputJson(flags)) {
             this.log(`\n${chalk.yellow('Unsubscribing and closing connection...')}`);
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
             const errorMsg = 'Force exiting after timeout during cleanup';
             this.logCliEvent(flags, 'member', 'forceExit', errorMsg, { spaceId });
             if (!this.shouldOutputJson(flags)) {
                this.log(chalk.red('Force exiting after timeout...'));
             }

            this.exit(1); // Use oclif's exit method instead of process.exit
          }, 5000);

          try {
            // Unsubscribe from member events using the stored listener
            if (this.listener && this.space) {
              try {
                 this.logCliEvent(flags, 'member', 'unsubscribing', 'Unsubscribing from member updates');
                 await this.space.members.unsubscribe(this.listener);
                 this.logCliEvent(flags, 'member', 'unsubscribed', 'Successfully unsubscribed from member updates');
              } catch (error) {
                  const errorMsg = `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`;
                  this.logCliEvent(flags, 'member', 'unsubscribeError', errorMsg, { error: errorMsg });
              }
            }

            if (this.space) {
               try {
                 this.logCliEvent(flags, 'spaces', 'leaving', 'Leaving space...');
                 await this.space.leave();
                 this.logCliEvent(flags, 'spaces', 'left', 'Successfully left space');
               } catch (error) {
                  const errorMsg = `Error leaving space: ${error instanceof Error ? error.message : String(error)}`;
                  this.logCliEvent(flags, 'spaces', 'leaveError', errorMsg, { error: errorMsg });
               }
            }

            if (this.realtimeClient && this.realtimeClient.connection.state !== 'closed') {
               try {
                  this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
                  this.realtimeClient.close();
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

            // The command will naturally complete after the promise resolves
          } catch (error) {
             const errorMsg = `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`;
             this.logCliEvent(flags, 'member', 'cleanupError', errorMsg, { error: errorMsg });
             if (!this.shouldOutputJson(flags)) {
                this.log(chalk.red(errorMsg));
             }
          }
        }

        cleanup();
      });
    } catch (error) {
      const errorMsg = `Error during execution: ${error instanceof Error ? error.message : String(error)}`;
      this.logCliEvent(flags, 'member', 'executionError', errorMsg, { error: errorMsg });
      if (!this.shouldOutputJson(flags)) {
         this.log(chalk.red(errorMsg));
      }
    }
  }
}