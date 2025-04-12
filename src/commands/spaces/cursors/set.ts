import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
import * as Ably from 'ably'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

// Define cursor types based on Ably documentation
interface CursorPosition {
  x: number;
  y: number;
}

interface CursorData {
  [key: string]: any;
}

// Update interfaces to match SDK expectations
interface CursorUpdate {
  position: CursorPosition;
  data?: CursorData;
}

export default class SpacesCursorsSet extends SpacesBaseCommand {
  static override description = 'Set your cursor position in a space'

  static override examples = [
    '$ ably spaces cursors set my-space --position \'{"x":100,"y":150}\'',
    '$ ably spaces cursors set my-space --simulate',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    position: Flags.string({
      description: 'Cursor position data to set (JSON format)',
      exclusive: ['simulate'],
    }),
    simulate: Flags.boolean({
      description: 'Simulate cursor movements automatically',
      exclusive: ['position'],
      default: false,
    }),
  }

  static override args = {
    spaceId: Args.string({
      description: 'Space ID to set cursor in',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesCursorsSet)
    
    let clients: SpacesClients | null = null
    let simulationInterval: NodeJS.Timeout | null = null
    let cleanupInProgress = false
    
    try {
      // Create Spaces client
      clients = await this.createSpacesClient(flags)
      if (!clients) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            error: 'Failed to create Spaces client',
            status: 'error',
            spaceId: args.spaceId
          }, flags));
        }
        return;
      }

      const { spacesClient, realtimeClient } = clients
      const spaceId = args.spaceId
      
      // Parse position data if provided
      let positionData: CursorPosition
      if (flags.position) {
        try {
          positionData = JSON.parse(flags.position)
        } catch (error) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              error: `Invalid position JSON: ${error instanceof Error ? error.message : String(error)}`,
              status: 'error',
              spaceId
            }, flags));
          } else {
            this.error(`Invalid position JSON: ${error instanceof Error ? error.message : String(error)}`);
          }
          return;
        }
      } else if (flags.simulate) {
        // Use initial random position if simulating
        positionData = {
          x: Math.floor(Math.random() * 1000),
          y: Math.floor(Math.random() * 1000)
        }
      } else {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            error: 'Either --position or --simulate must be specified',
            status: 'error',
            spaceId
          }, flags));
        } else {
          this.error('Either --position or --simulate must be specified');
        }
        return;
      }
      
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
      
      // Enter the space first
      await space.enter()
      
      // Wait for space to be properly entered before setting cursor
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
                  timestamp: new Date().toISOString(),
                  status: 'connected',
                  spaceId,
                  connectionId: realtimeClient.connection.id
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
      
      // Set the initial cursor position
      // Create update object with position property as required by the API
      const cursorUpdate: CursorUpdate = { position: positionData };
      await space.cursors.set(cursorUpdate);
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: true,
          timestamp: new Date().toISOString(),
          spaceId,
          type: 'cursor_set',
          cursor: {
            position: positionData
          }
        }, flags));
      } else {
        this.log(`${chalk.green('Successfully set cursor position:')} ${JSON.stringify(positionData)}`);
      }
      
      // If simulating, start moving the cursor randomly
      if (flags.simulate) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp: new Date().toISOString(),
            spaceId,
            type: 'simulation_started',
            message: 'Starting cursor movement simulation'
          }, flags));
        } else {
          this.log('\nSimulating cursor movements. Press Ctrl+C to exit.\n');
        }
        
        // Start simulation
        simulationInterval = setInterval(async () => {
          try {
            if (!cleanupInProgress) {
              const newPosition = {
                x: Math.floor(Math.random() * 1000),
                y: Math.floor(Math.random() * 1000)
              };
              
              await space.cursors.set({ position: newPosition });
              
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  timestamp: new Date().toISOString(),
                  spaceId,
                  type: 'cursor_update',
                  cursor: {
                    position: newPosition
                  }
                }, flags));
              } else {
                this.log(`Cursor moved to: ${JSON.stringify(newPosition)}`);
              }
            }
          } catch (error) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                status: 'error',
                spaceId,
                type: 'simulation_error'
              }, flags));
            } else {
              this.error(`Error updating cursor: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }, 1000);
      }
      
      // Set up cleanup for both simulation and regular modes
      const cleanup = async () => {
        if (cleanupInProgress) return;
        cleanupInProgress = true;
        
        if (simulationInterval) {
          clearInterval(simulationInterval);
        }
        
        if (space) {
          try {
            await space.leave();
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: true,
                timestamp: new Date().toISOString(),
                spaceId,
                type: 'cleanup',
                status: 'completed'
              }, flags));
            }
          } catch (error) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                status: 'error',
                spaceId,
                type: 'cleanup_error'
              }, flags));
            }
          }
        }
        
        if (realtimeClient) {
          realtimeClient.close();
        }
        
        process.exit();
      };
      
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          status: 'error',
          spaceId: args.spaceId
        }, flags));
      } else {
        this.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Clean up on error
      if (clients?.realtimeClient) {
        clients.realtimeClient.close();
      }
    }
  }
} 