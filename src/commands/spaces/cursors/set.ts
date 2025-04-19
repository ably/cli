import Spaces from "@ably/spaces";
import { type Space } from "@ably/spaces";
import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { SpacesBaseCommand } from "../../../spaces-base-command.js";

// Define cursor types based on Ably documentation
interface CursorPosition {
  x: number;
  y: number;
}

interface CursorData {
  [key: string]: unknown;
}

// Update interfaces to match SDK expectations
interface CursorUpdate {
  data?: CursorData;
  position: CursorPosition;
}

export default class SpacesCursorsSet extends SpacesBaseCommand {
  static override args = {
    spaceId: Args.string({
      description: "The space ID to set cursor in",
      required: true,
    }),
  };

  static override description = "Set a cursor with position data in a space";

  static override examples = [
    '$ ably spaces cursors set my-space --data \'{"position": {"x": 100, "y": 200}}\'',
    '$ ably spaces cursors set my-space --data \'{"position": {"x": 100, "y": 200}, "data": {"name": "John", "color": "#ff0000"}}\'',
    '$ ably spaces cursors set --api-key "YOUR_API_KEY" my-space --data \'{"position": {"x": 100, "y": 200}}\'',
    '$ ably spaces cursors set my-space --data \'{"position": {"x": 100, "y": 200}}\' --json',
    '$ ably spaces cursors set my-space --data \'{"position": {"x": 100, "y": 200}}\' --pretty-json',
  ];

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    data: Flags.string({
      description: "The cursor data to set (as JSON string)",
      required: true,
    }),
  };

  private cleanupInProgress = false;
  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: Spaces | null = null;
  private space: Space | null = null;
  private simulationIntervalId: NodeJS.Timeout | null = null;
  private cursorData: Record<string, unknown> | null = null;
  private unsubscribeStatusFn?: () => void;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.simulationIntervalId) {
      clearInterval(this.simulationIntervalId);
      this.simulationIntervalId = null;
    }

    if (
      this.realtimeClient &&
      this.realtimeClient.connection.state !== "closed" &&
      this.realtimeClient.connection.state !== "failed"
    ) {
      this.realtimeClient.close();
    }

    return super.finally(err);
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesCursorsSet);
    const { spaceId } = args;

    try {
      // Parse cursor data
      try {
        this.cursorData = JSON.parse(flags.data);
        this.logCliEvent(
          flags,
          "cursor",
          "dataParsed",
          "Cursor data parsed successfully",
          { data: this.cursorData },
        );
      } catch (error) {
        const errorMsg = `Invalid cursor data JSON: ${error instanceof Error ? error.message : String(error)}`;
        this.logCliEvent(flags, "cursor", "dataParseError", errorMsg, {
          error: errorMsg,
          spaceId,
        });
        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput(
              { error: errorMsg, spaceId, success: false },
              flags,
            ),
          );
        } else {
          this.error(errorMsg);
        }

        return;
      }

      // Create Spaces client using setupSpacesClient
      const setupResult = await this.setupSpacesClient(flags, spaceId);
      this.realtimeClient = setupResult.realtimeClient;
      this.spacesClient = setupResult.spacesClient;
      this.space = setupResult.space;
      if (!this.realtimeClient || !this.spacesClient || !this.space) {
        const errorMsg = "Failed to create Spaces client";
        this.logCliEvent(flags, "spaces", "clientCreationFailed", errorMsg, {
          error: errorMsg,
          spaceId,
        });
        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput(
              { error: errorMsg, spaceId, success: false },
              flags,
            ),
          );
        } // Error already logged by createSpacesClient

        return;
      }

      // Add listeners for connection state changes
      this.realtimeClient.connection.on(
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

      // Monitor the space by watching the channel state instead
      this.logCliEvent(
        flags,
        "space",
        "monitoringChannel",
        "Monitoring space channel state",
      );
      const channelStateListener = (stateChange: Ably.ChannelStateChange) => {
        this.logCliEvent(
          flags,
          "space",
          `channel-${stateChange.current}`,
          `Space channel state: ${stateChange.current}`,
          {
            reason: stateChange.reason?.message,
          },
        );

        if (
          stateChange.current === "attached" &&
          !this.shouldOutputJson(flags)
        ) {
          this.log(
            `${chalk.green("Connected to space:")} ${chalk.cyan(spaceId)}`,
          );
        }
      };

      if (this.space.channel) {
        this.space.channel.on(channelStateListener);
      }

      // Enter the space
      this.logCliEvent(flags, "space", "entering", `Entering space ${spaceId}`);
      await this.space.enter();
      this.logCliEvent(
        flags,
        "space",
        "entered",
        `Successfully entered space ${spaceId}`,
      );

      // Set the cursor
      this.logCliEvent(
        flags,
        "cursor",
        "setting",
        "Setting cursor position",
        this.cursorData || {},
      );

      // Create cursor update based on input format
      let cursorUpdate: CursorUpdate;

      if (
        this.cursorData &&
        "position" in this.cursorData &&
        typeof this.cursorData.position === "object"
      ) {
        // User provided data in the correct format already
        cursorUpdate = this.cursorData as unknown as CursorUpdate;
      } else if (
        this.cursorData &&
        "x" in this.cursorData &&
        "y" in this.cursorData
      ) {
        // User provided x,y directly in the root object
        interface CursorDataWithXY {
          x: number | string;
          y: number | string;
          [key: string]: unknown;
        }
        const { x, y, ...restData } = this.cursorData as CursorDataWithXY;
        cursorUpdate = {
          position: { x: Number(x), y: Number(y) },
          data: Object.keys(restData).length > 0 ? restData : undefined,
        };
      } else {
        throw new Error(
          "Cursor data must include position object with x and y coordinates",
        );
      }

      await this.space.cursors.set(cursorUpdate);
      this.logCliEvent(
        flags,
        "cursor",
        "set",
        "Successfully set cursor position",
      );

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              cursor: cursorUpdate,
              spaceId,
              success: true,
            },
            flags,
          ),
        );
      } else {
        this.log(
          `${chalk.green("✓")} Set cursor in space ${chalk.cyan(spaceId)} with data: ${chalk.blue(JSON.stringify(cursorUpdate))}`,
        );
      }

      // Leave the space and disconnect
      this.logCliEvent(flags, "space", "leaving", `Leaving space ${spaceId}`);
      await this.space.leave();
      this.logCliEvent(
        flags,
        "space",
        "left",
        `Successfully left space ${spaceId}`,
      );

      // Remove channel listener
      if (this.space.channel) {
        this.space.channel.off(channelStateListener);
      }

      this.logCliEvent(
        flags,
        "connection",
        "closing",
        "Closing Realtime connection",
      );
      this.realtimeClient.close();
      this.logCliEvent(
        flags,
        "connection",
        "closed",
        "Successfully closed Realtime connection",
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "cursor",
        "fatalError",
        `Error setting cursor: ${errorMsg}`,
        { error: errorMsg, spaceId },
      );
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { error: errorMsg, spaceId, status: "error", success: false },
            flags,
          ),
        );
      } else {
        this.error(`Error: ${errorMsg}`);
      }

      // Clean up on error
      if (this.realtimeClient) {
        this.realtimeClient.close();
      }
    }
  }
}
