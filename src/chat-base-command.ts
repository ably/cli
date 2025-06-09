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
    // Mark auth info as shown before creating the Ably client
    // to prevent duplicate "Using..." output
    this.debug(`Setting _authInfoShown to true in createChatClient`);
    this._authInfoShown = true;
    
    // Create Ably Realtime client first
    const realtimeClient = await this.createAblyClient(flags);

    if (!realtimeClient) {
      return null;
    }

    // Store the realtime client for access by subclasses
    this._chatRealtimeClient = realtimeClient;

    // Use the Ably client to create the Chat client
    return new ChatClient(realtimeClient);
  }
}
