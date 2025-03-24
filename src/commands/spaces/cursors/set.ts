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

interface CursorRemove {
  position: null;
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
    'format': Flags.string({
      description: 'Output format',
      options: ['json', 'pretty'],
      default: 'pretty',
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
      if (!clients) return

      const { spacesClient, realtimeClient } = clients
      const spaceId = args.spaceId
      
      // Parse position data if provided
      let positionData: CursorPosition
      if (flags.position) {
        try {
          positionData = JSON.parse(flags.position)
        } catch (error) {
          this.error(`Invalid position JSON: ${error instanceof Error ? error.message : String(error)}`)
        }
      } else if (flags.simulate) {
        // Use initial random position if simulating
        positionData = {
          x: Math.floor(Math.random() * 1000),
          y: Math.floor(Math.random() * 1000)
        }
      } else {
        this.error('Either --position or --simulate must be specified')
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
      this.log(`Connecting to space: ${chalk.cyan(spaceId)}...`);
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
      
      // Set the initial cursor position
      // Create update object with position property as required by the API
      const cursorUpdate: CursorUpdate = { position: positionData };
      await space.cursors.set(cursorUpdate);
      this.log(`${chalk.green('Set initial cursor position:')} ${JSON.stringify(positionData, null, 2)}`)
      
      // If simulating, start movement simulation
      if (flags.simulate) {
        this.log(`\n${chalk.dim('Simulating cursor movements. Press Ctrl+C to exit.')}\n`)
        
        // Update cursor position randomly every 2 seconds
        simulationInterval = setInterval(async () => {
          try {
            // Simulate random movement
            const newPosition: CursorPosition = {
              x: Math.floor(Math.random() * 1000),
              y: Math.floor(Math.random() * 1000)
            }
            
            // Create update object with position property
            const cursorUpdate: CursorUpdate = { position: newPosition };
            await space.cursors.set(cursorUpdate);
            
            if (flags.format === 'json') {
              this.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                action: 'update',
                position: newPosition
              }, null, 2))
            } else {
              this.log(`${chalk.yellow('Updated cursor position:')} ${JSON.stringify(newPosition, null, 2)}`)
            }
          } catch (error) {
            this.log(`Error updating cursor: ${error instanceof Error ? error.message : String(error)}`)
          }
        }, 2000)
      } else {
        this.log(`\n${chalk.dim('Cursor position set. Press Ctrl+C to exit.')}\n`)
      }

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          if (cleanupInProgress) return
          cleanupInProgress = true
          
          this.log(`\n${chalk.yellow('Cleaning up and closing connection...')}`)
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            this.log(chalk.red('Force exiting after timeout...'))
            process.exit(1)
          }, 5000)
          
          try {
            // Stop simulation if running
            if (simulationInterval) {
              clearInterval(simulationInterval)
            }
            
            try {
              // Use raw object to clear cursor (set to null)
              await space.cursors.set({ position: null } as any);
              this.log(chalk.green('Successfully removed cursor.'))
              
              // Leave the space
              await space.leave()
              this.log(chalk.green('Successfully left the space.'))
            } catch (error) {
              this.log(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`)
              this.log('Continuing with cleanup.')
            }
            
            if (clients?.realtimeClient) {
              clients.realtimeClient.close()
              this.log(chalk.green('Successfully closed realtime connection.'))
            }
            
            this.log(chalk.green('Successfully disconnected.'))
            clearTimeout(forceExitTimeout)
            resolve()
            // Force exit after cleanup
            process.exit(0)
          } catch (error) {
            this.log(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`)
            clearTimeout(forceExitTimeout)
            process.exit(1)
          }
        }

        process.once('SIGINT', () => void cleanup())
        process.once('SIGTERM', () => void cleanup())
      })
    } catch (error) {
      if (error === undefined || error === null) {
        this.log(chalk.red('An unknown error occurred (error object is undefined or null)'))
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error')
        this.log(chalk.red(`Error: ${errorMessage}`))
      }
      process.exit(1)
    } finally {
      // Clean up the interval if it's still running
      if (simulationInterval) {
        clearInterval(simulationInterval)
      }
      
      try {
        if (clients?.realtimeClient) {
          clients.realtimeClient.close()
        }
      } catch (closeError) {
        // Just log, don't throw
        this.log(chalk.yellow(`Error closing client: ${closeError instanceof Error ? closeError.message : String(closeError)}`))
      }
    }
  }
} 