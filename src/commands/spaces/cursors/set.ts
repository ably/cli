import Spaces from '@ably/spaces'
import { type Space } from '@ably/spaces'
import { Args, Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { SpacesBaseCommand } from '../../../spaces-base-command.js'

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
  data?: CursorData;
  position: CursorPosition;
}

export default class SpacesCursorsSet extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: 'Space ID to set cursor in',
      required: true,
    }),
  }

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
      default: false,
      description: 'Simulate cursor movements automatically',
      exclusive: ['position'],
    }),
  }

  private cleanupInProgress = false;
  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: Spaces | null = null;
  private space: Space | null = null;
  private simulationIntervalId: NodeJS.Timeout | null = null;

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.simulationIntervalId) {
        clearInterval(this.simulationIntervalId);
        this.simulationIntervalId = null;
     }

     if (this.realtimeClient && this.realtimeClient.connection.state !== 'closed' && this.realtimeClient.connection.state !== 'failed') {
           this.realtimeClient.close();
       }

     return super.finally(err);
   }

   async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesCursorsSet)
    const {spaceId} = args;

    try {
      // Create Spaces client using setupSpacesClient
      const setupResult = await this.setupSpacesClient(flags, spaceId);
      this.realtimeClient = setupResult.realtimeClient;
      this.spacesClient = setupResult.spacesClient;
      this.space = setupResult.space;
      if (!this.realtimeClient || !this.spacesClient || !this.space) {
         const errorMsg = 'Failed to create Spaces client';
         this.logCliEvent(flags, 'spaces', 'clientCreationFailed', errorMsg, { error: errorMsg, spaceId });
         if (this.shouldOutputJson(flags)) {
             this.log(this.formatJsonOutput({ error: errorMsg, spaceId, success: false }, flags));
         } // Error already logged by createSpacesClient

         return;
      }

      // Add listeners for connection state changes
      this.realtimeClient.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Parse position data if provided
      let positionData: CursorPosition | null = null;
      if (flags.position) {
        try {
          positionData = JSON.parse(flags.position)
           this.logCliEvent(flags, 'cursor', 'positionParsed', 'Cursor position parsed', { position: positionData });
        } catch (error) {
           const errorMsg = `Invalid position JSON: ${error instanceof Error ? error.message : String(error)}`;
           this.logCliEvent(flags, 'cursor', 'positionParseError', errorMsg, { error: errorMsg, spaceId });
           if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({ error: errorMsg, spaceId, success: false }, flags));
          } else {
            this.error(errorMsg);
          }

          return;
        }
      } else if (flags.simulate) {
        // Use initial random position if simulating
        positionData = {
          x: Math.floor(Math.random() * 1000),
          y: Math.floor(Math.random() * 1000)
        }
        this.logCliEvent(flags, 'cursor', 'simulationStartPos', 'Generated initial position for simulation', { position: positionData });
      } else {
         const errorMsg = 'Either --position or --simulate must be specified';
         this.logCliEvent(flags, 'cursor', 'inputError', errorMsg, { spaceId });
         if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ error: errorMsg, spaceId, success: false }, flags));
        } else {
          this.error(errorMsg);
        }

        return;
      }

      // Ensure positionData is not null before proceeding
      if (!positionData) {
         this.logCliEvent(flags, 'cursor', 'positionMissing', 'Position data is missing after parsing/generation', { spaceId });
         this.error('Internal error: Cursor position data is missing.');
         return;
      }

      // Make sure we have a connection before proceeding
      this.logCliEvent(flags, 'connection', 'waiting', 'Waiting for connection to establish...');
      await new Promise<void>((resolve, reject) => {
        const checkConnection = () => {
          const {state} = this.realtimeClient!.connection;
          if (state === 'connected') {
             this.logCliEvent(flags, 'connection', 'connected', 'Realtime connection established.');
            resolve();
          } else if (state === 'failed' || state === 'closed' || state === 'suspended') {
             const errorMsg = `Connection failed with state: ${state}`;
             this.logCliEvent(flags, 'connection', 'failed', errorMsg, { state });
            reject(new Error(errorMsg));
          } else {
            // Still connecting, check again shortly
            setTimeout(checkConnection, 100);
          }
        };

        checkConnection();
      });

      // Get the space
      this.logCliEvent(flags, 'spaces', 'gettingSpace', `Getting space: ${spaceId}...`);
      if (!this.shouldOutputJson(flags)) {
        this.log(`Connecting to space: ${chalk.cyan(spaceId)}...`);
      }

      this.logCliEvent(flags, 'spaces', 'gotSpace', `Successfully got space handle: ${spaceId}`);

      // Enter the space first
      this.logCliEvent(flags, 'spaces', 'entering', 'Entering space...');
      await this.space.enter()
      this.logCliEvent(flags, 'spaces', 'entered', 'Successfully entered space', { clientId: this.realtimeClient!.auth.clientId });

      // Set the initial cursor position
      this.logCliEvent(flags, 'cursor', 'settingInitial', 'Setting initial cursor position', { position: positionData });
      const cursorUpdate: CursorUpdate = { position: positionData };
      await this.space.cursors.set(cursorUpdate);
      const initialSetEventData = {
          cursor: { position: positionData },
          spaceId,
          type: 'cursor_set_initial'
      };
      this.logCliEvent(flags, 'cursor', 'setInitialSuccess', 'Successfully set initial cursor position', initialSetEventData);

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ success: true, timestamp: new Date().toISOString(), ...initialSetEventData }, flags));
      } else {
        this.log(`${chalk.green('Successfully set cursor position:')} ${JSON.stringify(positionData)}`);
      }

      // If simulating, start moving the cursor randomly
      if (flags.simulate) {
          this.logCliEvent(flags, 'cursor', 'simulationStarting', 'Starting cursor movement simulation');
          if (this.shouldOutputJson(flags)) {
            // Event logged above
          } else {
            this.log('\nSimulating cursor movements. Press Ctrl+C to exit.\n');
          }

        // Start simulation
        this.simulationIntervalId = setInterval(async () => {
          try {
            if (!this.cleanupInProgress) {
              const newPosition = {
                x: Math.floor(Math.random() * 1000),
                y: Math.floor(Math.random() * 1000)
              };
              const updateData: CursorUpdate = { position: newPosition };
              this.logCliEvent(flags, 'cursor', 'simulationUpdateAttempt', 'Simulating cursor move', { position: newPosition });

              await this.space!.cursors.set(updateData);
              const updateEventData = {
                  cursor: { position: newPosition },
                  spaceId,
                  type: 'cursor_update_simulated'
              };
              this.logCliEvent(flags, 'cursor', 'simulationUpdateSuccess', 'Cursor position updated (simulation)', updateEventData);

              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({ success: true, timestamp: new Date().toISOString(), ...updateEventData }, flags));
              } else {
                this.log(`Cursor moved to: ${JSON.stringify(newPosition)}`);
              }
            }
          } catch (error) {
             const errorMsg = error instanceof Error ? error.message : String(error);
             this.logCliEvent(flags, 'cursor', 'simulationUpdateError', `Error updating cursor during simulation: ${errorMsg}`, { error: errorMsg });
             if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({ error: errorMsg, spaceId, status: 'error', success: false, type: 'simulation_error' }, flags));
            } else {
              this.error(`Error updating cursor: ${errorMsg}`);
            }
          }
        }, 1000);
      } else {
          this.logCliEvent(flags, 'cursor', 'listening', 'Cursor position set. Simulating movement if enabled. Press Ctrl+C to exit.');
           if (!this.shouldOutputJson(flags)) {
               this.log('\nMaintaining cursor position. Press Ctrl+C to exit.\n');
           }
      }

      // Set up cleanup for both simulation and regular modes
      const cleanup = async () => {
        if (this.cleanupInProgress) return;
        this.cleanupInProgress = true;
        this.logCliEvent(flags, 'cursor', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');

        if (this.simulationIntervalId) {
          this.logCliEvent(flags, 'cursor', 'stoppingSimulation', 'Stopping cursor simulation interval');
          clearInterval(this.simulationIntervalId);
          this.simulationIntervalId = null;
        }

        const forceExitTimeout = setTimeout(() => {
            this.logCliEvent(flags, 'cursor', 'forceExit', 'Force exiting after timeout during cleanup', { spaceId });
            if (!this.shouldOutputJson(flags)) {
               this.log(chalk.red('Force exiting after timeout...'));
            }

            // Clean up interval and connection forcefully if needed
            if (this.simulationIntervalId) clearInterval(this.simulationIntervalId);
            if (this.realtimeClient && this.realtimeClient.connection.state !== 'closed') this.realtimeClient.close();
             
            process.exit(1);
        }, 5000);

        // Leave the space
        try {
          if (this.space) {
            this.logCliEvent(flags, 'spaces', 'leaving', 'Leaving space');
            await this.space.leave()
            this.logCliEvent(flags, 'spaces', 'left', 'Successfully left space');
          }
        } catch (error) {
           const errorMsg = error instanceof Error ? error.message : String(error);
           this.logCliEvent(flags, 'spaces', 'leaveError', `Error leaving space: ${errorMsg}`, { error: errorMsg });
           // Don't prevent closing connection
        }

        // Close connection
        try {
          if (this.realtimeClient) {
            this.logCliEvent(flags, 'connection', 'closing', 'Closing connection');
            this.realtimeClient.close();
            this.logCliEvent(flags, 'connection', 'closed', 'Connection closed');
          }
        } catch (error) {
           const errorMsg = error instanceof Error ? error.message : String(error);
           this.logCliEvent(flags, 'connection', 'closeError', `Error closing connection: ${errorMsg}`, { error: errorMsg });
        }

        clearTimeout(forceExitTimeout);
         
        process.exit(0);
      };

      process.on('SIGINT', () => void cleanup())
      process.on('SIGTERM', () => void cleanup())

       // Keep the process running until interrupted
       await new Promise<void>(_resolve => { /* Keep process alive */ });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, 'cursor', 'fatalError', `Error setting cursor: ${errorMsg}`, { error: errorMsg, spaceId });
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ error: errorMsg, spaceId, status: 'error', success: false }, flags));
      } else {
        this.error(`Error: ${errorMsg}`);
      }

      // Clean up on error
      if (this.realtimeClient) {
        this.realtimeClient.close();
      }
    }
  }
} 