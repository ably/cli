import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
import * as Ably from 'ably'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

export default class SpacesLocationsGetAll extends SpacesBaseCommand {
  static override description = 'Get all current locations in a space'

  static override examples = [
    '$ ably spaces locations get-all my-space',
    '$ ably spaces locations get-all my-space --format json',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    format: Flags.string({
      char: 'f',
      description: 'Output format',
      options: ['text', 'json'],
      default: 'text',
    }),
  }

  static override args = {
    spaceId: Args.string({
      description: 'Space ID to get locations from',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocationsGetAll)
    
    let clients: SpacesClients | null = null
    
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
      
      // Enter the space with proper connection verification
      await space.enter();
      
      // Wait for space to be properly entered before fetching locations
      await new Promise<void>((resolve, reject) => {
        // Set a reasonable timeout to avoid hanging indefinitely
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for space connection'));
        }, 5000);
        
        const checkSpaceStatus = () => {
          try {
            // Instead of checking space.status which doesn't exist, check the realtime connection
            if (realtimeClient.connection.state === 'connected') {
              clearTimeout(timeout);
              this.log(`${chalk.green('Connected to space:')} ${chalk.cyan(spaceId)}`);
              resolve();
            } else if (realtimeClient.connection.state === 'failed' || 
                       realtimeClient.connection.state === 'closed' || 
                       realtimeClient.connection.state === 'suspended') {
              clearTimeout(timeout);
              reject(new Error(`Space connection failed with connection state: ${realtimeClient.connection.state}`));
            } else {
              // Still connecting, check again shortly
              setTimeout(checkSpaceStatus, 100);
            }
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        };
        
        checkSpaceStatus();
      });
      
      // Get current locations
      this.log(`Fetching locations for space ${chalk.cyan(spaceId)}...`);
      
      let locations: any = [];
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
        
        // Output locations based on format
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
                
                // Check different possible structures
                if (locationItem?.memberId) {
                  // If we converted it to {memberId, location} format
                  memberId = locationItem.memberId;
                  locationData = locationItem.location;
                } else if (locationItem?.member?.clientId) {
                  // If we have { member: { clientId }, location }
                  memberId = locationItem.member.clientId;
                  locationData = locationItem.location || {};
                } else if (locationItem?.clientId) {
                  // If we have { clientId, location } directly
                  memberId = locationItem.clientId;
                  locationData = locationItem.location || locationItem.data || {};
                } else if (typeof locationItem === 'object' && locationItem !== null) {
                  // If the item itself is the location data
                  // Try to extract clientId from somewhere
                  memberId = locationItem.clientId || locationItem.id || locationItem.userId || 'Unknown';
                  
                  // Use the whole object as location data, excluding some known metadata fields
                  const { clientId: _, id: __, userId: ___, memberId: ____, ...rest } = locationItem;
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
                if (locationItem?.member?.isCurrentMember) {
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
      
      try {
        // Leave the space after fetching locations
        await space.leave();
        this.log(chalk.green('\nSuccessfully disconnected.'));
        process.exit(0);
      } catch (error) {
        this.log(chalk.yellow(`Error leaving space: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    } catch (error) {
      // Handle original error more carefully
      if (error === undefined || error === null) {
        this.log(chalk.red('An unknown error occurred (error object is undefined or null)'));
        process.exit(1);
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
        this.log(chalk.red(`Error: ${errorMessage}`));
        process.exit(1);
      }
    } finally {
      try {
        if (clients?.realtimeClient) {
          clients.realtimeClient.close();
        }
      } catch (closeError) {
        // Just log, don't throw
        this.log(chalk.yellow(`Error closing client: ${closeError instanceof Error ? closeError.message : String(closeError)}`));
      }
    }
  }
} 