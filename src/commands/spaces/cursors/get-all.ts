import { type Space } from "@ably/spaces";
import { Args } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { SpacesBaseCommand } from "../../../spaces-base-command.js";

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
      description: "Space ID to get cursors from",
      required: true,
    }),
  };

  static override description = "Get all current cursors in a space";

  static override examples = [
    "$ ably spaces cursors get-all my-space",
    "$ ably spaces cursors get-all my-space --json",
    "$ ably spaces cursors get-all my-space --pretty-json",
  ];

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
  };

  // Declare class properties for clients and space
  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: unknown | null = null;
  private space: Space | null = null;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesCursorsGetAll);

    let cleanupInProgress = false;
    const { spaceId } = args;

    try {
      // Create Spaces client using setupSpacesClient
      const setupResult = await this.setupSpacesClient(flags, spaceId);
      this.realtimeClient = setupResult.realtimeClient;
      this.spacesClient = setupResult.spacesClient;
      this.space = setupResult.space;
      if (!this.realtimeClient || !this.spacesClient || !this.space) {
        this.error("Failed to initialize clients or space");
        return;
      }

      // Make sure we have a connection before proceeding
      await new Promise<void>((resolve, reject) => {
        const checkConnection = () => {
          const { state } = this.realtimeClient!.connection;
          if (state === "connected") {
            resolve();
          } else if (
            state === "failed" ||
            state === "closed" ||
            state === "suspended"
          ) {
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

      // Enter the space
      await this.space.enter();

      // Wait for space to be properly entered before fetching cursors
      await new Promise<void>((resolve, reject) => {
        // Set a reasonable timeout to avoid hanging indefinitely
        const timeout = setTimeout(() => {
          reject(new Error("Timed out waiting for space connection"));
        }, 5000);

        const checkSpaceStatus = () => {
          try {
            // Check realtime client state
            if (this.realtimeClient!.connection.state === "connected") {
              clearTimeout(timeout);
              if (this.shouldOutputJson(flags)) {
                this.log(
                  this.formatJsonOutput(
                    {
                      connectionId: this.realtimeClient!.connection.id,
                      spaceId,
                      status: "connected",
                      success: true,
                    },
                    flags,
                  ),
                );
              } else {
                this.log(
                  `${chalk.green("Successfully entered space:")} ${chalk.cyan(spaceId)}`,
                );
              }

              resolve();
            } else if (
              this.realtimeClient!.connection.state === "failed" ||
              this.realtimeClient!.connection.state === "closed" ||
              this.realtimeClient!.connection.state === "suspended"
            ) {
              clearTimeout(timeout);
              reject(
                new Error(
                  `Space connection failed with state: ${this.realtimeClient!.connection.state}`,
                ),
              );
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

      // Subscribe to cursor updates to ensure we receive remote cursors
      let cursorUpdateReceived = false;
      const cursorMap = new Map<string, CursorUpdate>();

      // Show initial message
      if (!this.shouldOutputJson(flags)) {
        const waitSeconds = this.isTestMode() ? '0.5' : '5';
        this.log(`Collecting cursor positions for ${waitSeconds} seconds...`);
        this.log(chalk.dim('─'.repeat(60)));
      }

      const cursorUpdateHandler = (cursor: CursorUpdate) => {
        cursorUpdateReceived = true;
        
        // Update the cursor map
        if (cursor.connectionId) {
          cursorMap.set(cursor.connectionId, cursor);
          
          // Show live update on one line
          if (!this.shouldOutputJson(flags) && this.shouldUseTerminalUpdates()) {
            const clientDisplay = cursor.clientId || 'Unknown';
            const x = cursor.position.x;
            const y = cursor.position.y;
            
            // Clear the line and write the update
            process.stdout.write(`\r${chalk.gray('►')} ${chalk.blue(clientDisplay)}: (${chalk.yellow(x)}, ${chalk.yellow(y)})${' '.repeat(30)}`);
          }
        }
      };

      await this.space.cursors.subscribe('update', cursorUpdateHandler);

      // Wait for 5 seconds (or shorter in test mode)
      const waitTime = this.isTestMode() ? 500 : 5000;
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (!this.shouldOutputJson(flags) && this.shouldUseTerminalUpdates()) {
            // Clear the last update line
            process.stdout.write('\r' + ' '.repeat(60) + '\r');
          }
          resolve();
        }, waitTime);
      });

      // Unsubscribe from cursor updates
      this.space.cursors.unsubscribe('update', cursorUpdateHandler);

      // Now get all cursors (including locally cached ones) and merge with live updates
      const allCursors = await this.space.cursors.getAll();
      
      // Add any cached cursors that we didn't see in live updates
      if (Array.isArray(allCursors)) {
        allCursors.forEach((cursor: CursorUpdate) => {
          if (cursor.connectionId && !cursorMap.has(cursor.connectionId)) {
            cursorMap.set(cursor.connectionId, cursor);
          }
        });
      }
      
      const cursors = [...cursorMap.values()];

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              cursors: cursors.map((cursor: CursorUpdate) => ({
                clientId: cursor.clientId,
                connectionId: cursor.connectionId,
                data: cursor.data,
                position: cursor.position,
              })),
              spaceId,
              success: true,
              cursorUpdateReceived,
            },
            flags,
          ),
        );
      } else {
        if (!cursorUpdateReceived && cursors.length === 0) {
          this.log(chalk.dim('─'.repeat(60)));
          this.log(chalk.yellow("No cursor updates are being sent in this space. Make sure other clients are actively setting cursor positions."));
          cleanupInProgress = true;
          return;
        }

        if (cursors.length === 0) {
          this.log(chalk.dim('─'.repeat(60)));
          this.log(chalk.yellow("No active cursors found in space."));
          cleanupInProgress = true;
          return;
        }

        // Show summary table
        this.log(chalk.dim('─'.repeat(60)));
        this.log(chalk.bold(`\nCursor Summary - ${cursors.length} cursor${cursors.length === 1 ? '' : 's'} found:\n`));
        
        // Table header
        const colWidths = { client: 20, x: 8, y: 8, connection: 20 };
        this.log(
          chalk.gray('┌' + '─'.repeat(colWidths.client + 2) + '┬' + '─'.repeat(colWidths.x + 2) + '┬' + '─'.repeat(colWidths.y + 2) + '┬' + '─'.repeat(colWidths.connection + 2) + '┐')
        );
        this.log(
          chalk.gray('│ ') + chalk.bold('Client ID'.padEnd(colWidths.client)) + 
          chalk.gray(' │ ') + chalk.bold('X'.padEnd(colWidths.x)) + 
          chalk.gray(' │ ') + chalk.bold('Y'.padEnd(colWidths.y)) + 
          chalk.gray(' │ ') + chalk.bold('Connection'.padEnd(colWidths.connection)) + 
          chalk.gray(' │')
        );
        this.log(
          chalk.gray('├' + '─'.repeat(colWidths.client + 2) + '┼' + '─'.repeat(colWidths.x + 2) + '┼' + '─'.repeat(colWidths.y + 2) + '┼' + '─'.repeat(colWidths.connection + 2) + '┤')
        );
        
        // Table rows
        cursors.forEach((cursor: CursorUpdate) => {
          const clientId = (cursor.clientId || 'Unknown').slice(0, colWidths.client);
          const x = cursor.position.x.toString().slice(0, colWidths.x);
          const y = cursor.position.y.toString().slice(0, colWidths.y);
          const connectionId = (cursor.connectionId || 'Unknown').slice(0, colWidths.connection);
          
          this.log(
            chalk.gray('│ ') + chalk.blue(clientId.padEnd(colWidths.client)) + 
            chalk.gray(' │ ') + chalk.yellow(x.padEnd(colWidths.x)) + 
            chalk.gray(' │ ') + chalk.yellow(y.padEnd(colWidths.y)) + 
            chalk.gray(' │ ') + chalk.dim(connectionId.padEnd(colWidths.connection)) + 
            chalk.gray(' │')
          );
        });
        
        this.log(
          chalk.gray('└' + '─'.repeat(colWidths.client + 2) + '┴' + '─'.repeat(colWidths.x + 2) + '┴' + '─'.repeat(colWidths.y + 2) + '┴' + '─'.repeat(colWidths.connection + 2) + '┘')
        );
        
        // Show additional data if any cursor has it
        const cursorsWithData = cursors.filter(c => c.data);
        if (cursorsWithData.length > 0) {
          this.log(`\n${chalk.bold('Additional Data:')}`);
          cursorsWithData.forEach((cursor: CursorUpdate) => {
            this.log(`  ${chalk.blue(cursor.clientId || 'Unknown')}: ${JSON.stringify(cursor.data)}`);
          });
        }
      }

      // Mark that we're done
      cleanupInProgress = true;
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              error: `Error getting cursors: ${error instanceof Error ? error.message : String(error)}`,
              spaceId: args.spaceId,
              status: "error",
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.log(
          chalk.red(
            `Error getting cursors: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    } finally {
      if (!cleanupInProgress) {
        cleanupInProgress = true;
      }
      
      // Always clean up connections
      try {
        if (this.space) {
          await this.space.leave();
        }
      } catch {
        // Ignore cleanup errors
      }
      
      try {
        if (this.realtimeClient && this.realtimeClient.connection.state !== 'closed') {
          this.realtimeClient.close();
          // Give the connection a moment to close
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch {
        // Ignore cleanup errors
      }
      
      // Force exit if we're done and cleaned up
      if (cleanupInProgress) {
        // Allow any pending I/O to complete
        setImmediate(() => {
          process.exit(0);
        });
      }
    }
  }
}
