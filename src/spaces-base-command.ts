import * as Ably from "ably";
import { type Space } from "@ably/spaces";

// Dynamic import to handle module structure issues
let SpacesConstructor: (new (client: Ably.Realtime) => unknown) | null = null;

async function getSpacesConstructor(): Promise<new (client: Ably.Realtime) => unknown> {
  if (!SpacesConstructor) {
    const spacesModule = await import("@ably/spaces") as unknown;
    const moduleAsRecord = spacesModule as Record<string, unknown>;
    const defaultProperty = moduleAsRecord.default as Record<string, unknown> | undefined;
    SpacesConstructor = (defaultProperty?.default || moduleAsRecord.default || moduleAsRecord) as new (client: Ably.Realtime) => unknown;
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
    spacesClient: unknown;
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
    const space = await (spacesClient as { get: (name: string) => Promise<Space> }).get(spaceName);

    return {
      realtimeClient,
      space,
      spacesClient,
    };
  }

  protected async createSpacesClient(realtimeClient: Ably.Realtime): Promise<unknown> {
    const Spaces = await getSpacesConstructor();
    return new Spaces(realtimeClient);
  }
}
