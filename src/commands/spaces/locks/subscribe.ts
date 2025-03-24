import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
import * as Ably from 'ably'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

export default class SpacesLocksSubscribe extends SpacesBaseCommand {
  static override description = 'Subscribe to lock changes in a space'

  static override examples = [
    '$ ably spaces locks subscribe my-space',
    '$ ably spaces locks subscribe my-space --format json',
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
      description: 'Space ID to subscribe for locks from',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocksSubscribe)

    // Setup clean up when process is interrupted
    const cleanup = async (clients: SpacesClients | null, space: any | null = null) => {
      if (space) {
        try {
          await space.leave();
          this.log(chalk.green('\nSuccessfully disconnected from space.'));
        } catch (error) {
          this.log(chalk.yellow(`Error leaving space: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      if (clients?.realtimeClient) {
        try {
          clients.realtimeClient.close();
        } catch (error) {
          this.log(chalk.yellow(`Error closing connection: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      process.exit(0);
    };

    process.on('SIGINT', async () => {
      this.log(chalk.yellow('\nReceived SIGINT. Cleaning up...'));
      await cleanup(null);
    });

    let clients: SpacesClients | null = null;
    let space: any = null;

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
      space = await spacesClient.get(spaceId)

      // Enter the space to subscribe
      await space.enter()

      // Wait for space to be properly entered before getting locks
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

      this.log(chalk.cyan(`\nSubscribing to locks in space: ${spaceId}`))

      // Get all current locks first
      this.log(`\n${chalk.cyan('Fetching current locks')}...`)
      
      let locks: any[] = [];
      try {
        // Make sure to handle the return value correctly
        const result = await space.locks.getAll();
        
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
        
        // Output current locks based on format
        if (flags.format === 'json') {
          this.log(JSON.stringify(locks, null, 2))
        } else {
          if (!validLocks || validLocks.length === 0) {
            this.log(chalk.yellow('No locks are currently active in this space.'))
          } else {
            const lockCount = validLocks.length;
            this.log(`${chalk.cyan('Current locks')} (${chalk.bold(String(lockCount))}):\n`)
            
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

      // Subscribe to lock changes
      this.log(chalk.cyan('\nListening for lock changes (Press Ctrl+C to exit)...\n'));

      // Handle lock acquired events
      space.locks.subscribe('update', (lock: any) => {
        if (!lock || !lock.id) {
          // Skip invalid locks
          return;
        }
        
        if (flags.format === 'json') {
          this.log(JSON.stringify({
            event: lock.status,
            lock,
            timestamp: new Date().toISOString(),
          }, null, 2));
        } else {
          this.log(`${lock.status === 'locked' ? chalk.green('✓') : chalk.red('✗')} ${chalk.cyan('Lock ' + lock.status + ':')} ${chalk.blue(lock.id)}`);
          this.log(`  ${chalk.dim('Status:')} ${lock.status || 'unknown'}`);
          this.log(`  ${chalk.dim('ID:')} ${lock.id || 'None'}`);
          this.log(`  ${chalk.dim('clientId:')} ${lock.member?.clientId || 'None'}`);
          this.log(`  ${chalk.dim('Attributes:')} ${JSON.stringify(lock.attributes) || 'None'}`);
        }
      });

      // Setup clean up when process is interrupted with the space included
      process.on('SIGINT', async () => {
        this.log(chalk.yellow('\nReceived SIGINT. Cleaning up...'));
        await cleanup(clients, space);
      });

      // Keep the process running until interrupted
      // eslint-disable-next-line no-constant-condition
      await new Promise<void>((resolve) => {
        // This promise intentionally never resolves
      });
    } catch (error) {
      if (error === undefined || error === null) {
        this.log(chalk.red('An unknown error occurred (error object is undefined or null)'));
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
        this.log(chalk.red(`Error: ${errorMessage}`));
      }
      
      // Clean up before exiting
      await cleanup(clients, space);
      process.exit(1);
    }
  }
} 