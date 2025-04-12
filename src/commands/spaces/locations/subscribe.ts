import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
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

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocationsSubscribe)
    
    let clients: SpacesClients | null = null
    let subscription: any = null
    let cleanupInProgress = false
    
    try {
      // Create Spaces client
      clients = await this.createSpacesClient(flags)
      if (!clients) return

      const { spacesClient, realtimeClient } = clients
      const spaceId = args.spaceId
      
      // Make sure we have a connection before proceeding
      await new Promise<void>((resolve, reject) => {
        const checkConnection = () => {
          const state = realtimeClient.connection.state;
          if (state === 'connected') {
            resolve();
          } else if (state === 'failed' || state === 'closed' || state === 'suspended') {
            reject(new Error(`Connection failed with state: ${state}`));
          } else {
            // Still connecting, check again shortly
            setTimeout(checkConnection, 100);
          }
        };
        
        checkConnection();
      });
      
      // Get the space
      if (!this.shouldOutputJson(flags)) {
        this.log(`Connecting to space: ${chalk.cyan(spaceId)}...`);
      }
      const space = await spacesClient.get(spaceId);
      
      // Enter the space
      await space.enter()
      
      // Wait for space to be properly entered before fetching locations
      await new Promise<void>((resolve, reject) => {
        // Set a reasonable timeout to avoid hanging indefinitely
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for space connection'));
        }, 5000);
        
        // Check if connection is active
        const checkConnection = () => {
          try {
            // Check realtime client state
            if (realtimeClient.connection.state === 'connected') {
              clearTimeout(timeout);
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  spaceId,
                  status: 'connected',
                  connectionId: realtimeClient.connection.id,
                }, flags));
              } else {
                this.log(`${chalk.green('Successfully entered space:')} ${chalk.cyan(spaceId)}`);
              }
              resolve();
            } else if (realtimeClient.connection.state === 'failed' || 
                       realtimeClient.connection.state === 'closed' || 
                       realtimeClient.connection.state === 'suspended') {
              clearTimeout(timeout);
              reject(new Error(`Connection failed with state: ${realtimeClient.connection.state}`));
            } else {
              // Still connecting, check again shortly
              setTimeout(checkConnection, 100);
            }
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        };
        
        checkConnection();
      });
      
      // Get current locations
      if (!this.shouldOutputJson(flags)) {
        this.log(`Fetching current locations for space ${chalk.cyan(spaceId)}...`);
      }
      
      let locations: LocationItem[] = [];
      try {
        const result = await space.locations.getAll();
        
        if (result && typeof result === 'object') {
          if (Array.isArray(result)) {
            locations = result;
          } else if (Object.keys(result).length > 0) {
            locations = Object.entries(result).map(([memberId, locationData]) => ({
              member: {
                clientId: memberId,
                connectionId: '',
                isConnected: true,
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
              member: item.member,
              location: item.location
            }))
          }, flags));
        } else {
          if (locations.length === 0) {
            this.log(chalk.yellow('No locations are currently set in this space.'));
          } else {
            this.log(`\n${chalk.cyan('Current locations')} (${chalk.bold(locations.length.toString())}):\n`);
            locations.forEach(item => {
              this.log(`- ${chalk.blue(item.member.clientId || 'Unknown')}`);
              this.log(`  ${chalk.dim('Location:')} ${JSON.stringify(item.location)}`);
            });
          }
        }
      } catch (error) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            spaceId,
            error: `Error fetching locations: ${error instanceof Error ? error.message : String(error)}`,
            status: 'error'
          }, flags));
        } else {
          this.log(chalk.yellow(`Error fetching locations: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      if (!this.shouldOutputJson(flags)) {
        this.log(`\n${chalk.dim('Subscribing to location changes. Press Ctrl+C to exit.')}\n`);
      }
      
      try {
        subscription = await space.locations.subscribe('update', (update: LocationsEvents.UpdateEvent) => {
          try {
            const timestamp = new Date().toISOString();
            
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: true,
                spaceId,
                type: 'location_update',
                timestamp,
                action: 'update',
                member: update.member,
                location: update.currentLocation
              }, flags));
            } else {
              this.log(`[${timestamp}] ${chalk.blue(update.member.clientId)} ${chalk.dim('update')}`);
              this.log(`  ${chalk.dim('Location:')} ${JSON.stringify(update.currentLocation)}`);
            }
          } catch (error) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                spaceId,
                error: `Error processing location update: ${error instanceof Error ? error.message : String(error)}`,
                status: 'error'
              }, flags));
            } else {
              this.log(chalk.red(`Error processing location update: ${error instanceof Error ? error.message : String(error)}`));
            }
          }
        });
      } catch (error) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            spaceId,
            error: `Error subscribing to location updates: ${error instanceof Error ? error.message : String(error)}`,
            status: 'error'
          }, flags));
        } else {
          this.log(chalk.red(`Error subscribing to location updates: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          if (cleanupInProgress) return;
          cleanupInProgress = true;
          
          if (!this.shouldOutputJson(flags)) {
            this.log(`\n${chalk.yellow('Unsubscribing and closing connection...')}`);
          }
          
          try {
            if (subscription) {
              subscription.unsubscribe();
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  spaceId,
                  status: 'unsubscribed'
                }, flags));
              }
            }
            
            try {
              await space.leave();
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  spaceId,
                  status: 'left'
                }, flags));
              }
            } catch (error) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: false,
                  spaceId,
                  error: `Error leaving space: ${error instanceof Error ? error.message : String(error)}`,
                  status: 'error'
                }, flags));
              }
            }
            
            if (clients?.realtimeClient) {
              clients.realtimeClient.close();
            }
            
            resolve();
            process.exit(0);
          } catch (error) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                spaceId,
                error: `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`,
                status: 'error'
              }, flags));
            }
            process.exit(1);
          }
        };

        process.once('SIGINT', cleanup);
        process.once('SIGTERM', cleanup);
      });
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          spaceId: args.spaceId,
          error: error instanceof Error ? error.message : String(error),
          status: 'error'
        }, flags));
      } else {
        this.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close();
      }
    }
  }
}