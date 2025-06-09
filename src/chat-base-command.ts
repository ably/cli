import { ChatClient } from "@ably/chat";
import * as Ably from "ably";

import { AblyBaseCommand } from "./base-command.js";
import { BaseFlags } from "./types/cli.js";

export abstract class ChatBaseCommand extends AblyBaseCommand {
  protected _chatRealtimeClient: Ably.Realtime | null = null;

  /**
   * Create a Chat client and associated resources
   */
  protected async createChatClient(
    flags: BaseFlags,
  ): Promise<ChatClient | null> {
    // Create Ably Realtime client first
    const realtimeClient = await this.createAblyClient(flags);
    
    // Mark auth info as shown after creating the client
    // to prevent duplicate "Using..." output on subsequent calls
    this._authInfoShown = true;

    if (!realtimeClient) {
      return null;
    }

    // Store the realtime client for access by subclasses
    this._chatRealtimeClient = realtimeClient;

    // Use the Ably client to create the Chat client
    return new ChatClient(realtimeClient);
  }
}
