// Import with type assertion to handle the nested default export
import SpacesModule from '@ably/spaces'
import * as Ably from 'ably'

import { AblyBaseCommand } from './base-command.js'
type SpacesConstructor = new (client: Ably.Realtime) => any;

export abstract class SpacesBaseCommand extends AblyBaseCommand {
  protected async createSpacesClient(flags: any): Promise<{ realtimeClient: Ably.Realtime, spacesClient: any } | null> {
    const isJsonMode = this.shouldOutputJson(flags);
    // Create Ably Realtime client first
    // Error handling within createAblyClient already handles JSON output
    const realtimeClient = await this.createAblyClient(flags)

    if (!realtimeClient) {
      // createAblyClient handles error output (including JSON) before returning null
      return null
    }

    try {
      // Create Spaces client using the Realtime client
      // Use type assertion to handle the nested default export
      const Spaces = (SpacesModule as any).default as SpacesConstructor
      const spacesClient = new Spaces(realtimeClient)
      this.logCliEvent(flags, 'SpacesClient', 'init', 'Spaces client initialized successfully.');
      return { realtimeClient, spacesClient }
    } catch (error: unknown) {
      // Close the Realtime connection if Spaces client creation fails
      realtimeClient.close()
      const errorMessage = `Failed to create Spaces client: ${error instanceof Error ? error.message : String(error)}`;
      if (isJsonMode) {
        this.outputJsonError(errorMessage, error);
        // Exit explicitly in JSON mode
        this.exit(1);
      } else {
        this.error(errorMessage);
      }

      return null // Unreachable, but required by TypeScript
    }
  }
} 