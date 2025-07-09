import { Args } from "@oclif/core";
import * as Ably from "ably";
import { ChatClient, Room, OccupancyData } from "@ably/chat";
import { ChatBaseCommand } from "../../../chat-base-command.js";

export default class RoomsOccupancyGet extends ChatBaseCommand {
  static args = {
    roomId: Args.string({
      description: "Room ID to get occupancy for",
      required: true,
    }),
  };

  static description = "Get current occupancy metrics for a room";

  static examples = [
    "$ ably rooms occupancy get my-room",
    '$ ably rooms occupancy get --api-key "YOUR_API_KEY" my-room',
    "$ ably rooms occupancy get my-room --json",
    "$ ably rooms occupancy get my-room --pretty-json",
  ];

  static flags = {
    ...ChatBaseCommand.globalFlags,
  };

  private ablyClient: Ably.Realtime | null = null;
  private chatClient: ChatClient | null = null;
  private room: Room | null = null;

  private async forceCloseConnections(): Promise<void> {
    try {
      // First try to release the room
      if (this.room) {
        await Promise.race([
          this.room.detach(),
          new Promise(resolve => setTimeout(resolve, 1000)) // 1s timeout
        ]);
      }
    } catch {
      // Ignore detach errors
    }

    try {
      // Release room from chat client
      if (this.chatClient && this.room) {
        await Promise.race([
          this.chatClient.rooms.release(this.room.name),
          new Promise(resolve => setTimeout(resolve, 1000)) // 1s timeout
        ]);
      }
    } catch {
      // Ignore release errors
    }

    try {
      // Force close the Ably client
      if (this.ablyClient) {
        await Promise.race([
          new Promise<void>((resolve) => {
            if (this.ablyClient!.connection.state === 'closed') {
              resolve();
              return;
            }
            
            const onClosed = () => {
              resolve();
            };
            
            // Listen for closed and failed states
            this.ablyClient!.connection.once('closed', onClosed);
            this.ablyClient!.connection.once('failed', onClosed);
            this.ablyClient!.close();
            
            // Cleanup listeners after 2 seconds
            setTimeout(() => {
              this.ablyClient!.connection.off('closed', onClosed);
              this.ablyClient!.connection.off('failed', onClosed);
              resolve();
            }, 2000);
          }),
          new Promise<void>(resolve => setTimeout(resolve, 2000)) // 2s timeout
        ]);
      }
    } catch {
      // Ignore close errors
    }
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RoomsOccupancyGet);

    try {
      // Create Chat client
      this.chatClient = await this.createChatClient(flags);
      // Get the underlying Ably client for cleanup
      this.ablyClient = this._chatRealtimeClient;

      if (!this.chatClient) {
        this.error("Failed to create Chat client");
        return;
      }

      const { roomId } = args;

      // Get the room with occupancy enabled
      this.room = await this.chatClient.rooms.get(roomId, {});

      // Attach to the room to access occupancy with timeout
      await Promise.race([
        this.room.attach(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Room attach timeout')), 10000)
        )
      ]);

      // Get occupancy metrics using the Chat SDK's occupancy API
      const occupancyMetrics = await Promise.race([
        this.room.occupancy.get(),
        new Promise<OccupancyData>((_, reject) =>
          setTimeout(() => reject(new Error("Occupancy get timeout")), 5000),
        ),
      ]);

      // Output the occupancy metrics based on format
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              metrics: occupancyMetrics,
              roomId,
              success: true,
            },
            flags,
          ),
        );
      } else {
        this.log(`Occupancy metrics for room '${roomId}':\n`);
        this.log(`Connections: ${occupancyMetrics.connections ?? 0}`);

        this.log(`Presence Members: ${occupancyMetrics.presenceMembers ?? 0}`);
      }

    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              error: error instanceof Error ? error.message : String(error),
              roomId: args.roomId,
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(
          `Error fetching room occupancy: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      // Force cleanup with timeouts to ensure the command exits
      await this.forceCloseConnections();
      
      // Force exit after cleanup
      setTimeout(() => {
        if (process.env.NODE_ENV !== 'test') {
          process.exit(0);
        }
      }, 100);
    }
  }
}
