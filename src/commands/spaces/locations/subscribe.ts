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
    '$ ably spaces locations subscribe my-space --format json',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
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
      this.log(`Connecting to space: ${chalk.cyan(spaceId)}...`);
      const space = await spacesClient.get(spaceId);
      
      // Enter the space
      await space.enter()
      
      // Wait for space to be properly entered before fetching locations
      this.log(`Waiting for space ${chalk.cyan(spaceId)} to be ready...`);
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
              this.log(`${chalk.green('Successfully entered space:')} ${chalk.cyan(spaceId)}`);
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
      this.log(`Fetching current locations for space ${chalk.cyan(spaceId)}...`);
      
      let locations: any[] = [];
      try {
        // Make sure to handle the return value correctly
        const result = await space.locations.getAll();
        
        // Debug info to understand what's being returned
        if (flags.format === 'json') {
          this.log(`Raw API response: ${JSON.stringify(result || {})}`);
        }
        
        // The locations API might return an object with location data
        if (result && typeof result === 'object') {
          if (Array.isArray(result)) {
            locations = result;
            
            // Add debug info for first item if available
            if (locations.length > 0 && flags.format === 'json') {
              this.log(`First location item structure: ${JSON.stringify(locations[0])}`);
            }
          } else if (Object.keys(result).length > 0) {
            // If result is an object with member IDs as keys, convert to array with proper format
            // Convert the object to an array of {memberId, location} objects
            locations = Object.entries(result).map(([memberId, locationData]) => ({
              memberId,
              location: locationData
            }));
            
            // Add debug info for first item if available
            if (locations.length > 0 && flags.format === 'json') {
              this.log(`First location item structure: ${JSON.stringify(locations[0])}`);
            }
          }
        }
      } catch (error) {
        this.log(chalk.yellow(`Error fetching locations: ${error instanceof Error ? error.message : String(error)}`));
        this.log(chalk.yellow('Continuing with empty locations list.'));
      }
      
      try {
        // Filter out locations with null/empty data before displaying
        const validLocations = locations.filter((item: any) => {
          if (item === null || item === undefined) return false;
          
          // Check different structures - get the location data however it's stored
          let locationData;
          if (item.location !== undefined) {
            locationData = item.location;
          } else if (item.data !== undefined) {
            locationData = item.data;
          } else {
            // For raw object structure, exclude known metadata fields
            const { clientId, id, userId, memberId, connectionId, member, ...rest } = item;
            // If all that's left is metadata, there's no real location data
            if (Object.keys(rest).length === 0) return false;
            locationData = rest;
          }
          
          // Strictly check if location data is empty or null
          if (locationData === null || locationData === undefined) return false;
          if (typeof locationData === 'object' && Object.keys(locationData).length === 0) return false;
          
          return true;
        });
        
        // Output current locations based on format
        if (flags.format === 'json') {
          this.log(JSON.stringify(locations, null, 2));
        } else {
          if (!validLocations || validLocations.length === 0) {
            this.log(chalk.yellow('No locations are currently set in this space.'));
          } else {
            const locationsCount = validLocations.length;
            this.log(`\n${chalk.cyan('Current locations')} (${chalk.bold(String(locationsCount))}):\n`);
            
            validLocations.forEach((locationItem: any) => {
              try {
                // The location structure might be different than we expected
                // Handle the different possible structures
                
                let memberId = 'Unknown';
                let locationData = {};
                let connectionId = null;
                
                // Check different possible structures
                if (locationItem?.memberId) {
                  // If we converted it to {memberId, location} format
                  memberId = locationItem.memberId;
                  locationData = locationItem.location;
                } else if (locationItem?.member?.clientId) {
                  // If we have { member: { clientId }, location }
                  memberId = locationItem.member.clientId;
                  connectionId = locationItem.member.connectionId;
                  locationData = locationItem.location || {};
                } else if (locationItem?.clientId) {
                  // If we have { clientId, location } directly
                  memberId = locationItem.clientId;
                  connectionId = locationItem.connectionId;
                  locationData = locationItem.location || locationItem.data || {};
                } else if (typeof locationItem === 'object' && locationItem !== null) {
                  // If the item itself is the location data
                  // Try to extract clientId from somewhere
                  memberId = locationItem.clientId || locationItem.id || locationItem.userId || 'Unknown';
                  connectionId = locationItem.connectionId;
                  
                  // Use the whole object as location data, excluding some known metadata fields
                  const { clientId: _, id: __, userId: ___, memberId: ____, connectionId: _____, ...rest } = locationItem;
                  locationData = Object.keys(rest).length > 0 ? rest : {};
                }
                
                this.log(`- ${chalk.blue(memberId)}:`);
                
                // Handle different location data formats
                if (typeof locationData === 'object' && locationData !== null) {
                  this.log(`  ${chalk.dim('Location:')} ${JSON.stringify(locationData, null, 2)}`);
                } else if (locationData !== undefined && locationData !== null) {
                  // Handle primitive location data
                  this.log(`  ${chalk.dim('Location:')} ${locationData}`);
                }
                
                // Check for current member indicator
                const selfConnectionId = clients?.realtimeClient.connection.id;
                if (locationItem?.member?.isCurrentMember || 
                    (connectionId && selfConnectionId === connectionId)) {
                  this.log(`  ${chalk.green('(Current member)')}`);
                }
              } catch (err) {
                this.log(`- ${chalk.red('Error displaying location item')}: ${err instanceof Error ? err.message : String(err)}`);
              }
            });
          }
        }
      } catch (error) {
        this.log(chalk.red(`Error formatting locations: ${error instanceof Error ? error.message : String(error)}`));
      }
      
      // Subscribe to location updates
      this.log(`\n${chalk.dim('Subscribing to location updates. Press Ctrl+C to exit.')}\n`);
      
      try {
        subscription = await space.locations.subscribe('update', (locationUpdate: any) => {
          try {
            const timestamp = new Date().toISOString();
            const action = locationUpdate?.action || 'update';
            
            // Extract location data first - to check if we should process this update
            let location = null;
            
            // Check different possible location paths
            if (locationUpdate?.currentLocation !== undefined) {
              location = locationUpdate.currentLocation;
            } else if (locationUpdate?.location !== undefined) {
              location = locationUpdate.location;
            } else if (locationUpdate?.data !== undefined) {
              location = locationUpdate.data;
            } else if (locationUpdate?.update?.location !== undefined) {
              location = locationUpdate.update.location;
            }
            
            // More strict verification of location data - skip if no valid location
            if (location === null || location === undefined) return;
            if (typeof location === 'object' && Object.keys(location).length === 0) return;
            
            // Now extract member information since we know there's valid location data
            let memberId = 'Unknown';
            let connectionId = null;
            
            // Handle different structure possibilities
            if (locationUpdate?.member?.clientId) {
              memberId = locationUpdate.member.clientId;
              connectionId = locationUpdate.member.connectionId;
            } else if (locationUpdate?.clientId) {
              memberId = locationUpdate.clientId;
              connectionId = locationUpdate.connectionId;
            } else if (locationUpdate?.memberId) {
              memberId = locationUpdate.memberId;
            } else if (typeof locationUpdate === 'object' && locationUpdate !== null) {
              // If this is a raw update with the member ID as a property
              if (locationUpdate.clientId) {
                memberId = locationUpdate.clientId;
              } else if (locationUpdate.id) {
                memberId = locationUpdate.id;
              } else if (locationUpdate.name) {
                memberId = locationUpdate.name;
              } else {
                // If none of the above, check for other keys that might contain the member ID
                const keys = Object.keys(locationUpdate).filter(k => 
                  k !== 'data' && k !== 'location' && k !== 'currentLocation' && 
                  k !== 'update' && k !== 'action'
                );
                if (keys.length > 0) {
                  memberId = keys[0]; // Use the first non-data key as member ID
                }
              }
              
              connectionId = locationUpdate.connectionId;
            }
            
            if (flags.format === 'json') {
              const jsonOutput = {
                timestamp,
                action,
                member: {
                  id: memberId,
                  connectionId,
                },
                location
              };
              this.log(JSON.stringify(jsonOutput));
            } else {
              // For location updates, use yellow color
              const actionColor = chalk.yellow;
              
              // Check if this is the current member by comparing connectionIds
              const selfConnectionId = clients?.realtimeClient.connection.id;
              const isSelf = connectionId === selfConnectionId ? ` ${chalk.green('(you)')}` : '';
              
              this.log(`[${timestamp}] ${chalk.blue(memberId)}${isSelf} ${actionColor(action + 'd')} location:`);
              
              // Handle different location data formats
              if (typeof location === 'object' && location !== null) {
                this.log(`  ${chalk.dim('Location:')} ${JSON.stringify(location, null, 2)}`);
              } else if (location !== undefined && location !== null) {
                // Handle primitive location data
                this.log(`  ${chalk.dim('Location:')} ${location}`);
              }
            }
          } catch (error) {
            this.log(chalk.red(`Error processing location update: ${error instanceof Error ? error.message : String(error)}`));
          }
        });
      } catch (error) {
        this.log(chalk.red(`Error subscribing to location updates: ${error instanceof Error ? error.message : String(error)}`));
        this.log(chalk.yellow('Will continue running, but may not receive location updates.'));
      }

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          if (cleanupInProgress) return;
          cleanupInProgress = true;
          
          this.log(`\n${chalk.yellow('Unsubscribing and closing connection...')}`);
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            this.log(chalk.red('Force exiting after timeout...'));
            process.exit(1);
          }, 5000);
          
          try {
            // Unsubscribe from location events
            if (subscription) {
              try {
                subscription.unsubscribe();
                this.log(chalk.green('Successfully unsubscribed from location events.'));
              } catch (error) {
                this.log(`Note: ${error instanceof Error ? error.message : String(error)}`);
                this.log('Continuing with cleanup.');
              }
            }
            
            try {
              // Leave the space
              await space.leave();
              this.log(chalk.green('Successfully left the space.'));
            } catch (error) {
              this.log(`Error leaving space: ${error instanceof Error ? error.message : String(error)}`);
              this.log('Continuing with cleanup.');
            }
            
            try {
              if (clients?.realtimeClient) {
                clients.realtimeClient.close();
                this.log(chalk.green('Successfully closed connection.'));
              }
            } catch (error) {
              this.log(`Error closing client: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            this.log(chalk.green('Successfully disconnected.'));
            clearTimeout(forceExitTimeout);
            resolve();
            // Force exit after cleanup
            process.exit(0);
          } catch (error) {
            this.log(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`);
            clearTimeout(forceExitTimeout);
            process.exit(1);
          }
        };

        process.once('SIGINT', () => void cleanup());
        process.once('SIGTERM', () => void cleanup());
      });
    } catch (error) {
      // Handle original error more carefully
      if (error === undefined || error === null) {
        this.log(chalk.red('An unknown error occurred (error object is undefined or null)'));
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
        this.log(chalk.red(`Error: ${errorMessage}`));
      }
      process.exit(1);
    } finally {
      try {
        if (clients?.realtimeClient) {
          clients.realtimeClient.close();
        }
      } catch (closeError: unknown) {
        // Just log, don't throw
        this.log(chalk.yellow(`Error closing client: ${closeError instanceof Error ? closeError.message : String(closeError)}`));
      }
    }
  }
}