import { AblyBaseCommand } from './base-command.js'
import * as Ably from 'ably'
import { ChatClient } from '@ably/chat'

export abstract class ChatBaseCommand extends AblyBaseCommand {
  protected async createChatClient(flags: any): Promise<{ chatClient: ChatClient, realtimeClient: Ably.Realtime } | null> {
    // Create Ably Realtime client first
    const realtimeClient = await this.createAblyClient(flags)
    
    if (!realtimeClient) {
      this.error('Failed to create Ably client. Please check your API key and try again.')
      return null
    }
    
    try {
      // Create Chat client using the Realtime client
      const chatClient = new ChatClient(realtimeClient)
      return { chatClient, realtimeClient }
    } catch (error) {
      // Close the Realtime connection if Chat client creation fails
      realtimeClient.close()
      this.error(`Failed to create Chat client: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }
} 