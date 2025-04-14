import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ConnectionsTest extends AblyBaseCommand {
  static override description = 'Test connection to Ably'

  static override examples = [
    '$ ably connections test',
    '$ ably connections test --transport ws',
    '$ ably connections test --transport xhr',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    transport: Flags.string({
      description: 'Transport protocol to use (ws for WebSockets, xhr for HTTP)',
      options: ['ws', 'xhr', 'all'],
      default: 'all',
    }),
  }

  private wsClient: Ably.Realtime | null = null;
  private xhrClient: Ably.Realtime | null = null;

  async run(): Promise<void> {
    const {flags} = await this.parse(ConnectionsTest)

    try {
      // Get client options
      const options: Ably.ClientOptions = this.getClientOptions(flags)

      // Test results
      let wsSuccess = false
      let xhrSuccess = false
      let wsError: Error | null = null
      let xhrError: Error | null = null

      // WebSocket connection test if specified
      if (flags.transport === 'all' || flags.transport === 'ws') {
        this.logCliEvent(flags, 'connectionTest', 'wsTestStarting', 'Testing WebSocket connection...');
        if (!this.shouldOutputJson(flags)) {
            this.log('Testing WebSocket connection to Ably...');
        }

        try {
          const wsOptions: Ably.ClientOptions = {
            ...options,
            transportParams: {
              preferWebSockets: true,
              disallowXHR: true
            }
          }
          this.wsClient = new Ably.Realtime(wsOptions)
          const client = this.wsClient; // Local const

          // Add listeners for this specific test
          client.connection.on((stateChange: Ably.ConnectionStateChange) => {
              this.logCliEvent(flags, 'connectionTest', `wsStateChange-${stateChange.current}`, `WS connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
          });

          await new Promise<void>((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
              const timeoutError = new Error('Connection timeout after 10 seconds');
              this.logCliEvent(flags, 'connectionTest', 'wsTimeout', timeoutError.message, { error: timeoutError.message });
              reject(timeoutError)
            }, 10000)

            client.connection.once('connected', () => {
              clearTimeout(connectionTimeout)
              wsSuccess = true
              this.logCliEvent(flags, 'connectionTest', 'wsSuccess', 'WebSocket connection successful', { connectionId: client.connection.id });
              if (!this.shouldOutputJson(flags)) {
                this.log(`${chalk.green('✓')} WebSocket connection successful`);
                this.log(`  Connection ID: ${chalk.cyan(client.connection.id || 'unknown')}`);
              }
              client.close()
              resolve()
            })

            client.connection.once('failed', (stateChange) => {
              clearTimeout(connectionTimeout)
              wsError = stateChange.reason || new Error('Connection failed')
              this.logCliEvent(flags, 'connectionTest', 'wsFailed', `WebSocket connection failed: ${wsError.message}`, { error: wsError.message, reason: stateChange.reason });
              if (!this.shouldOutputJson(flags)) {
                  this.log(`${chalk.red('✗')} WebSocket connection failed: ${wsError.message}`);
              }
              client.close() // Close even on failure
              resolve() // Resolve to allow XHR test to run
            })
          })
        } catch (error) {
          wsError = error as Error
          this.logCliEvent(flags, 'connectionTest', 'wsError', `WebSocket connection test caught error: ${wsError.message}`, { error: wsError.message });
          if (!this.shouldOutputJson(flags)) {
            this.log(`${chalk.red('✗')} WebSocket connection failed: ${wsError.message}`);
          }
           // Ensure client is closed if error occurred during setup
           if (this.wsClient && this.wsClient.connection.state !== 'closed') {
              this.wsClient.close();
           }
        }
      }

      // XHR connection test if specified
      if (flags.transport === 'all' || flags.transport === 'xhr') {
         this.logCliEvent(flags, 'connectionTest', 'xhrTestStarting', 'Testing HTTP connection...');
         if (!this.shouldOutputJson(flags)) {
            this.log('Testing HTTP connection to Ably...');
         }

        try {
          const xhrOptions: Ably.ClientOptions = {
            ...options,
            transportParams: {
              disallowWebSockets: true
            }
          }
          this.xhrClient = new Ably.Realtime(xhrOptions)
          const client = this.xhrClient; // Local const

          // Add listeners for this specific test
          client.connection.on((stateChange: Ably.ConnectionStateChange) => {
              this.logCliEvent(flags, 'connectionTest', `xhrStateChange-${stateChange.current}`, `HTTP connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
          });

          await new Promise<void>((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
              const timeoutError = new Error('Connection timeout after 10 seconds');
              this.logCliEvent(flags, 'connectionTest', 'xhrTimeout', timeoutError.message, { error: timeoutError.message });
              reject(timeoutError);
            }, 10000)

            client.connection.once('connected', () => {
              clearTimeout(connectionTimeout)
              xhrSuccess = true
              this.logCliEvent(flags, 'connectionTest', 'xhrSuccess', 'HTTP connection successful', { connectionId: client.connection.id });
              if (!this.shouldOutputJson(flags)) {
                this.log(`${chalk.green('✓')} HTTP connection successful`);
                this.log(`  Connection ID: ${chalk.cyan(client.connection.id || 'unknown')}`);
              }
              client.close()
              resolve()
            })

            client.connection.once('failed', (stateChange) => {
              clearTimeout(connectionTimeout)
              xhrError = stateChange.reason || new Error('Connection failed')
              this.logCliEvent(flags, 'connectionTest', 'xhrFailed', `HTTP connection failed: ${xhrError.message}`, { error: xhrError.message, reason: stateChange.reason });
              if (!this.shouldOutputJson(flags)) {
                 this.log(`${chalk.red('✗')} HTTP connection failed: ${xhrError.message}`);
              }
              client.close() // Close even on failure
              resolve() // Resolve to allow summary output
            })
          })
        } catch (error) {
          xhrError = error as Error
          this.logCliEvent(flags, 'connectionTest', 'xhrError', `HTTP connection test caught error: ${xhrError.message}`, { error: xhrError.message });
          if (!this.shouldOutputJson(flags)) {
            this.log(`${chalk.red('✗')} HTTP connection failed: ${xhrError.message}`);
          }
          // Ensure client is closed if error occurred during setup
           if (this.xhrClient && this.xhrClient.connection.state !== 'closed') {
              this.xhrClient.close();
           }
        }
      }

      // Output summary
      const summary = {
         ws: { success: wsSuccess, error: wsError?.message || null },
         xhr: { success: xhrSuccess, error: xhrError?.message || null }
      };
      this.logCliEvent(flags, 'connectionTest', 'summary', 'Connection test summary', summary);

      if (!this.shouldOutputJson(flags)) {
         this.log('');
         this.log('Connection Test Summary:');

         if (flags.transport === 'all') {
           // If both were tested
           const allSuccess = wsSuccess && xhrSuccess
           const partialSuccess = wsSuccess || xhrSuccess

           if (allSuccess) {
             this.log(`${chalk.green('✓')} All connection tests passed successfully`);
           } else if (partialSuccess) {
             this.log(`${chalk.yellow('!')} Some connection tests succeeded, but others failed`);
           } else {
             this.log(`${chalk.red('✗')} All connection tests failed`);
           }
         } else if (flags.transport === 'ws') {
           if (wsSuccess) {
             this.log(`${chalk.green('✓')} WebSocket connection test passed successfully`);
           } else {
             this.log(`${chalk.red('✗')} WebSocket connection test failed`);
           }
         } else if (flags.transport === 'xhr') {
           if (xhrSuccess) {
             this.log(`${chalk.green('✓')} HTTP connection test passed successfully`);
           } else {
             this.log(`${chalk.red('✗')} HTTP connection test failed`);
           }
         }
      }

    } catch (error: unknown) {
      const err = error as Error
      this.logCliEvent(flags || {}, 'connectionTest', 'fatalError', `Connection test failed: ${err.message}`, { error: err.message });
      this.error(err.message)
    } finally {
       // Ensure clients are closed
       if (this.wsClient && this.wsClient.connection.state !== 'closed') {
           this.wsClient.close();
       }
       if (this.xhrClient && this.xhrClient.connection.state !== 'closed') {
           this.xhrClient.close();
       }
    }
  }

   // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.wsClient && this.wsClient.connection.state !== 'closed') {
       if (this.wsClient.connection.state !== 'failed') {
           this.wsClient.close();
       }
     }
     if (this.xhrClient && this.xhrClient.connection.state !== 'closed') {
        if (this.xhrClient.connection.state !== 'failed') {
            this.xhrClient.close();
        }
     }
     return super.finally(err);
   }
} 