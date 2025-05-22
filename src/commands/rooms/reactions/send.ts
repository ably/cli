import { RoomStatus, ChatClient, RoomStatusChange } from "@ably/chat";
import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { ChatBaseCommand } from "../../../chat-base-command.js";

export default class RoomsReactionsSend extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: "The room ID to send the reaction to",
      required: true,
    }),
    emoji: Args.string({
      description: "The emoji reaction to send (e.g. 👍, ❤️, 😂)",
      required: true,
    }),
  };

  static override description = "Send a reaction in a chat room";

  static override examples = [
    "$ ably rooms reactions send my-room 👍",
    '$ ably rooms reactions send --api-key "YOUR_API_KEY" my-room 🎉',
    "$ ably rooms reactions send my-room ❤️ --json",
    "$ ably rooms reactions send my-room 😂 --pretty-json",
  ];

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    metadata: Flags.string({
      description:
        "Additional metadata to send with the reaction (as JSON string)",
      required: false,
    }),
  };

  private ablyClient: Ably.Realtime | null = null;
  private chatClient: ChatClient | null = null;
  private unsubscribeStatusFn: (() => void) | null = null;
  private metadataObj: Record<string, unknown> | null = null;

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
    const { args, flags } = await this.parse(RoomsReactionsSend);
    const { roomId, emoji } = args;

    try {
      // Parse metadata if provided
      if (flags.metadata) {
        try {
          this.metadataObj = JSON.parse(flags.metadata);
          this.logCliEvent(
            flags,
            "reaction",
            "metadataParsed",
            "Metadata parsed successfully",
            { metadata: this.metadataObj },
          );
        } catch (error) {
          const errorMsg = `Invalid metadata JSON: ${error instanceof Error ? error.message : String(error)}`;
          this.logCliEvent(flags, "reaction", "metadataParseError", errorMsg, {
            error: errorMsg,
            roomId,
          });
          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput(
                { error: errorMsg, roomId, success: false },
                flags,
              ),
            );
          } else {
            this.error(errorMsg);
          }

          return;
        }
      }

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
      const room = await this.chatClient.rooms.get(roomId, {});
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

      // Send the reaction
      this.logCliEvent(
        flags,
        "reaction",
        "sending",
        `Sending reaction ${emoji}`,
        { emoji, metadata: this.metadataObj || {} },
      );
      await room.reactions.send({
        type: emoji,
        metadata: this.metadataObj || {},
      });
      this.logCliEvent(
        flags,
        "reaction",
        "sent",
        `Successfully sent reaction ${emoji}`,
      );

      // Format the response
      const resultData = {
        emoji,
        metadata: this.metadataObj,
        roomId,
        success: true,
      };

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput(resultData, flags));
      } else {
        this.log(
          `${chalk.green("✓")} Sent reaction ${emoji} in room ${chalk.cyan(roomId)}`,
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
        `Failed to send reaction: ${errorMsg}`,
        { error: errorMsg, roomId, emoji },
      );

      // Close the connection in case of error
      if (this.ablyClient) {
        this.ablyClient.close();
      }

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { error: errorMsg, roomId, emoji, success: false },
            flags,
          ),
        );
      } else {
        this.error(`Failed to send reaction: ${errorMsg}`);
      }
    }
  }
}
