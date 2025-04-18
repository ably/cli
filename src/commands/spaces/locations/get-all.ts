import Spaces from '@ably/spaces'
import { type Space } from '@ably/spaces'
import { Args, Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { SpacesBaseCommand } from '../../../spaces-base-command.js'

interface LocationData {
  [key: string]: unknown;
}

interface Member {
  clientId?: string;
  memberId?: string;
  isCurrentMember?: boolean;
}

interface LocationWithCurrent {
  current: {
    member: Member;
  };
  location?: LocationData;
  data?: LocationData;
  [key: string]: unknown;
}

interface LocationItem {
  [key: string]: unknown;
  clientId?: string;
  connectionId?: string;
  data?: LocationData;
  id?: string;
  location?: LocationData;
  member?: Member;
  memberId?: string;
  userId?: string;
}

export default class SpacesLocationsGetAll extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: 'Space ID to get locations from',
      required: true,
    }),
  }

  static override description = 'Get all current locations in a space'

  static override examples = [
    '$ ably spaces locations get-all my-space',
    '$ ably spaces locations get-all my-space --json',
    '$ ably spaces locations get-all my-space --pretty-json']

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    format: Flags.string({
      char: 'f',
      default: 'text',
      description: 'Output format',
      options: ['text', 'json'],
    }),
  }

  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: Spaces | null = null;
  private space: Space | null = null;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocationsGetAll)
    
    const {spaceId} = args
    
    try {
      const setupResult = await this.setupSpacesClient(flags, spaceId);
      this.realtimeClient = setupResult.realtimeClient;
      this.spacesClient = setupResult.spacesClient;
      this.space = setupResult.space;
      if (!this.realtimeClient || !this.spacesClient || !this.space) {
        this.error('Failed to initialize clients or space');
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const checkConnection = () => {
          const {state} = this.realtimeClient!.connection;
          if (state === 'connected') {
            resolve();
          } else if (state === 'failed' || state === 'closed' || state === 'suspended') {
            reject(new Error(`Connection failed with state: ${state}`));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        
        checkConnection();
      });
      
      this.log(`Connecting to space: ${chalk.cyan(spaceId)}...`);
      await this.space.enter();
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for space connection'));
        }, 5000);
        
        const checkSpaceStatus = () => {
          try {
            if (this.realtimeClient!.connection.state === 'connected') {
              clearTimeout(timeout);
              this.log(`${chalk.green('Connected to space:')} ${chalk.cyan(spaceId)}`);
              resolve();
            } else if (this.realtimeClient!.connection.state === 'failed' || 
                       this.realtimeClient!.connection.state === 'closed' || 
                       this.realtimeClient!.connection.state === 'suspended') {
              clearTimeout(timeout);
              reject(new Error(`Space connection failed with connection state: ${this.realtimeClient!.connection.state}`));
            } else {
              setTimeout(checkSpaceStatus, 100);
            }
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        };
        
        checkSpaceStatus();
      });
      
      if (!this.shouldOutputJson(flags)) {
        this.log(`Fetching locations for space ${chalk.cyan(spaceId)}...`);
      }
      
      let locations: LocationItem[] = [];
      try {
        const { items: locationsFromSpace } = await this.space.locations.getAll();
        
        if (locationsFromSpace && typeof locationsFromSpace === 'object') {
          if (Array.isArray(locationsFromSpace)) {
            locations = locationsFromSpace as LocationItem[];
          } else if (Object.keys(locationsFromSpace).length > 0) {
            locations = Object.entries(locationsFromSpace).map(([memberId, locationData]) => ({
              location: locationData,
              memberId
            })) as LocationItem[];
          }
        }

        const validLocations = locations.filter((item: LocationItem) => {
          if (item === null || item === undefined) return false;
          
          let locationData: unknown;
          if (item.location !== undefined) {
            locationData = item.location;
          } else if (item.data === undefined) {
            const {
              clientId: _clientId,
              connectionId: _connectionId,
              id: _id,
              member: _member,
              memberId: _memberId,
              userId: _userId,
              ...rest
            } = item;
            if (Object.keys(rest).length === 0) return false;
            locationData = rest;
          } else {
            locationData = item.data;
          }
          
          if (locationData === null || locationData === undefined) return false;
          if (typeof locationData === 'object' && Object.keys(locationData as object).length === 0) return false;
          
          return true;
        });
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            locations: validLocations.map((item: LocationItem) => {
              const memberId = item.memberId || item.member?.clientId || item.clientId || item.id || item.userId || 'Unknown';
              const locationData = item.location || item.data || (() => {
                const {
                  clientId: _clientId,
                  connectionId: _connectionId,
                  id: _id,
                  member: _member,
                  memberId: _memberId,
                  userId: _userId,
                  ...rest
                } = item;
                return rest;
              })();
              return {
                isCurrentMember: item.member?.isCurrentMember || false,
                location: locationData,
                memberId
              };
            }),
            spaceId,
            success: true,
            timestamp: new Date().toISOString()
          }, flags));
        } else if (!validLocations || validLocations.length === 0) {
            this.log(chalk.yellow('No locations are currently set in this space.'));
          } else {
            const locationsCount = validLocations.length;
            this.log(`\n${chalk.cyan('Current locations')} (${chalk.bold(String(locationsCount))}):\n`);
            
            for (const location of validLocations) {
              // Check if location has 'current' property with expected structure
              if ('current' in location && 
                  typeof location.current === 'object' && 
                  location.current !== null && 
                  'member' in location.current) {
                const locationWithCurrent = location as LocationWithCurrent;
                const { member } = locationWithCurrent.current;
                this.log(`Member ID: ${chalk.cyan(member.memberId || member.clientId)}`);
                try {
                  const locationData = location.location || location.data || (() => {
                    const {
                      clientId: _clientId,
                      connectionId: _connectionId,
                      id: _id,
                      member: _member,
                      memberId: _memberId,
                      userId: _userId,
                      ...rest
                    } = location;
                    return rest;
                  })();
                  
                  this.log(`- ${chalk.blue(member.memberId || member.clientId)}:`);
                  this.log(`  ${chalk.dim('Location:')} ${JSON.stringify(locationData, null, 2)}`);
                  
                  if (member.isCurrentMember) {
                    this.log(`  ${chalk.green('(Current member)')}`);
                  }
                } catch (error) {
                  this.log(`- ${chalk.red('Error displaying location item')}: ${error instanceof Error ? error.message : String(error)}`);
                }
              } else {
                // Simpler display if location doesn't have expected structure
                this.log(`- ${chalk.blue('Member')}:`);
                this.log(`  ${chalk.dim('Location:')} ${JSON.stringify(location, null, 2)}`);
              }
            }
          }
      } catch (error) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            error: error instanceof Error ? error.message : String(error),
            spaceId,
            status: 'error',
            success: false
          }, flags));
        } else {
          this.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      try {
        await this.space.leave();
        this.log(chalk.green('\nSuccessfully disconnected.'));
      } catch (error) {
        this.log(chalk.yellow(`Error leaving space: ${error instanceof Error ? error.message : String(error)}`));
      }
    } catch (error) {
      if (error === undefined || error === null) {
        this.log(chalk.red('An unknown error occurred (error object is undefined or null)'));
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
        this.log(chalk.red(`Error: ${errorMessage}`));
      }
    } finally {
      try {
        if (this.realtimeClient) {
          this.realtimeClient.close();
        }
      } catch (closeError) {
        this.log(chalk.yellow(`Error closing client: ${closeError instanceof Error ? closeError.message : String(closeError)}`));
      }
    }
  }
} 