import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
import * as Ably from 'ably'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

export default class SpacesCursorsSubscribe extends SpacesBaseCommand {
  static override description = 'Subscribe to cursor movements in a space'

  static override examples = [
    '$ ably spaces cursors subscribe my-space',
    '$ ably spaces cursors subscribe my-space --format json',
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
      description: 'Space ID to subscribe to cursors for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesCursorsSubscribe)
    
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
      const space = await spacesClient.get(spaceId)
      
      // Enter the space
      await space.enter()
      
      // Wait for space to be properly entered before fetching cursors
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
              this.log(`${chalk.green('Successfully entered space:')} ${chalk.cyan(spaceId)}`);
              resolve();
            } else if (realtimeClient.connection.state === 'failed' || 
                      realtimeClient.connection.state === 'closed' || 
                      realtimeClient.connection.state === 'suspended') {
              clearTimeout(timeout);
              reject(new Error(`Space connection failed with state: ${realtimeClient.connection.state}`));
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
      
      // Subscribe to cursor updates
      this.log(`\n${chalk.dim('Subscribing to cursor movements. Press Ctrl+C to exit.')}\n`)
      
      // Store original colors for cursor positions to detect changes
      const memberColors: Record<string, string> = {}
      
      try {
        subscription = await space.cursors.subscribe('update', (cursorUpdate: any) => {
          try {
            const timestamp = new Date().toISOString();
            
            // Extract cursor position data first to check if we should process this update
            const position = cursorUpdate?.position;
            
            if (flags.format === 'json') {
              const jsonOutput = {
                timestamp,
                member: {
                  clientId: cursorUpdate.clientId,
                  connectionId: cursorUpdate.connectionId
                },
                position
              };
              this.log(JSON.stringify(jsonOutput));
            } else {
              this.log(`[${timestamp}] ${chalk.blue(cursorUpdate.clientId)} ${chalk.dim('position:')} ${JSON.stringify(position)}`);
            }
          } catch (error) {
            this.log(chalk.red(`Error processing cursor update: ${error instanceof Error ? error.message : String(error)}`));
          }
        });
      } catch (error) {
        this.log(chalk.red(`Error subscribing to cursor updates: ${error instanceof Error ? error.message : String(error)}`));
        this.log(chalk.yellow('Will continue running, but may not receive cursor updates.'));
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
            // Unsubscribe from cursor events
            if (subscription) {
              try {
                subscription.unsubscribe();
                this.log(chalk.green('Successfully unsubscribed from cursor events.'));
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