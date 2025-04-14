import { AblyBaseCommand } from './base-command.js'
import * as Ably from 'ably'
import { ChatClient } from '@ably/chat'

export abstract class ChatBaseCommand extends AblyBaseCommand {
  protected async createChatClient(flags: any): Promise<{ chatClient: ChatClient, realtimeClient: Ably.Realtime } | null> {
    const isJsonMode = this.shouldOutputJson(flags);
    // Create Ably Realtime client first
    // Error handling within createAblyClient already handles JSON output
    const realtimeClient = await this.createAblyClient(flags)

    if (!realtimeClient) {
      // createAblyClient handles error output (including JSON) before returning null
      return null
    }

    try {
      // Create Chat client using the Realtime client
      const chatClient = new ChatClient(realtimeClient)
      this.logCliEvent(flags, 'ChatClient', 'init', 'Chat client initialized successfully.');
      return { chatClient, realtimeClient }
    } catch (error: unknown) {
      // Close the Realtime connection if Chat client creation fails
      realtimeClient.close()
      const errorMessage = `Failed to create Chat client: ${error instanceof Error ? error.message : String(error)}`;
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