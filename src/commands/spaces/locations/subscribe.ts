import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces, { Space } from '@ably/spaces'
import * as Ably from 'ably'
import type { LocationsEvents } from '@ably/spaces'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

// Define interfaces for location types
interface SpaceMember {
  clientId: string;
  connectionId: string;
  isConnected: boolean;
  profileData: Record<string, unknown> | null;
}

interface LocationItem {
  member: SpaceMember;
  location: any;
}

interface LocationUpdate {
  action: string;
  member: SpaceMember;
  location: any;
}

export default class SpacesLocationsSubscribe extends SpacesBaseCommand {
  static override description = 'Subscribe to location changes in a space'

  static override examples = [
    '$ ably spaces locations subscribe my-space',
    '$ ably spaces locations subscribe my-space --json',
    '$ ably spaces locations subscribe my-space --pretty-json',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    
  }

  static override args = {
    spaceId: Args.string({
      description: 'Space ID to subscribe to locations for',
      required: true,
    }),
  }

  private clients: SpacesClients | null = null;
  private subscription: any = null;
  private cleanupInProgress = false;
  private space: Space | null = null;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocationsSubscribe)
    const spaceId = args.spaceId;

    try {
      // Create Spaces client
      this.clients = await this.createSpacesClient(flags)
      if (!this.clients) return

      const { spacesClient, realtimeClient } = this.clients

      // Add listeners for connection state changes
      realtimeClient.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Make sure we have a connection before proceeding
      this.logCliEvent(flags, 'connection', 'waiting', 'Waiting for connection to establish...');
      await new Promise<void>((resolve, reject) => {
        const checkConnection = () => {
          const state = realtimeClient.connection.state;
          if (state === 'connected') {
             this.logCliEvent(flags, 'connection', 'connected', 'Realtime connection established.');
            resolve();
          } else if (state === 'failed' || state === 'closed' || state === 'suspended') {
             const errorMsg = `Connection failed with state: ${state}`;
             this.logCliEvent(flags, 'connection', 'failed', errorMsg, { state });
            reject(new Error(errorMsg));
          } else {
            // Still connecting, check again shortly
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });

      // Get the space
      this.logCliEvent(flags, 'spaces', 'gettingSpace', `Getting space: ${spaceId}...`);
      if (!this.shouldOutputJson(flags)) {
        this.log(`Connecting to space: ${chalk.cyan(spaceId)}...`);
      }
      this.space = await spacesClient.get(spaceId);
      const space = this.space; // Local const
      this.logCliEvent(flags, 'spaces', 'gotSpace', `Successfully got space handle: ${spaceId}`);

      // Enter the space
      this.logCliEvent(flags, 'spaces', 'entering', 'Entering space...');
      await space.enter()
      this.logCliEvent(flags, 'spaces', 'entered', 'Successfully entered space', { clientId: realtimeClient.auth.clientId });

      // Get current locations
      this.logCliEvent(flags, 'location', 'gettingInitial', `Fetching initial locations for space ${spaceId}`);
      if (!this.shouldOutputJson(flags)) {
        this.log(`Fetching current locations for space ${chalk.cyan(spaceId)}...`);
      }

      let locations: LocationItem[] = [];
      try {
        const result = await space.locations.getAll();
        this.logCliEvent(flags, 'location', 'gotInitial', `Fetched initial locations`, { locations: result });

        if (result && typeof result === 'object') {
          if (Array.isArray(result)) {
             // Unlikely based on current docs, but handle if API changes
             // Need to map Array result to LocationItem[] if structure differs
             this.logCliEvent(flags, 'location', 'initialFormatWarning', 'Received array format for initial locations, expected object');
             // Assuming array elements match expected structure for now:
             locations = result.map((item: any) => ({ member: item.member, location: item.location })) as LocationItem[];
          } else if (Object.keys(result).length > 0) {
            // Standard case: result is an object { connectionId: locationData }
            locations = Object.entries(result).map(([connectionId, locationData]) => ({
              member: { // Construct a partial SpaceMember as SDK doesn't provide full details here
                clientId: 'unknown', // clientId not directly available in getAll response
                connectionId: connectionId,
                isConnected: true, // Assume connected for initial state
                profileData: null
              },
              location: locationData
            }));
          }
        }

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            spaceId,
            type: 'locations_snapshot',
            locations: locations.map(item => ({
              // Map to a simpler structure for output if needed
              connectionId: item.member.connectionId,
              location: item.location
            }))
          }, flags));
        } else {
          if (locations.length === 0) {
            this.log(chalk.yellow('No locations are currently set in this space.'));
          } else {
            this.log(`\n${chalk.cyan('Current locations')} (${chalk.bold(locations.length.toString())}):\n`);
            locations.forEach(item => {
              this.log(`- Connection ID: ${chalk.blue(item.member.connectionId || 'Unknown')}`); // Use connectionId as key
              this.log(`  ${chalk.dim('Location:')} ${JSON.stringify(item.location)}`);
            });
          }
        }
      } catch (error) {
         const errorMsg = `Error fetching locations: ${error instanceof Error ? error.message : String(error)}`;
         this.logCliEvent(flags, 'location', 'getInitialError', errorMsg, { spaceId, error: errorMsg });
         if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: false, spaceId, error: errorMsg, status: 'error' }, flags));
        } else {
          this.log(chalk.yellow(errorMsg));
        }
      }

      this.logCliEvent(flags, 'location', 'subscribing', 'Subscribing to location updates');
      if (!this.shouldOutputJson(flags)) {
        this.log(`\n${chalk.dim('Subscribing to location changes. Press Ctrl+C to exit.')}\n`);
      }

      try {
        this.subscription = await space.locations.subscribe('update', (update: LocationsEvents.UpdateEvent) => {
          try {
            const timestamp = new Date().toISOString();
            const eventData = {
                timestamp,
                action: 'update',
                member: {
                  clientId: update.member.clientId,
                  connectionId: update.member.connectionId
                },
                location: update.currentLocation,
                previousLocation: update.previousLocation
            };
            this.logCliEvent(flags, 'location', 'updateReceived', 'Location update received', { spaceId, ...eventData });

            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({ success: true, spaceId, type: 'location_update', ...eventData }, flags));
            } else {
              this.log(`[${timestamp}] ${chalk.blue(update.member.clientId)} ${chalk.yellow('updated')} location:`);
              this.log(`  ${chalk.dim('Current:')} ${JSON.stringify(update.currentLocation)}`);
              this.log(`  ${chalk.dim('Previous:')} ${JSON.stringify(update.previousLocation)}`);
            }
          } catch (error) {
             const errorMsg = `Error processing location update: ${error instanceof Error ? error.message : String(error)}`;
             this.logCliEvent(flags, 'location', 'updateProcessError', errorMsg, { spaceId, error: errorMsg });
             if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({ success: false, spaceId, error: errorMsg, status: 'error' }, flags));
            } else {
              this.log(chalk.red(errorMsg));
            }
          }
        });
        this.logCliEvent(flags, 'location', 'subscribed', 'Successfully subscribed to location updates');
      } catch (error) {
         const errorMsg = `Error subscribing to location updates: ${error instanceof Error ? error.message : String(error)}`;
         this.logCliEvent(flags, 'location', 'subscribeError', errorMsg, { spaceId, error: errorMsg });
         if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: false, spaceId, error: errorMsg, status: 'error' }, flags));
        } else {
          this.log(chalk.red(errorMsg));
        }
      }

      this.logCliEvent(flags, 'location', 'listening', 'Listening for location updates...');
      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          if (this.cleanupInProgress) return;
          this.cleanupInProgress = true;
          this.logCliEvent(flags, 'location', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');

          if (!this.shouldOutputJson(flags)) {
            this.log(`\n${chalk.yellow('Unsubscribing and closing connection...')}`);
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
             const errorMsg = 'Force exiting after timeout during cleanup';
             this.logCliEvent(flags, 'location', 'forceExit', errorMsg, { spaceId });
             if (!this.shouldOutputJson(flags)) {
                this.log(chalk.red('Force exiting after timeout...'));
             }
            process.exit(1);
          }, 5000);

          try {
            // Unsubscribe from location events
            if (this.subscription) {
              try {
                 this.logCliEvent(flags, 'location', 'unsubscribing', 'Unsubscribing from location events');
                 this.subscription.unsubscribe();
                 this.logCliEvent(flags, 'location', 'unsubscribed', 'Successfully unsubscribed from location events');
              } catch (error) {
                   const errorMsg = `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`;
                   this.logCliEvent(flags, 'location', 'unsubscribeError', errorMsg, { spaceId, error: errorMsg });
                   if (!this.shouldOutputJson(flags)) {
                      this.log(`Note: ${errorMsg}`);
                      this.log('Continuing with cleanup.');
                   }
              }
            }

            if (space) {
               try {
                 // Leave the space
                 this.logCliEvent(flags, 'spaces', 'leaving', 'Leaving space...');
                 await space.leave();
                 this.logCliEvent(flags, 'spaces', 'left', 'Successfully left space');
               } catch (error) {
                  const errorMsg = `Error leaving space: ${error instanceof Error ? error.message : String(error)}`;
                  this.logCliEvent(flags, 'spaces', 'leaveError', errorMsg, { spaceId, error: errorMsg });
                  if (!this.shouldOutputJson(flags)) {
                      this.log(`Error leaving space: ${errorMsg}`);
                      this.log('Continuing with cleanup.');
                  }
               }
            }

            if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed') {
               try {
                  this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
                  this.clients.realtimeClient.close();
                  this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed');
               } catch (error) {
                   const errorMsg = `Error closing client: ${error instanceof Error ? error.message : String(error)}`;
                   this.logCliEvent(flags, 'connection', 'closeError', errorMsg, { spaceId, error: errorMsg });
                   if (!this.shouldOutputJson(flags)) {
                     this.log(errorMsg);
                   }
               }
            }

            clearTimeout(forceExitTimeout);
            this.logCliEvent(flags, 'location', 'cleanupComplete', 'Cleanup complete');
             if (!this.shouldOutputJson(flags)) {
                 this.log(chalk.green('\nDisconnected.'));
             }
            resolve();
            // Force exit after cleanup
            process.exit(0);
          } catch (error) {
             const errorMsg = `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`;
             this.logCliEvent(flags, 'location', 'cleanupError', errorMsg, { spaceId, error: errorMsg });
             if (!this.shouldOutputJson(flags)) {
               this.log(`Error during cleanup: ${errorMsg}`);
             }
            clearTimeout(forceExitTimeout);
            process.exit(1);
          }
        };

        process.once('SIGINT', cleanup);
        process.once('SIGTERM', cleanup);
      });
    } catch (error) {
       const errorMsg = `Error: ${error instanceof Error ? error.message : String(error)}`;
       this.logCliEvent(flags, 'location', 'fatalError', errorMsg, { error: errorMsg, spaceId });
       this.error(errorMsg);
    } finally {
      // Ensure client is closed even if cleanup promise didn't resolve
       if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed') {
           this.logCliEvent(flags || {}, 'connection', 'finalCloseAttempt', 'Ensuring connection is closed in finally block.');
           this.clients.realtimeClient.close();
       }
    }
  }

   // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.subscription) { try { this.subscription.unsubscribe(); } catch (e) { /* ignore */ } }
     if (!this.cleanupInProgress && this.space) {
        try { await this.space.leave(); } catch(e) {/* ignore */} // Best effort
     }
     if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed') {
       if (this.clients.realtimeClient.connection.state !== 'failed') {
           this.clients.realtimeClient.close();
       }
     }
     return super.finally(err);
   }
}