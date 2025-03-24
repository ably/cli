import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
import * as Ably from 'ably'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

export default class SpacesLocksGetAll extends SpacesBaseCommand {
  static override description = 'Get all current locks in a space'

  static override examples = [
    '$ ably spaces locks get-all my-space',
    '$ ably spaces locks get-all my-space --format json',
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
      description: 'Space ID to get locks from',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocksGetAll)
    
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
      const space = await spacesClient.get(spaceId)
      
      // Enter the space temporarily
      await space.enter()
      
      // Wait for space to be properly entered before fetching locks
      await new Promise<void>((resolve, reject) => {
        // Set a reasonable timeout to avoid hanging indefinitely
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for space connection'));
        }, 5000);
        
        const checkSpaceStatus = () => {
          try {
            // Check realtime client state
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
      
      // Get all locks
      this.log(`Fetching locks for space ${chalk.cyan(spaceId)}...`)
      
      let locks: any[] = [];
      try {
        // Make sure to handle the return value correctly
        const result = await space.locks.getAll();
        
        // Debug info to understand what's being returned
        if (flags.format === 'json') {
          this.log(`Raw API response: ${JSON.stringify(result || {})}`);
        }
        
        locks = Array.isArray(result) ? result : [];
      } catch (error) {
        this.log(chalk.yellow(`Error fetching locks: ${error instanceof Error ? error.message : String(error)}`));
        this.log(chalk.yellow('Continuing with empty locks list.'));
      }
      
      try {
        // Filter out invalid locks
        const validLocks = locks.filter((lock: any) => {
          if (!lock || !lock.id) return false;
          return true;
        });
        
        // Output locks based on format
        if (flags.format === 'json') {
          this.log(JSON.stringify(locks, null, 2))
        } else {
          if (!validLocks || validLocks.length === 0) {
            this.log(chalk.yellow('No locks are currently active in this space.'))
          } else {
            const lockCount = validLocks.length;
            this.log(`\n${chalk.cyan('Current locks')} (${chalk.bold(String(lockCount))}):\n`)
            
            validLocks.forEach((lock: any) => {
              try {
                this.log(`- ${chalk.blue(lock.id)}:`);
                this.log(`  ${chalk.dim('Status:')} ${lock.status || 'unknown'}`);
                this.log(`  ${chalk.dim('Holder:')} ${lock.member?.clientId || 'None'}`);
                
                if (lock.attributes && Object.keys(lock.attributes).length > 0) {
                  this.log(`  ${chalk.dim('Attributes:')} ${JSON.stringify(lock.attributes, null, 2)}`);
                }
              } catch (err) {
                this.log(`- ${chalk.red('Error displaying lock item')}: ${err instanceof Error ? err.message : String(err)}`);
              }
            });
          }
        }
      } catch (error) {
        this.log(chalk.red(`Error formatting locks: ${error instanceof Error ? error.message : String(error)}`));
      }
      
      try {
        // Leave the space after fetching locks
        await space.leave()
        this.log(chalk.green('\nSuccessfully disconnected.'))
        process.exit(0);
      } catch (error) {
        this.log(chalk.yellow(`Error leaving space: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
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
      } catch (closeError) {
        // Just log, don't throw
        this.log(chalk.yellow(`Error closing client: ${closeError instanceof Error ? closeError.message : String(closeError)}`));
      }
    }
  }
} 