// Import with type assertion to handle the nested default export
import Spaces from "@ably/spaces";
import * as Ably from "ably";
import { type Space } from "@ably/spaces";

import { AblyBaseCommand } from "./base-command.js";
import { BaseFlags } from "./types/cli.js";

export abstract class SpacesBaseCommand extends AblyBaseCommand {
  // Ensure we have the spaces client and its related authentication resources
  protected async setupSpacesClient(
    flags: BaseFlags,
    spaceName: string,
  ): Promise<{
    realtimeClient: Ably.Realtime;
    spacesClient: Spaces;
    space: Space;
  }> {
    // First create an Ably client
    const realtimeClient = await this.createAblyClient(flags);
    if (!realtimeClient) {
      this.error("Failed to create Ably client");
    }

    // Create a Spaces client using the Ably client
    const spacesClient = new Spaces(realtimeClient);

    // Get a space instance with the provided name
    const space = await spacesClient.get(spaceName);

    return {
      realtimeClient,
      space,
      spacesClient,
    };
  }

  protected createSpacesClient(realtimeClient: Ably.Realtime): Spaces {
    return new Spaces(realtimeClient);
  }
}
