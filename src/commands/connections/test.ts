import {Flags} from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import {AblyBaseCommand} from '../../base-command.js'

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
      default: 'all',
      description: 'Transport protocol to use (ws for WebSockets, xhr for HTTP)',
      options: ['ws', 'xhr', 'all'],
    }),
  }

  private wsClient: Ably.Realtime | null = null;
  private xhrClient: Ably.Realtime | null = null;

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<void> {
     if (this.wsClient && this.wsClient.connection.state !== 'closed' && this.wsClient.connection.state !== 'failed') {
           this.wsClient.close();
       }

     if (this.xhrClient && this.xhrClient.connection.state !== 'closed' && this.xhrClient.connection.state !== 'failed') {
            this.xhrClient.close();
        }

     return super.finally(err);
   }

   async run(): Promise<void> {
    const {flags} = await this.parse(ConnectionsTest)

    let wsSuccess = false
    let xhrSuccess = false
    let wsError: Error | null = null
    let xhrError: Error | null = null
    const baseOptions: Ably.ClientOptions = this.getClientOptions(flags)

    try {
      // Run tests based on flags
      if (flags.transport === 'all' || flags.transport === 'ws') {
        const result = await this.testWebSocketConnection(baseOptions, flags);
        wsSuccess = result.success;
        wsError = result.error;
      }

      if (flags.transport === 'all' || flags.transport === 'xhr') {
        const result = await this.testXhrConnection(baseOptions, flags);
        xhrSuccess = result.success;
        xhrError = result.error;
      }

      this.outputSummary(flags, wsSuccess, xhrSuccess, wsError, xhrError);

    } catch (error: unknown) {
      const err = error as Error
      this.logCliEvent(flags || {}, 'connectionTest', 'fatalError', `Connection test failed: ${err.message}`, { error: err.message });
      this.error(err.message)
    } finally {
      // Ensure clients are closed (handled by the finally override)
    }
  }

  // --- Refactored Test Methods ---

  private outputSummary(flags: Record<string, unknown>, wsSuccess: boolean, xhrSuccess: boolean, wsError: Error | null, xhrError: Error | null): void {
     const summary = {
         ws: { error: wsError?.message || null, success: wsSuccess },
         xhr: { error: xhrError?.message || null, success: xhrSuccess }
      };
      this.logCliEvent(flags, 'connectionTest', 'summary', 'Connection test summary', summary);

      if (!this.shouldOutputJson(flags)) {
         this.log('');
         this.log('Connection Test Summary:');

         switch (flags.transport) {
         case 'all': {
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
         
         break;
         }

         case 'ws': {
           if (wsSuccess) {
             this.log(`${chalk.green('✓')} WebSocket connection test passed successfully`);
           } else {
             this.log(`${chalk.red('✗')} WebSocket connection test failed`);
           }
         
         break;
         }

         case 'xhr': {
           if (xhrSuccess) {
             this.log(`${chalk.green('✓')} HTTP connection test passed successfully`);
           } else {
             this.log(`${chalk.red('✗')} HTTP connection test failed`);
           }
         
         break;
         }
         // No default
         }
      }
  }

  private async testWebSocketConnection(baseOptions: Ably.ClientOptions, flags: Record<string, unknown>): Promise<{ error: Error | null; success: boolean }> {
    let success = false;
    let errorResult: Error | null = null;

    this.logCliEvent(flags, 'connectionTest', 'wsTestStarting', 'Testing WebSocket connection...');
    if (!this.shouldOutputJson(flags)) {
        this.log('Testing WebSocket connection to Ably...');
    }

    try {
      const wsOptions: Ably.ClientOptions = {
        ...baseOptions,
        transportParams: {
          disallowXHR: true,
          preferWebSockets: true
        }
      }
      this.wsClient = new Ably.Realtime(wsOptions);
      const client = this.wsClient;

      client.connection.on((stateChange: Ably.ConnectionStateChange) => {
          this.logCliEvent(flags, 'connectionTest', `wsStateChange-${stateChange.current}`, `WS connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      await new Promise<void>((resolve, reject) => {
        const connectionTimeout = setTimeout(() => {
          const timeoutError = new Error('Connection timeout after 10 seconds');
          this.logCliEvent(flags, 'connectionTest', 'wsTimeout', timeoutError.message, { error: timeoutError.message });
          reject(timeoutError);
        }, 10_000);

        client.connection.once('connected', () => {
          clearTimeout(connectionTimeout);
          success = true;
          this.logCliEvent(flags, 'connectionTest', 'wsSuccess', 'WebSocket connection successful', { connectionId: client.connection.id });
          if (!this.shouldOutputJson(flags)) {
            this.log(`${chalk.green('✓')} WebSocket connection successful`);
            this.log(`  Connection ID: ${chalk.cyan(client.connection.id || 'unknown')}`);
          }

          resolve();
        });

        client.connection.once('failed', (stateChange) => {
          clearTimeout(connectionTimeout);
          errorResult = stateChange.reason || new Error('Connection failed');
          this.logCliEvent(flags, 'connectionTest', 'wsFailed', `WebSocket connection failed: ${errorResult.message}`, { error: errorResult.message, reason: stateChange.reason });
          if (!this.shouldOutputJson(flags)) {
              this.log(`${chalk.red('✗')} WebSocket connection failed: ${errorResult.message}`);
          }

          resolve(); // Resolve even on failure to allow summary
        });
      });
    } catch (error) {
      errorResult = error as Error;
      this.logCliEvent(flags, 'connectionTest', 'wsError', `WebSocket connection test caught error: ${errorResult.message}`, { error: errorResult.message });
      if (!this.shouldOutputJson(flags)) {
        this.log(`${chalk.red('✗')} WebSocket connection failed: ${errorResult.message}`);
      }
    } finally {
      // Close client if it exists and isn't already closed
      if (this.wsClient && this.wsClient.connection.state !== 'closed') {
        this.wsClient.close();
      }
    }

    return { error: errorResult, success };
  }

  private async testXhrConnection(baseOptions: Ably.ClientOptions, flags: Record<string, unknown>): Promise<{ error: Error | null; success: boolean }> {
    let success = false;
    let errorResult: Error | null = null;

    this.logCliEvent(flags, 'connectionTest', 'xhrTestStarting', 'Testing HTTP connection...');
    if (!this.shouldOutputJson(flags)) {
        this.log('Testing HTTP connection to Ably...');
    }

    try {
      const xhrOptions: Ably.ClientOptions = {
        ...baseOptions,
        transportParams: {
          disallowWebSockets: true
        }
      };
      this.xhrClient = new Ably.Realtime(xhrOptions);
      const client = this.xhrClient;

      client.connection.on((stateChange: Ably.ConnectionStateChange) => {
          this.logCliEvent(flags, 'connectionTest', `xhrStateChange-${stateChange.current}`, `HTTP connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      await new Promise<void>((resolve, reject) => {
        const connectionTimeout = setTimeout(() => {
          const timeoutError = new Error('Connection timeout after 10 seconds');
          this.logCliEvent(flags, 'connectionTest', 'xhrTimeout', timeoutError.message, { error: timeoutError.message });
          reject(timeoutError);
        }, 10_000);

        client.connection.once('connected', () => {
          clearTimeout(connectionTimeout);
          success = true;
          this.logCliEvent(flags, 'connectionTest', 'xhrSuccess', 'HTTP connection successful', { connectionId: client.connection.id });
          if (!this.shouldOutputJson(flags)) {
            this.log(`${chalk.green('✓')} HTTP connection successful`);
            this.log(`  Connection ID: ${chalk.cyan(client.connection.id || 'unknown')}`);
          }

          resolve();
        });

        client.connection.once('failed', (stateChange) => {
          clearTimeout(connectionTimeout);
          errorResult = stateChange.reason || new Error('Connection failed');
          this.logCliEvent(flags, 'connectionTest', 'xhrFailed', `HTTP connection failed: ${errorResult.message}`, { error: errorResult.message, reason: stateChange.reason });
          if (!this.shouldOutputJson(flags)) {
             this.log(`${chalk.red('✗')} HTTP connection failed: ${errorResult.message}`);
          }

          resolve(); // Resolve even on failure
        });
      });
    } catch (error) {
      errorResult = error as Error;
      this.logCliEvent(flags, 'connectionTest', 'xhrError', `HTTP connection test caught error: ${errorResult.message}`, { error: errorResult.message });
      if (!this.shouldOutputJson(flags)) {
        this.log(`${chalk.red('✗')} HTTP connection failed: ${errorResult.message}`);
      }
    } finally {
      if (this.xhrClient && this.xhrClient.connection.state !== 'closed') {
        this.xhrClient.close();
      }
    }

    return { error: errorResult, success };
  }
} 