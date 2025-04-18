import type { LocationsEvents } from '@ably/spaces'

import Spaces, { type Space } from '@ably/spaces'
import { Args, Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { SpacesBaseCommand } from '../../../spaces-base-command.js'

// Define the type for location subscription
interface LocationSubscription {
  unsubscribe: () => void;
}

export default class SpacesLocationsSet extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: 'Space ID to set location in',
      required: true,
    }),
  }

  static override description = 'Set your location in a space'

  static override examples = [
    '$ ably spaces locations set my-space --location \'{"x":10,"y":20}\'',
    '$ ably spaces locations set my-space --location \'{"sectionId":"section1"}\'',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    location: Flags.string({
      description: 'Location data to set (JSON format)',
      required: true,
    }),
    
  }

  private cleanupInProgress = false;
  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: Spaces | null = null;
  private space: Space | null = null;
  private subscription: LocationSubscription | null = null;
  private locationHandler: ((locationUpdate: LocationsEvents.UpdateEvent) => void) | null = null;

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<void> {
     this.unsubscribeFromLocation();
     
     // Attempt to clear location and leave space if not already done and space exists
     if (!this.cleanupInProgress && this.space) {
        try { await this.space.locations.set(null); } catch{/* ignore */} // Best effort
        try { await this.space.leave(); } catch{/* ignore */} // Best effort
     }

     if (this.realtimeClient && this.realtimeClient.connection.state !== 'closed' && this.realtimeClient.connection.state !== 'failed') {
           this.realtimeClient.close();
       }

     return super.finally(err);
   }

   private unsubscribeFromLocation(): void {
     if (this.locationHandler && this.space) {
       try {
         this.space.locations.unsubscribe('update', this.locationHandler);
         this.locationHandler = null;
       } catch {
         // Ignore unsubscribe errors during cleanup
       }
     }
   }

   async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocationsSet)
    const {spaceId} = args;

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
      this.realtimeClient.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Parse location data
      let location: Record<string, unknown> | null = null;
      try {
        location = JSON.parse(flags.location)
        this.logCliEvent(flags, 'location', 'dataParsed', 'Location data parsed successfully', { location });
      } catch (error) {
         const errorMsg = `Invalid location JSON: ${error instanceof Error ? error.message : String(error)}`;
         this.logCliEvent(flags, 'location', 'dataParseError', errorMsg, { error: errorMsg });
         this.error(errorMsg);
         return;
      }

      if (!location) { // Should not happen if parsing succeeded, but for type safety
          this.error('Failed to parse location data.');
          return;
      }

      // Get the space
      this.logCliEvent(flags, 'spaces', 'gettingSpace', `Getting space: ${spaceId}...`);
      this.logCliEvent(flags, 'spaces', 'gotSpace', `Successfully got space handle: ${spaceId}`);

      // Enter the space first
      this.logCliEvent(flags, 'spaces', 'entering', 'Entering space...');
      await this.space.enter()
      this.logCliEvent(flags, 'spaces', 'entered', 'Successfully entered space', { clientId: this.realtimeClient!.auth.clientId });

      // Set the location
      this.logCliEvent(flags, 'location', 'setting', 'Setting location', { location });
      await this.space.locations.set(location)
      this.logCliEvent(flags, 'location', 'setSuccess', 'Successfully set location', { location });
      if (!this.shouldOutputJson(flags)) {
          this.log(`${chalk.green('Successfully set location:')} ${JSON.stringify(location, null, 2)}`);
      }

      // Subscribe to location updates from other users
      this.logCliEvent(flags, 'location', 'subscribing', 'Watching for other location changes...');
      if (!this.shouldOutputJson(flags)) {
          this.log(`\n${chalk.dim('Watching for other location changes. Press Ctrl+C to exit.')}\n`);
      }

      // Store subscription handlers
      this.locationHandler = (locationUpdate: LocationsEvents.UpdateEvent) => {
        const timestamp = new Date().toISOString()
        const {member} = locationUpdate
        const {currentLocation} = locationUpdate // Use current location
        const {connectionId} = member

        // Skip self events - check connection ID
        const selfConnectionId = this.realtimeClient!.connection.id
        if (connectionId === selfConnectionId) {
          return
        }

        const eventData = {
            action: 'update',
            location: currentLocation,
            member: {
              clientId: member.clientId,
              connectionId: member.connectionId
            },
            timestamp
        };
        this.logCliEvent(flags, 'location', 'updateReceived', 'Location update received', eventData);

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: true, ...eventData }, flags))
        } else {
          // For locations, use yellow for updates
          const actionColor = chalk.yellow
          const action = 'update'

          this.log(`[${timestamp}] ${chalk.blue(member.clientId || 'Unknown')} ${actionColor(action)}d location:`)
          this.log(`  ${chalk.dim('Location:')} ${JSON.stringify(currentLocation, null, 2)}`)
        }
      };

      // Subscribe to updates
      this.space.locations.subscribe('update', this.locationHandler);
      this.subscription = { 
        unsubscribe: () => {
          if (this.locationHandler && this.space) {
            this.space.locations.unsubscribe('update', this.locationHandler);
            this.locationHandler = null;
          }
        }
      };
      
      this.logCliEvent(flags, 'location', 'subscribed', 'Successfully subscribed to location updates');

      this.logCliEvent(flags, 'location', 'listening', 'Listening for location updates...');
      // Keep the process running until interrupted
      await new Promise<void>((resolve, reject) => {
        const cleanup = async () => {
          if (this.cleanupInProgress) return
          this.cleanupInProgress = true
          this.logCliEvent(flags, 'location', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');

          if (!this.shouldOutputJson(flags)) {
             this.log(`\n${chalk.yellow('Cleaning up and closing connection...')}`);
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
             const errorMsg = 'Force exiting after timeout during cleanup';
             this.logCliEvent(flags, 'location', 'forceExit', errorMsg, { spaceId });
             if (!this.shouldOutputJson(flags)) {
                this.log(chalk.red('Force exiting after timeout...'));
             }

            reject(new Error('Cleanup timed out'));
          }, 5000)

          try {
            // Unsubscribe from location events
            if (this.subscription) {
               try {
                  this.logCliEvent(flags, 'location', 'unsubscribing', 'Unsubscribing from location events');
                  this.subscription.unsubscribe();
                  this.logCliEvent(flags, 'location', 'unsubscribed', 'Successfully unsubscribed from location events');
               } catch(error) { this.logCliEvent(flags, 'location', 'unsubscribeError', 'Error unsubscribing', { error: error instanceof Error ? error.message : String(error) }); }
            }

            if (this.space) {
              try {
                // Clear the location by setting it to null
                this.logCliEvent(flags, 'location', 'clearing', 'Clearing location by setting to null');
                await this.space.locations.set(null);
                this.logCliEvent(flags, 'location', 'cleared', 'Successfully cleared location.');

                // Leave the space
                 this.logCliEvent(flags, 'spaces', 'leaving', 'Leaving space...');
                 await this.space.leave();
                 this.logCliEvent(flags, 'spaces', 'left', 'Successfully left space');
              } catch (error) {
                 const errorMsg = `Error during location cleanup/leave: ${error instanceof Error ? error.message : String(error)}`;
                 this.logCliEvent(flags, 'location', 'cleanupLeaveError', errorMsg, { error: errorMsg });
                 if (!this.shouldOutputJson(flags)) {
                    this.log(`Error during cleanup: ${errorMsg}`);
                 }
              }
            }

            if (this.realtimeClient && this.realtimeClient.connection.state !== 'closed') {
               this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
               this.realtimeClient.close();
               this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed');
            }

            this.logCliEvent(flags, 'location', 'cleanupComplete', 'Cleanup complete');
            if (!this.shouldOutputJson(flags)) {
               this.log(chalk.green('Successfully disconnected.'));
            }

            clearTimeout(forceExitTimeout)
            resolve();
          } catch (error) {
             const errorMsg = `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`;
             this.logCliEvent(flags, 'location', 'cleanupError', errorMsg, { error: errorMsg });
             if (!this.shouldOutputJson(flags)) {
                this.log(`Error during cleanup: ${errorMsg}`);
             }

            clearTimeout(forceExitTimeout)
            reject(new Error(`Cleanup failed: ${errorMsg}`));
          }
        }

        process.once('SIGINT', () => void cleanup())
        process.once('SIGTERM', () => void cleanup())
      })
    } catch (error) {
       const errorMsg = `Error: ${error instanceof Error ? error.message : String(error)}`;
       this.logCliEvent(flags, 'location', 'fatalError', errorMsg, { error: errorMsg });
       this.error(errorMsg);
    } finally {
      // Ensure client is closed even if cleanup promise didn't resolve
       if (this.realtimeClient && this.realtimeClient.connection.state !== 'closed') {
           this.logCliEvent(flags || {}, 'connection', 'finalCloseAttempt', 'Ensuring connection is closed in finally block.');
           this.realtimeClient.close();
       }
    }
  }
} 