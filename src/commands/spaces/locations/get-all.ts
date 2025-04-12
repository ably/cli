import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
import * as Ably from 'ably'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

interface LocationItem {
  memberId?: string;
  member?: {
    clientId?: string;
    isCurrentMember?: boolean;
  };
  clientId?: string;
  id?: string;
  userId?: string;
  location?: any;
  data?: any;
  connectionId?: string;
  [key: string]: any;
}

export default class SpacesLocationsGetAll extends SpacesBaseCommand {
  static override description = 'Get all current locations in a space'

  static override examples = [
    '$ ably spaces locations get-all my-space',
    '$ ably spaces locations get-all my-space --json',
    '$ ably spaces locations get-all my-space --pretty-json']

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
      if (!this.shouldOutputJson(flags)) {
        this.log(`Fetching locations for space ${chalk.cyan(spaceId)}...`);
      }
      
      let locations: any = [];
      try {
        const result = await space.locations.getAll();
        
        // Convert locations to consistent format
        if (result && typeof result === 'object') {
          if (Array.isArray(result)) {
            locations = result;
          } else if (Object.keys(result).length > 0) {
            locations = Object.entries(result).map(([memberId, locationData]) => ({
              memberId,
              location: locationData
            }));
          }
        }

        // Filter out invalid locations
        const validLocations = locations.filter((item: any) => {
          if (item === null || item === undefined) return false;
          
          let locationData;
          if (item.location !== undefined) {
            locationData = item.location;
          } else if (item.data !== undefined) {
            locationData = item.data;
          } else {
            const { clientId, id, userId, memberId, connectionId, member, ...rest } = item;
            if (Object.keys(rest).length === 0) return false;
            locationData = rest;
          }
          
          if (locationData === null || locationData === undefined) return false;
          if (typeof locationData === 'object' && Object.keys(locationData).length === 0) return false;
          
          return true;
        });
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            spaceId,
            timestamp: new Date().toISOString(),
            locations: validLocations.map((item: LocationItem) => {
              const memberId = item.memberId || item.member?.clientId || item.clientId || item.id || item.userId || 'Unknown';
              const locationData = item.location || item.data || (() => {
                const { clientId, id, userId, memberId, connectionId, member, ...rest } = item;
                return rest;
              })();
              return {
                memberId,
                location: locationData,
                isCurrentMember: item.member?.isCurrentMember || false
              };
            })
          }, flags));
        } else {
          if (!validLocations || validLocations.length === 0) {
            this.log(chalk.yellow('No locations are currently set in this space.'));
          } else {
            const locationsCount = validLocations.length;
            this.log(`\n${chalk.cyan('Current locations')} (${chalk.bold(String(locationsCount))}):\n`);
            
            validLocations.forEach((locationItem: any) => {
              try {
                const memberId = locationItem.memberId || locationItem.member?.clientId || locationItem.clientId || locationItem.id || locationItem.userId || 'Unknown';
                const locationData = locationItem.location || locationItem.data || (() => {
                  const { clientId, id, userId, memberId, connectionId, member, ...rest } = locationItem;
                  return rest;
                })();
                
                this.log(`- ${chalk.blue(memberId)}:`);
                this.log(`  ${chalk.dim('Location:')} ${JSON.stringify(locationData, null, 2)}`);
                
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
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            spaceId,
            error: error instanceof Error ? error.message : String(error),
            status: 'error'
          }, flags));
        } else {
          this.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
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