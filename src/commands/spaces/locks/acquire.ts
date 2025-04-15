import Spaces, { Space } from '@ably/spaces'
import { Args, Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { SpacesBaseCommand } from '../../../spaces-base-command.js'

interface SpacesClients {
  realtimeClient: Ably.Realtime;
  spacesClient: Spaces;
}

export default class SpacesLocksAcquire extends SpacesBaseCommand {
  static override args = {

    spaceId: Args.string({
      description: 'Space ID to acquire lock in',
      required: true,
    }),
    lockId: Args.string({
      description: 'ID of the lock to acquire',
      required: true,
    }),
  }

  static override description = 'Acquire a lock in a space'

  static override examples = [
    '$ ably spaces locks acquire my-space my-lock-id',
    '$ ably spaces locks acquire my-space my-lock-id --data \'{"type":"editor"}\'',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    data: Flags.string({
      description: 'Optional data to associate with the lock (JSON format)',
      required: false,
    }),
    
  }

  private cleanupInProgress = false;
  private clients: SpacesClients | null = null;
  private lockId: null | string = null;
  private space: Space | null = null;

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
       // Attempt to release lock and leave space if not already done
       if (!this.cleanupInProgress && this.space && this.lockId) { // Check if space and lockId are available
           try {
              this.logCliEvent({}, 'lock', 'finalReleaseAttempt', 'Attempting final lock release', { lockId: this.lockId });
              await this.space.locks.release(this.lockId);
           } catch (error) { this.logCliEvent({}, 'lock', 'finalReleaseError', 'Error in final lock release', { error: error instanceof Error ? error.message : String(error), lockId: this.lockId }); }

           try {
              this.logCliEvent({}, 'spaces', 'finalLeaveAttempt', 'Attempting final space leave');
              await this.space.leave();
           } catch (error) { this.logCliEvent({}, 'spaces', 'finalLeaveError', 'Error in final space leave', { error: error instanceof Error ? error.message : String(error) });}
       }

       if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed' && this.clients.realtimeClient.connection.state !== 'failed') {
             this.clients.realtimeClient.close();
         }

       return super.finally(err);
   }

   async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocksAcquire)
    const {spaceId} = args;
    this.lockId = args.lockId;
    const {lockId} = this;

    try {
      // Create Spaces client
      this.clients = await this.createSpacesClient(flags)
      if (!this.clients) return

      const { realtimeClient, spacesClient } = this.clients

      // Add listeners for connection state changes
      realtimeClient.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Parse lock data if provided
      let lockData: any
      if (flags.data) {
        try {
          lockData = JSON.parse(flags.data)
          this.logCliEvent(flags, 'lock', 'dataParsed', 'Lock data parsed successfully', { data: lockData });
        } catch (error) {
            const errorMsg = `Invalid lock data JSON: ${error instanceof Error ? error.message : String(error)}`;
            this.logCliEvent(flags, 'lock', 'dataParseError', errorMsg, { error: errorMsg });
            this.error(errorMsg);
            return;
        }
      }

      // Get the space
      this.logCliEvent(flags, 'spaces', 'gettingSpace', `Getting space: ${spaceId}...`);
      this.space = await spacesClient.get(spaceId)
      const {space} = this; // Local const
      this.logCliEvent(flags, 'spaces', 'gotSpace', `Successfully got space handle: ${spaceId}`);

      // Enter the space first
      this.logCliEvent(flags, 'spaces', 'entering', 'Entering space...');
      await space.enter()
      this.logCliEvent(flags, 'spaces', 'entered', 'Successfully entered space', { clientId: realtimeClient.auth.clientId });

      // Try to acquire the lock
      try {
        this.logCliEvent(flags, 'lock', 'acquiring', `Attempting to acquire lock: ${lockId}`, { data: lockData, lockId });
        const lock = await space.locks.acquire(lockId, lockData)
        const lockDetails = {
            lockId: lock.id,
            member: lock.member ? { clientId: lock.member.clientId, connectionId: lock.member.connectionId } : null,
            reason: lock.reason,
            status: lock.status,
            timestamp: lock.timestamp,
        };
        this.logCliEvent(flags, 'lock', 'acquired', `Successfully acquired lock: ${lockId}`, lockDetails);

        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ lock: lockDetails, success: true }, flags))
        } else {
           this.log(`${chalk.green('Successfully acquired lock:')} ${chalk.cyan(lockId)}`);
           this.log(`${chalk.dim('Lock details:')} ${this.formatJsonOutput(lockDetails, { ...flags, 'pretty-json': true })}`);
           this.log(`\n${chalk.dim('Holding lock. Press Ctrl+C to release and exit.')}`);
        }
      } catch (error) {
         const errorMsg = `Failed to acquire lock: ${error instanceof Error ? error.message : String(error)}`;
         this.logCliEvent(flags, 'lock', 'acquireFailed', errorMsg, { error: errorMsg, lockId });
         if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({ error: errorMsg, lockId, success: false }, flags));
         } else {
             this.error(errorMsg);
         }

         return; // Exit if lock acquisition fails
      }

      this.logCliEvent(flags, 'lock', 'holding', `Holding lock ${lockId}. Press Ctrl+C to release.`);
      // Keep the process running until interrupted
      await new Promise<void>((resolve, reject) => {
        const cleanup = async () => {
          if (this.cleanupInProgress) return
          this.cleanupInProgress = true
          this.logCliEvent(flags, 'lock', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');

          if (!this.shouldOutputJson(flags)) {
             this.log(`\n${chalk.yellow('Releasing lock and closing connection...')}`);
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
             const errorMsg = 'Force exiting after timeout during cleanup';
             this.logCliEvent(flags, 'lock', 'forceExit', errorMsg, { lockId, spaceId });
             if (!this.shouldOutputJson(flags)) {
                this.log(chalk.red('Force exiting after timeout...'));
             }

            this.exit(1); // Use oclif's exit method instead of process.exit
          }, 5000);

          try {
            if (space) {
                try {
                  // Release the lock
                  this.logCliEvent(flags, 'lock', 'releasing', `Releasing lock ${lockId}`);
                  await space.locks.release(lockId)
                  this.logCliEvent(flags, 'lock', 'released', `Successfully released lock ${lockId}`);
                  if (!this.shouldOutputJson(flags)) {
                     this.log(chalk.green('Successfully released lock.'));
                  }

                  // Leave the space
                  this.logCliEvent(flags, 'spaces', 'leaving', 'Leaving space...');
                  await space.leave();
                  this.logCliEvent(flags, 'spaces', 'left', 'Successfully left space');
                  if (!this.shouldOutputJson(flags)) {
                      this.log(chalk.green('Successfully left the space.'));
                  }
                } catch (error) {
                   const errorMsg = `Error during lock release/leave: ${error instanceof Error ? error.message : String(error)}`;
                   this.logCliEvent(flags, 'lock', 'cleanupReleaseError', errorMsg, { error: errorMsg });
                   if (!this.shouldOutputJson(flags)) {
                      this.log(`Error during cleanup: ${errorMsg}`);
                   }
                }
            }

            if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed') {
               this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
               this.clients.realtimeClient.close();
               this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed');
            }

            this.logCliEvent(flags, 'lock', 'cleanupComplete', 'Cleanup complete');
            if (!this.shouldOutputJson(flags)) {
               this.log(chalk.green('Successfully disconnected.'));
            }

            clearTimeout(forceExitTimeout);
            resolve();
            // The command will naturally end after the promise resolves
          } catch (error) {
             const errorMsg = `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`;
             this.logCliEvent(flags, 'lock', 'cleanupError', errorMsg, { error: errorMsg });
             if (!this.shouldOutputJson(flags)) {
                this.log(`Error during cleanup: ${errorMsg}`);
             }
          }
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
      });
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
    }
  }
}