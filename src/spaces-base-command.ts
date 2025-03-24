import { AblyBaseCommand } from './base-command.js'
import * as Ably from 'ably'
// Import with type assertion to handle the nested default export
import SpacesModule from '@ably/spaces'
type SpacesConstructor = new (client: Ably.Realtime) => any;

export abstract class SpacesBaseCommand extends AblyBaseCommand {
  protected async createSpacesClient(flags: any): Promise<{ spacesClient: any, realtimeClient: Ably.Realtime } | null> {
    // Create Ably Realtime client first
    const realtimeClient = await this.createAblyClient(flags)
    
    if (!realtimeClient) {
      this.error('Failed to create Ably client. Please check your API key and try again.')
      return null
    }
    
    try {
      // Create Spaces client using the Realtime client
      // Use type assertion to handle the nested default export
      const Spaces = (SpacesModule as any).default as SpacesConstructor
      const spacesClient = new Spaces(realtimeClient)
      return { spacesClient, realtimeClient }
    } catch (error) {
      // Close the Realtime connection if Spaces client creation fails
      realtimeClient.close()
      this.error(`Failed to create Spaces client: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }
} 