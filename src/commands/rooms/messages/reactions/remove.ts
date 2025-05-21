import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import { ChatClient, RoomStatus, RoomStatusChange, MessageReactionType } from "@ably/chat";
import chalk from "chalk";

import { ChatBaseCommand } from "../../../../chat-base-command.js";

// Map CLI-friendly type names to SDK MessageReactionType values
const REACTION_TYPE_MAP: Record<string, MessageReactionType> = {
  unique: MessageReactionType.Unique,
  distinct: MessageReactionType.Distinct,
  multiple: MessageReactionType.Multiple,
};

interface MessageReactionResult {
  [key: string]: unknown;
  success: boolean;
  roomId: string;
  messageSerial?: string;
  reaction?: string;
  type?: string;
  error?: string;
}

export default class MessagesReactionsRemove extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: "The room ID where the message is located",
      required: true,
    }),
    messageSerial: Args.string({
      description: "The serial ID of the message to remove reaction from",
      required: true,
    }),
    reaction: Args.string({
      description: "The reaction to remove (e.g. 👍, ❤️, 😂)",
      required: true,
    }),
  };

  static override description = "Remove a reaction from a message in a chat room";

  static override examples = [
    "$ ably rooms messages reactions remove my-room message-serial 👍",
    '$ ably rooms messages reactions remove --api-key "YOUR_API_KEY" my-room message-serial ❤️',
    "$ ably rooms messages reactions remove my-room message-serial 👍 --type unique",
    "$ ably rooms messages reactions remove my-room message-serial 👍 --json",
  ];

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    type: Flags.string({
      description: "The type of reaction (unique, distinct, or multiple)",
      options: Object.keys(REACTION_TYPE_MAP),
    }),
  };

  private ablyClient: Ably.Realtime | null = null;
  private chatClient: ChatClient | null = null;
  private unsubscribeStatusFn: (() => void) | null = null;

  async finally(err: Error | undefined): Promise<void> {
    if (this.unsubscribeStatusFn) {
      try {
        this.unsubscribeStatusFn();
      } catch {
        /* ignore */
      }
    }
    if (
      this.ablyClient &&
      this.ablyClient.connection.state !== "closed" &&
      this.ablyClient.connection.state !== "failed"
    ) {
      this.ablyClient.close();
    }

    return super.finally(err);
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(MessagesReactionsRemove);
    const { roomId, messageSerial, reaction } = args;

    try {
      // Create Chat client
      this.chatClient = await this.createChatClient(flags);
      // Also get the underlying Ably client for connection state changes
      this.ablyClient = await this.createAblyClient(flags);

      if (!this.chatClient) {
        this.error("Failed to create Chat client");
        return;
      }
      if (!this.ablyClient) {
        this.error("Failed to create Ably client");
        return;
      }

      // Add listeners for connection state changes
      this.ablyClient.connection.on(
        (stateChange: Ably.ConnectionStateChange) => {
          this.logCliEvent(
            flags,
            "connection",
            stateChange.current,
            `Realtime connection state changed to ${stateChange.current}`,
            { reason: stateChange.reason },
          );
        },
      );

      // Get the room
      this.logCliEvent(
        flags,
        "room",
        "gettingRoom",
        `Getting room handle for ${roomId}`,
      );
      const room = await this.chatClient.rooms.get(roomId);
      this.logCliEvent(
        flags,
        "room",
        "gotRoom",
        `Got room handle for ${roomId}`,
      );

      // Subscribe to room status changes
      this.logCliEvent(
        flags,
        "room",
        "subscribingToStatus",
        "Subscribing to room status changes",
      );
      const { off: unsubscribeStatus } = room.onStatusChange(
        (statusChange: RoomStatusChange) => {
          let reason: Error | null | string | undefined;
          if (statusChange.current === RoomStatus.Failed) {
            reason = room.error; // Get reason from room.error on failure
          }

          const reasonMsg = reason instanceof Error ? reason.message : reason;
          this.logCliEvent(
            flags,
            "room",
            `status-${statusChange.current}`,
            `Room status changed to ${statusChange.current}`,
            { reason: reasonMsg },
          );

          if (
            statusChange.current === RoomStatus.Failed &&
            !this.shouldOutputJson(flags)
          ) {
            this.error(
              `Failed to attach to room: ${reasonMsg || "Unknown error"}`,
            );
          }
        },
      );
      this.unsubscribeStatusFn = unsubscribeStatus;
      this.logCliEvent(
        flags,
        "room",
        "subscribedToStatus",
        "Successfully subscribed to room status changes",
      );

      // Attach to the room
      this.logCliEvent(
        flags,
        "room",
        "attaching",
        `Attaching to room ${roomId}`,
      );
      await room.attach();
      this.logCliEvent(
        flags,
        "room",
        "attached",
        `Successfully attached to room ${roomId}`,
      );

      // Remove the reaction
      this.logCliEvent(
        flags,
        "reaction",
        "removing",
        `Removing reaction ${reaction} from message`,
        {
          messageSerial,
          reaction,
          ...(flags.type && { type: flags.type }),
        }
      );

      // Use delete method instead of remove
      await room.messages.reactions.delete(
        { serial: messageSerial }, 
        { 
          name: reaction,
          ...(flags.type && { type: REACTION_TYPE_MAP[flags.type] }),
        }
      );
      
      this.logCliEvent(
        flags,
        "reaction",
        "removed",
        `Successfully removed reaction ${reaction} from message`,
      );

      // Format the response
      const resultData: MessageReactionResult = {
        messageSerial,
        reaction,
        roomId,
        success: true,
        ...(flags.type && { type: flags.type }),
      };

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput(resultData, flags));
      } else {
        this.log(
          `${chalk.green("✓")} Removed reaction ${chalk.yellow(reaction)} from message ${chalk.cyan(messageSerial)} in room ${chalk.cyan(roomId)}`,
        );
      }

      // Clean up resources
      this.logCliEvent(flags, "room", "releasing", `Releasing room ${roomId}`);
      await this.chatClient.rooms.release(roomId);
      this.logCliEvent(flags, "room", "released", `Released room ${roomId}`);

      this.logCliEvent(
        flags,
        "connection",
        "closing",
        "Closing Realtime connection",
      );
      this.ablyClient.close();
      this.logCliEvent(
        flags,
        "connection",
        "closed",
        "Realtime connection closed",
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "reaction",
        "error",
        `Failed to remove reaction: ${errorMsg}`,
        { error: errorMsg, roomId, messageSerial, reaction },
      );

      // Close the connection in case of error
      if (this.ablyClient) {
        this.ablyClient.close();
      }

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { 
              error: errorMsg, 
              roomId, 
              messageSerial, 
              reaction,
              ...(flags.type && { type: flags.type }), 
              success: false 
            },
            flags,
          ),
        );
      } else {
        this.error(`Failed to remove reaction: ${errorMsg}`);
      }
    }
  }
}
