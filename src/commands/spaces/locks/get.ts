import Spaces from "@ably/spaces";
import { type Space } from "@ably/spaces"; // Import Space type
import { Args } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { SpacesBaseCommand } from "../../../spaces-base-command.js";

// interface SpacesClients { // Remove interface
//   realtimeClient: any;
//   spacesClient: any;
// }

export default class SpacesLocksGet extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: "Space ID to get lock from",
      required: true,
    }),
    lockId: Args.string({
      description: "Lock ID to get",
      required: true,
    }),
  };

  static override description = "Get a lock in a space";

  static override examples = [
    "$ ably spaces locks get my-space my-lock",
    "$ ably spaces locks get my-space my-lock --json",
    "$ ably spaces locks get my-space my-lock --pretty-json",
  ];

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
  };

  // Declare class properties
  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: Spaces | null = null;
  private space: Space | null = null;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocksGet);

    // let clients: SpacesClients | null = null // Remove local variable
    const { spaceId } = args; // Get spaceId earlier
    const { lockId } = args;

    try {
      // Create Spaces client using setupSpacesClient
      // clients = await this.createSpacesClient(flags) // Replace with setupSpacesClient
      const setupResult = await this.setupSpacesClient(flags, spaceId);
      this.realtimeClient = setupResult.realtimeClient;
      this.spacesClient = setupResult.spacesClient;
      this.space = setupResult.space;
      // if (!clients) return // Check properties
      if (!this.realtimeClient || !this.spacesClient || !this.space) {
        this.error("Failed to initialize clients or space");
        return;
      }

      // const { spacesClient } = clients // Remove deconstruction
      // const {spaceId} = args // Moved earlier
      // const {lockId} = args // Moved earlier

      // Get the space
      // const space = await spacesClient.get(spaceId) // Already got this.space

      // Enter the space first
      // await space.enter() // Use this.space
      await this.space.enter();
      this.log(
        `${chalk.green("Successfully entered space:")} ${chalk.cyan(spaceId)}`,
      );

      // Try to get the lock
      try {
        // const lock = await space.locks.get(lockId) // Use this.space
        const lock = await this.space.locks.get(lockId);

        if (!lock) {
          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput({ error: "Lock not found", lockId }, flags),
            );
          } else {
            this.log(
              chalk.yellow(`Lock '${lockId}' not found in space '${spaceId}'`),
            );
          }

          return;
        }

        if (this.shouldOutputJson(flags)) {
          // Use structuredClone or similar for formatJsonOutput
          this.log(this.formatJsonOutput(structuredClone(lock), flags));
        } else {
          // Use structuredClone or similar for formatJsonOutput
          this.log(
            `${chalk.dim("Lock details:")} ${this.formatJsonOutput(structuredClone(lock), flags)}`,
          );
        }
      } catch (error) {
        this.error(
          `Failed to get lock: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } catch (error) {
      this.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      // if (clients?.realtimeClient) { // Use this.realtimeClient
      if (this.realtimeClient) {
        // clients.realtimeClient.close() // Use this.realtimeClient
        this.realtimeClient.close();
      }
    }
  }
}
