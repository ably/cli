import * as Ably from "ably";
import { type Space } from "@ably/spaces";

// Dynamic import to handle module structure issues
let SpacesConstructor: any = null;

async function getSpacesConstructor() {
  if (!SpacesConstructor) {
    const spacesModule: any = await import("@ably/spaces");
    SpacesConstructor = spacesModule.default?.default || spacesModule.default || spacesModule;
  }
  return SpacesConstructor;
}

import { AblyBaseCommand } from "./base-command.js";
import { BaseFlags } from "./types/cli.js";

export abstract class SpacesBaseCommand extends AblyBaseCommand {
  // Ensure we have the spaces client and its related authentication resources
  protected async setupSpacesClient(
    flags: BaseFlags,
    spaceName: string,
  ): Promise<{
    realtimeClient: Ably.Realtime;
    spacesClient: any;
    space: Space;
  }> {
    // First create an Ably client
    const realtimeClient = await this.createAblyClient(flags);
    if (!realtimeClient) {
      this.error("Failed to create Ably client");
    }

    // Create a Spaces client using the Ably client
    const Spaces = await getSpacesConstructor();
    const spacesClient = new Spaces(realtimeClient);

    // Get a space instance with the provided name
    const space = await spacesClient.get(spaceName);

    return {
      realtimeClient,
      space,
      spacesClient,
    };
  }

  protected async createSpacesClient(realtimeClient: Ably.Realtime): Promise<any> {
    const Spaces = await getSpacesConstructor();
    return new Spaces(realtimeClient);
  }
}
