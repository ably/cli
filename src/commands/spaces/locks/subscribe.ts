import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces, { Space, Lock } from '@ably/spaces'
import * as Ably from 'ably'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

export default class SpacesLocksSubscribe extends SpacesBaseCommand {
  static override description = 'Subscribe to lock changes in a space'

  static override examples = [
    '$ ably spaces locks subscribe my-space',
    '$ ably spaces locks subscribe my-space --json',
    '$ ably spaces locks subscribe my-space --pretty-json']

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    
  }

  static override args = {
    spaceId: Args.string({
      description: 'Space ID to subscribe for locks from',
      required: true,
    }),
  }

  private clients: SpacesClients | null = null;
  private subscription: any = null;
  private cleanupInProgress = false;
  private space: Space | null = null;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocksSubscribe)
    const spaceId = args.spaceId;

    try {
      // Create Spaces client
      this.clients = await this.createSpacesClient(flags)
      if (!this.clients) return

      const { spacesClient, realtimeClient } = this.clients

      // Add listeners for connection state changes
      realtimeClient.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Make sure we have a connection before proceeding
      this.logCliEvent(flags, 'connection', 'waiting', 'Waiting for connection to establish...');
      await new Promise<void>((resolve, reject) => {
        const checkConnection = () => {
          const state = realtimeClient.connection.state;
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
      this.space = await spacesClient.get(spaceId)
      const space = this.space;
      this.logCliEvent(flags, 'spaces', 'gotSpace', `Successfully got space handle: ${spaceId}`);

      // Enter the space to subscribe
      this.logCliEvent(flags, 'spaces', 'entering', 'Entering space...');
      await space.enter()
      this.logCliEvent(flags, 'spaces', 'entered', 'Successfully entered space', { clientId: realtimeClient.auth.clientId });

      // Get all current locks first
      this.logCliEvent(flags, 'lock', 'gettingInitial', 'Fetching initial locks');
      if (!this.shouldOutputJson(flags)) {
         this.log(`\n${chalk.cyan('Fetching current locks')}...`);
      }

      let locks: Lock[] = [];
      try {
        // Make sure to handle the return value correctly
        locks = await space.locks.getAll();
        this.logCliEvent(flags, 'lock', 'gotInitial', `Fetched ${locks.length} initial locks`, { count: locks.length, locks });

        // Output current locks based on format
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
             success: true,
             spaceId,
             type: 'locks_snapshot',
             locks: locks.map(lock => ({
                  id: lock.id,
                  status: lock.status,
                  timestamp: lock.timestamp,
                  member: lock.member ? { clientId: lock.member.clientId, connectionId: lock.member.connectionId } : null,
                  reason: lock.reason,
             }))
          }, flags));
        } else {
          if (locks.length === 0) {
            this.log(chalk.yellow('No locks are currently active in this space.'))
          } else {
            this.log(`${chalk.cyan('Current locks')} (${chalk.bold(String(locks.length))}):\n`)

            locks.forEach((lock: Lock) => {
              try {
                this.log(`- ${chalk.blue(lock.id)}:`);
                this.log(`  ${chalk.dim('Status:')} ${lock.status || 'unknown'}`);
                this.log(`  ${chalk.dim('Holder:')} ${lock.member?.clientId || 'None'}`);
              } catch (err) {
                this.log(`- ${chalk.red('Error displaying lock item')}: ${err instanceof Error ? err.message : String(err)}`);
              }
            });
          }
        }
      } catch (error) {
         const errorMsg = `Error fetching initial locks: ${error instanceof Error ? error.message : String(error)}`;
         this.logCliEvent(flags, 'lock', 'getInitialError', errorMsg, { error: errorMsg });
         if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({ success: false, spaceId, error: errorMsg, status: 'error' }, flags));
        } else {
          this.log(chalk.yellow(errorMsg));
          this.log(chalk.yellow('Continuing without initial lock list.'));
        }
      }

      // Subscribe to lock changes
      this.logCliEvent(flags, 'lock', 'subscribing', 'Subscribing to lock updates');
      if (!this.shouldOutputJson(flags)) {
         this.log(chalk.cyan('\nListening for lock changes (Press Ctrl+C to exit)...\n'));
      }

      // Handle lock acquired/released events
      try {
        this.subscription = await space.locks.subscribe('update', (lock: Lock) => {
          const timestamp = new Date().toISOString();
          const eventData = {
              timestamp,
              lockId: lock.id,
              status: lock.status,
              member: lock.member ? { clientId: lock.member.clientId, connectionId: lock.member.connectionId } : null,
              reason: lock.reason,
          };
          this.logCliEvent(flags, 'lock', `update-${lock.status}`, `Lock ${lock.id} status changed to ${lock.status}`, { spaceId, ...eventData });

          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({ success: true, spaceId, type: 'lock_update', ...eventData }, flags));
          } else {
            this.log(`${lock.status === 'locked' ? chalk.green('✓') : chalk.red('✗')} ${chalk.cyan('Lock ' + lock.status + ':')} ${chalk.blue(lock.id)}`);
            this.log(`  ${chalk.dim('Status:')} ${lock.status || 'unknown'}`);
            this.log(`  ${chalk.dim('Holder Client ID:')} ${lock.member?.clientId || 'None'}`);
            this.log(`  ${chalk.dim('Holder Connection ID:')} ${lock.member?.connectionId || 'None'}`);
            if (lock.reason) {
               this.log(`  ${chalk.dim('Reason:')} ${lock.reason.message}`);
            }
          }
        });
         this.logCliEvent(flags, 'lock', 'subscribed', 'Successfully subscribed to lock updates');
      } catch (error) {
         const errorMsg = `Error subscribing to lock updates: ${error instanceof Error ? error.message : String(error)}`;
         this.logCliEvent(flags, 'lock', 'subscribeError', errorMsg, { error: errorMsg });
         if (this.shouldOutputJson(flags)) {
           this.log(this.formatJsonOutput({ success: false, spaceId, error: errorMsg, status: 'error' }, flags));
         } else {
           this.log(chalk.red(errorMsg));
         }
      }

      this.logCliEvent(flags, 'lock', 'listening', 'Listening for lock updates...');
      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          if (this.cleanupInProgress) return;
          this.cleanupInProgress = true;
          this.logCliEvent(flags, 'lock', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');

          if (!this.shouldOutputJson(flags)) {
             this.log(`\n${chalk.yellow('Unsubscribing and closing connection...')}`);
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
             const errorMsg = 'Force exiting after timeout during cleanup';
             this.logCliEvent(flags, 'lock', 'forceExit', errorMsg, { spaceId });
             if (!this.shouldOutputJson(flags)) {
                this.log(chalk.red('Force exiting after timeout...'));
             }
            process.exit(1);
          }, 5000);

          try {
            // Unsubscribe from lock events
            if (this.subscription) {
              try {
                 this.logCliEvent(flags, 'lock', 'unsubscribing', 'Unsubscribing from lock events');
                 this.subscription.unsubscribe();
                 this.logCliEvent(flags, 'lock', 'unsubscribed', 'Successfully unsubscribed from lock events');
              } catch (error) {
                  const errorMsg = `Error unsubscribing from locks: ${error instanceof Error ? error.message : String(error)}`;
                  this.logCliEvent(flags, 'lock', 'unsubscribeError', errorMsg, { error: errorMsg });
              }
            }

            if (space) {
               try {
                 // Leave the space
                 this.logCliEvent(flags, 'spaces', 'leaving', 'Leaving space...');
                 await space.leave();
                 this.logCliEvent(flags, 'spaces', 'left', 'Successfully left space');
               } catch (error) {
                  const errorMsg = `Error leaving space: ${error instanceof Error ? error.message : String(error)}`;
                  this.logCliEvent(flags, 'spaces', 'leaveError', errorMsg, { error: errorMsg });
               }
            }

            if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed') {
               try {
                  this.logCliEvent(flags, 'connection', 'closing', 'Closing Realtime connection');
                  this.clients.realtimeClient.close();
                  this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed');
               } catch (error) {
                  const errorMsg = `Error closing client: ${error instanceof Error ? error.message : String(error)}`;
                  this.logCliEvent(flags, 'connection', 'closeError', errorMsg, { error: errorMsg });
               }
            }

            clearTimeout(forceExitTimeout);
            this.logCliEvent(flags, 'lock', 'cleanupComplete', 'Cleanup complete');
            if (!this.shouldOutputJson(flags)) {
                this.log(chalk.green('\nDisconnected.'));
            }
            resolve();
            // Force exit after cleanup
            process.exit(0);
          } catch (error) {
             const errorMsg = `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`;
             this.logCliEvent(flags, 'lock', 'cleanupError', errorMsg, { error: errorMsg });
             if (!this.shouldOutputJson(flags)) {
                this.log(`Error during cleanup: ${errorMsg}`);
             }
            clearTimeout(forceExitTimeout);
            process.exit(1);
          }
        };

        process.once('SIGINT', cleanup);
        process.once('SIGTERM', cleanup);
      });
    } catch (error) {
       const errorMsg = `Error: ${error instanceof Error ? error.message : String(error)}`;
       this.logCliEvent(flags, 'lock', 'fatalError', errorMsg, { error: errorMsg, spaceId });
       this.error(errorMsg);
    } finally {
      // Ensure client is closed even if cleanup promise didn't resolve
       if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed') {
           this.logCliEvent(flags || {}, 'connection', 'finalCloseAttempt', 'Ensuring connection is closed in finally block.');
           this.clients.realtimeClient.close();
       }
    }
  }

   // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.subscription) { try { this.subscription.unsubscribe(); } catch (e) { /* ignore */ } }
     if (!this.cleanupInProgress && this.space) {
         try { await this.space.leave(); } catch(e) {/* ignore */} // Best effort
     }
     if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed') {
       if (this.clients.realtimeClient.connection.state !== 'failed') {
           this.clients.realtimeClient.close();
       }
     }
     return super.finally(err);
   }
} 