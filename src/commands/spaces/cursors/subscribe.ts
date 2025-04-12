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
    '$ ably spaces cursors subscribe my-space --json',
    '$ ably spaces cursors subscribe my-space --pretty-json']

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    
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
      if (!this.shouldOutputJson(flags)) {
        this.log(`Connecting to space: ${chalk.cyan(spaceId)}...`);
      }
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
      if (!this.shouldOutputJson(flags)) {
        this.log(`\n${chalk.dim('Subscribing to cursor movements. Press Ctrl+C to exit.')}\n`)
      }
      
      try {
        subscription = await space.cursors.subscribe('update', (cursorUpdate: any) => {
          try {
            const timestamp = new Date().toISOString();
            
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: true,
                spaceId,
                type: 'cursor_update',
                timestamp,
                member: {
                  clientId: cursorUpdate.clientId,
                  connectionId: cursorUpdate.connectionId
                },
                position: cursorUpdate.position
              }, flags));
            } else {
              this.log(`[${timestamp}] ${chalk.blue(cursorUpdate.clientId)} ${chalk.dim('position:')} ${JSON.stringify(cursorUpdate.position)}`);
            }
          } catch (error) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                spaceId,
                error: `Error processing cursor update: ${error instanceof Error ? error.message : String(error)}`,
                status: 'error'
              }, flags));
            } else {
              this.log(chalk.red(`Error processing cursor update: ${error instanceof Error ? error.message : String(error)}`));
            }
          }
        });
      } catch (error) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            spaceId,
            error: `Error subscribing to cursor updates: ${error instanceof Error ? error.message : String(error)}`,
            status: 'error'
          }, flags));
        } else {
          this.log(chalk.red(`Error subscribing to cursor updates: ${error instanceof Error ? error.message : String(error)}`));
          this.log(chalk.yellow('Will continue running, but may not receive cursor updates.'));
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
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                spaceId,
                error: 'Force exiting after timeout',
                status: 'disconnected'
              }, flags));
            } else {
              this.log(chalk.red('Force exiting after timeout...'));
            }
            process.exit(1);
          }, 5000);
          
          try {
            // Unsubscribe from cursor events
            if (subscription) {
              try {
                subscription.unsubscribe();
                if (this.shouldOutputJson(flags)) {
                  this.log(this.formatJsonOutput({
                    success: true,
                    spaceId,
                    status: 'unsubscribed'
                  }, flags));
                } else {
                  this.log(chalk.green('Successfully unsubscribed from cursor events.'));
                }
              } catch (error) {
                if (this.shouldOutputJson(flags)) {
                  this.log(this.formatJsonOutput({
                    success: false,
                    spaceId,
                    error: `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`,
                    status: 'error'
                  }, flags));
                } else {
                  this.log(`Note: ${error instanceof Error ? error.message : String(error)}`);
                  this.log('Continuing with cleanup.');
                }
              }
            }
            
            try {
              // Leave the space
              await space.leave();
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  spaceId,
                  status: 'left'
                }, flags));
              } else {
                this.log(chalk.green('Successfully left the space.'));
              }
            } catch (error) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: false,
                  spaceId,
                  error: `Error leaving space: ${error instanceof Error ? error.message : String(error)}`,
                  status: 'error'
                }, flags));
              } else {
                this.log(`Error leaving space: ${error instanceof Error ? error.message : String(error)}`);
                this.log('Continuing with cleanup.');
              }
            }
            
            try {
              if (clients?.realtimeClient) {
                clients.realtimeClient.close();
                if (this.shouldOutputJson(flags)) {
                  this.log(this.formatJsonOutput({
                    success: true,
                    spaceId,
                    status: 'disconnected'
                  }, flags));
                } else {
                  this.log(chalk.green('Successfully closed connection.'));
                }
              }
            } catch (error) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: false,
                  spaceId,
                  error: `Error closing client: ${error instanceof Error ? error.message : String(error)}`,
                  status: 'error'
                }, flags));
              } else {
                this.log(`Error closing client: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
            
            clearTimeout(forceExitTimeout);
            resolve();
            // Force exit after cleanup
            process.exit(0);
          } catch (error) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                spaceId,
                error: `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`,
                status: 'error'
              }, flags));
            } else {
              this.log(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`);
            }
            clearTimeout(forceExitTimeout);
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
        this.error(`Failed to subscribe to cursors: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
} 