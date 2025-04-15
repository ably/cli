import Spaces from '@ably/spaces'
import { Args, Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { SpacesBaseCommand } from '../../../spaces-base-command.js'

interface SpacesClients {
  realtimeClient: Ably.Realtime;
  spacesClient: Spaces;
}

interface LockItem {
  attributes?: Record<string, any>;
  id: string;
  member?: {
    clientId?: string;
  };
  status?: string;
}

export default class SpacesLocksGetAll extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: 'Space ID to get locks from',
      required: true,
    }),
  }

  static override description = 'Get all current locks in a space'

  static override examples = [
    '$ ably spaces locks get-all my-space',
    '$ ably spaces locks get-all my-space --json',
    '$ ably spaces locks get-all my-space --pretty-json']

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocksGetAll)
    
    let clients: SpacesClients | null = null
    
    try {
      // Create Spaces client
      clients = await this.createSpacesClient(flags)
      if (!clients) return

      const { realtimeClient, spacesClient } = clients
      const {spaceId} = args
      
      // Make sure we have a connection before proceeding
      await new Promise<void>((resolve, reject) => {
        const checkConnection = () => {
          const {state} = realtimeClient.connection;
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
      if (!this.shouldOutputJson(flags)) {
        this.log(`Fetching locks for space ${chalk.cyan(spaceId)}...`);
      }
      
      let locks: LockItem[] = [];
      try {
        const result = await space.locks.getAll();
        locks = Array.isArray(result) ? result : [];
        
        // Filter out invalid locks
        const validLocks = locks.filter((lock: LockItem) => {
          if (!lock || !lock.id) return false;
          return true;
        });
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            locks: validLocks.map(lock => ({
              attributes: lock.attributes || {},
              holder: lock.member?.clientId || null,
              id: lock.id,
              status: lock.status || 'unknown'
            })),
            spaceId,
            success: true,
            timestamp: new Date().toISOString()
          }, flags));
        } else if (!validLocks || validLocks.length === 0) {
            this.log(chalk.yellow('No locks are currently active in this space.'));
          } else {
            const lockCount = validLocks.length;
            this.log(`\n${chalk.cyan('Current locks')} (${chalk.bold(String(lockCount))}):\n`);
            
            validLocks.forEach((lock: LockItem) => {
              try {
                this.log(`- ${chalk.blue(lock.id)}:`);
                this.log(`  ${chalk.dim('Status:')} ${lock.status || 'unknown'}`);
                this.log(`  ${chalk.dim('Holder:')} ${lock.member?.clientId || 'None'}`);
                
                if (lock.attributes && Object.keys(lock.attributes).length > 0) {
                  this.log(`  ${chalk.dim('Attributes:')} ${JSON.stringify(lock.attributes, null, 2)}`);
                }
              } catch (error) {
                this.log(`- ${chalk.red('Error displaying lock item')}: ${error instanceof Error ? error.message : String(error)}`);
              }
            });
          }
      } catch (error) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            error: error instanceof Error ? error.message : String(error),
            spaceId: args.spaceId,
            status: 'error',
            success: false
          }, flags));
        } else {
          this.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      try {
        // Leave the space after fetching locks
        await space.leave();
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            spaceId,
            status: 'left',
            success: true
          }, flags));
        } else {
          this.log(chalk.green('\nSuccessfully disconnected.'));
        }
      } catch (error) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            error: error instanceof Error ? error.message : String(error),
            spaceId: args.spaceId,
            status: 'error',
            success: false
          }, flags));
        } else {
          this.log(chalk.yellow(`Error leaving space: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: error instanceof Error ? error.message : String(error),
          spaceId: args.spaceId,
          status: 'error',
          success: false
        }, flags));
      } else {
        this.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
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