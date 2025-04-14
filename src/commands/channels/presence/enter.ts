import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ChannelsPresenceEnter extends AblyBaseCommand {
  static override description = 'Enter presence on a channel and remain present until terminated'

  static override examples = [
    '$ ably channels presence enter my-channel',
    '$ ably channels presence enter my-channel --data \'{"status":"online"}\'',
    '$ ably channels presence enter my-channel --client-id "user123"',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    'data': Flags.string({
      description: 'Presence data to publish (JSON string)',
      default: '{}',
    }),
    'show-others': Flags.boolean({
      description: 'Show other presence events while present',
      default: true,
    }),
  }

  static override args = {
    channel: Args.string({
      description: 'Channel name to enter presence on',
      required: true,
    }),
  }

  private client: Ably.Realtime | null = null;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsPresenceEnter)

    try {
      // Create the Ably client
      this.client = await this.createAblyClient(flags)
      if (!this.client) return

      const client = this.client; // Local const
      const channelName = args.channel

      // Add listeners for connection state changes
      client.connection.on((stateChange: Ably.ConnectionStateChange) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Get the channel
      const channel = client.channels.get(channelName)

       // Add listeners for channel state changes
       channel.on((stateChange: Ably.ChannelStateChange) => {
         this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${channelName}' state changed to ${stateChange.current}`, { reason: stateChange.reason });
       });

      // Parse the data
      let presenceData = {}
      try {
        presenceData = JSON.parse(flags.data)
        this.logCliEvent(flags, 'presence', 'dataParsed', 'Presence data parsed successfully', { data: presenceData });
      } catch (error) {
        const errorMsg = 'Invalid JSON data format. Please provide a valid JSON string.';
        this.logCliEvent(flags, 'presence', 'dataParseError', errorMsg, { error: error instanceof Error ? error.message : String(error) });
        this.error(errorMsg)
        return
      }

      // Setup presence event handlers if we're showing other presence events
      if (flags['show-others']) {
        this.logCliEvent(flags, 'presence', 'subscribingToOthers', 'Subscribing to other presence events');
        channel.presence.subscribe('enter', (presenceMessage) => {
          if (presenceMessage.clientId !== client?.auth.clientId) {
             this.logCliEvent(flags, 'presence', 'memberEntered', `${presenceMessage.clientId || 'Unknown'} entered presence`, { clientId: presenceMessage.clientId, data: presenceMessage.data });
             if (!this.shouldOutputJson(flags)) {
                this.log(`${chalk.green('✓')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} entered presence`);
             }
          }
        })

        channel.presence.subscribe('leave', (presenceMessage) => {
          if (presenceMessage.clientId !== client?.auth.clientId) {
             this.logCliEvent(flags, 'presence', 'memberLeft', `${presenceMessage.clientId || 'Unknown'} left presence`, { clientId: presenceMessage.clientId });
             if (!this.shouldOutputJson(flags)) {
                this.log(`${chalk.red('✗')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} left presence`);
             }
          }
        })

        channel.presence.subscribe('update', (presenceMessage) => {
          if (presenceMessage.clientId !== client?.auth.clientId) {
             this.logCliEvent(flags, 'presence', 'memberUpdated', `${presenceMessage.clientId || 'Unknown'} updated presence data`, { clientId: presenceMessage.clientId, data: presenceMessage.data });
             if (!this.shouldOutputJson(flags)) {
                this.log(`${chalk.yellow('⟲')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} updated presence data:`);
                this.log(`  ${this.formatJsonOutput(presenceMessage.data, flags)}`); // Format JSON nicely
             }
          }
        })
      }

      // Enter presence
      this.logCliEvent(flags, 'presence', 'entering', `Attempting to enter presence on ${channelName}`, { data: presenceData });
      await channel.presence.enter(presenceData)
      this.logCliEvent(flags, 'presence', 'entered', `Successfully entered presence on ${channelName}`, { clientId: client.auth.clientId });

      if (!this.shouldOutputJson(flags)) {
         this.log(`${chalk.green('✓')} Entered presence on channel ${chalk.cyan(channelName)} as ${chalk.blue(client.auth.clientId)}`);
      }

      if (flags['show-others']) {
        // Get and display current presence members
        this.logCliEvent(flags, 'presence', 'gettingMembers', 'Fetching current presence members');
        const members = await channel.presence.get()
        this.logCliEvent(flags, 'presence', 'membersFetched', `Fetched ${members.length} presence members`, { count: members.length });

        if (!this.shouldOutputJson(flags)) {
           if (members.length > 1) {
             this.log(`\nCurrent presence members (${members.length - 1} others):\n`)
             members.forEach(member => {
               if (member.clientId !== client?.auth.clientId) {
                 this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)
                 if (member.data && Object.keys(member.data).length > 0) {
                   this.log(`  Data: ${JSON.stringify(member.data, null, 2)}`)
                 }
               }
             })
           } else {
             this.log('\nNo other clients are present in this channel')
           }
        }

        this.logCliEvent(flags, 'presence', 'listening', 'Listening for presence events until terminated');
        if (!this.shouldOutputJson(flags)) {
           this.log('\nListening for presence events until terminated. Press Ctrl+C to exit.');
        }
      } else {
         this.logCliEvent(flags, 'presence', 'present', 'Staying present until terminated');
         if (!this.shouldOutputJson(flags)) {
            this.log('\nStaying present until terminated. Press Ctrl+C to exit.');
         }
      }

      // Keep the process running until interrupted
      await new Promise((resolve) => {
        let cleanupInProgress = false

        const cleanup = async () => {
          if (cleanupInProgress) return
          cleanupInProgress = true

          this.logCliEvent(flags, 'presence', 'cleanupInitiated', 'Cleanup initiated (Ctrl+C pressed)');
          if (!this.shouldOutputJson(flags)) {
             this.log('\nLeaving presence and closing connection...');
          }

          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
             this.logCliEvent(flags, 'presence', 'forceExit', 'Force exiting after timeout during cleanup');
             if (!this.shouldOutputJson(flags)) {
                this.log(chalk.red('Force exiting after timeout...'));
             }
            process.exit(1)
          }, 5000)

          try {
            try {
              // Try to leave presence first
              this.logCliEvent(flags, 'presence', 'leaving', 'Attempting to leave presence');
              await channel.presence.leave()
              this.logCliEvent(flags, 'presence', 'left', 'Successfully left presence');
              if (!this.shouldOutputJson(flags)) {
                 this.log(chalk.green('Successfully left presence.'));
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              this.logCliEvent(flags, 'presence', 'leaveError', `Error leaving presence: ${errorMsg}`, { error: errorMsg });
              // If leaving presence fails (likely due to channel being detached), just log and continue
              if (!this.shouldOutputJson(flags)) {
                 this.log(`Note: ${errorMsg}`);
                 this.log('Continuing with connection close.');
              }
            }

            // Now close the connection
            if (client) {
               this.logCliEvent(flags, 'connection', 'closing', 'Closing Ably connection.');
               client.close();
               this.logCliEvent(flags, 'connection', 'closed', 'Ably connection closed.');
               if (!this.shouldOutputJson(flags)) {
                  this.log(chalk.green('Successfully closed connection.'));
               }
            }

            clearTimeout(forceExitTimeout)
            resolve(null)
            process.exit(0)
          } catch (error) {
             const errorMsg = error instanceof Error ? error.message : String(error);
             this.logCliEvent(flags, 'presence', 'cleanupError', `Error during cleanup: ${errorMsg}`, { error: errorMsg });
             if (!this.shouldOutputJson(flags)) {
                this.log(`Error during cleanup: ${errorMsg}`);
             }
            clearTimeout(forceExitTimeout)
            process.exit(1)
          }
        }

        process.once('SIGINT', () => void cleanup())
        process.once('SIGTERM', () => void cleanup())
      })
    } catch (error) {
       const errorMsg = error instanceof Error ? error.message : String(error);
       this.logCliEvent(flags || {}, 'presence', 'fatalError', `Error entering presence: ${errorMsg}`, { error: errorMsg });
       this.error(`Error entering presence: ${errorMsg}`);
    } finally {
      // Ensure client is closed even if cleanup promise didn't resolve
      if (this.client && this.client.connection.state !== 'closed') {
          this.logCliEvent(flags || {}, 'connection', 'finalCloseAttempt', 'Ensuring connection is closed in finally block.');
          this.client.close();
      }
    }
  }

   // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.client && this.client.connection.state !== 'closed') {
       // Check state before closing to avoid errors if already closed
       if (this.client.connection.state !== 'failed') {
           this.client.close();
       }
     }
     return super.finally(err);
   }
} 