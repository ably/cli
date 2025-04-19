import { ChatClient } from "@ably/chat";

import { AblyBaseCommand } from "./base-command.js";
import { BaseFlags } from "./types/cli.js";

export abstract class ChatBaseCommand extends AblyBaseCommand {
  /**
   * Create a Chat client and associated resources
   */
  protected async createChatClient(
    flags: BaseFlags,
  ): Promise<ChatClient | null> {
    // Create Ably Realtime client first
    const realtimeClient = await this.createAblyClient(flags);

    if (!realtimeClient) {
      return null;
    }

    // Use the Ably client to create the Chat client
    return new ChatClient(realtimeClient);
  }
}
