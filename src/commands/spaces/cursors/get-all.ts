import Spaces from '@ably/spaces'
import { Args } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { SpacesBaseCommand } from '../../../spaces-base-command.js'

interface SpacesClients {
  realtimeClient: Ably.Realtime;
  spacesClient: Spaces;
}

interface CursorPosition {
  x: number;
  y: number;
}

interface CursorUpdate {
  clientId?: string;
  connectionId?: string;
  data?: Record<string, unknown>;
  position: CursorPosition;
}

export default class SpacesCursorsGetAll extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: 'Space ID to get cursors from',
      required: true,
    }),
  }

  static override description = 'Get all current cursors in a space'

  static override examples = [
    '$ ably spaces cursors get-all my-space',
    '$ ably spaces cursors get-all my-space --json',
    '$ ably spaces cursors get-all my-space --pretty-json'
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesCursorsGetAll)
    
    let clients: SpacesClients | null = null
    let cleanupInProgress = false
    
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
                  connectionId: realtimeClient.connection.id,
                  spaceId,
                  status: 'connected',
                  success: true,
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
      
      // Get all cursors
      const cursors = await space.cursors.getAll()
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          cursors: Array.isArray(cursors) ? cursors.map((cursor: CursorUpdate) => ({
            clientId: cursor.clientId,
            connectionId: cursor.connectionId,
            data: cursor.data,
            position: cursor.position
          })) : [],
          spaceId,
          success: true
        }, flags));
      } else {
        if (!Array.isArray(cursors) || cursors.length === 0) {
          this.log('No cursors found in space.');
          return;
        }
        
        this.log('Current cursors in space:');
        cursors.forEach((cursor: CursorUpdate) => {
          this.log(`\nClient: ${chalk.blue(cursor.clientId || 'Unknown')}`);
          this.log(`Connection: ${chalk.dim(cursor.connectionId || 'Unknown')}`);
          this.log(`Position: ${JSON.stringify(cursor.position)}`);
          if (cursor.data) {
            this.log(`Data: ${JSON.stringify(cursor.data)}`);
          }
        });
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: `Error getting cursors: ${error instanceof Error ? error.message : String(error)}`,
          spaceId: args.spaceId,
          status: 'error',
          success: false
        }, flags));
      } else {
        this.log(chalk.red(`Error getting cursors: ${error instanceof Error ? error.message : String(error)}`));
      }
    } finally {
      if (!cleanupInProgress) {
        cleanupInProgress = true;
        try {
          if (clients) {
            const { realtimeClient, spacesClient } = clients;
            const space = await spacesClient.get(args.spaceId);
            await space.leave();
            realtimeClient.close();
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
} 