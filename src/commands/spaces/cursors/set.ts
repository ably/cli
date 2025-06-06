import { type Space } from "@ably/spaces";
import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import chalk from "chalk";

import { SpacesBaseCommand } from "../../../spaces-base-command.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

// Define cursor types based on Ably documentation
interface CursorPosition {
  x: number;
  y: number;
}

interface CursorData {
  [key: string]: unknown;
}

// CursorUpdate interface no longer required in this file

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
    duration: Flags.integer({
      description:
        "Automatically exit after the given number of seconds (0 = exit immediately after setting the cursor)",
      char: "D",
      required: false,
    }),
  };

  private cleanupInProgress = false;
  private realtimeClient: Ably.Realtime | null = null;
  private spacesClient: unknown | null = null;
  private space: Space | null = null;
  private simulationIntervalId: NodeJS.Timeout | null = null;
  private cursorData: Record<string, unknown> | null = null;
  private unsubscribeStatusFn?: () => void;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    // For E2E tests, skip cleanup to avoid hanging
    if (process.env.E2E_ABLY_API_KEY !== undefined) {
      return;
    }

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

    // Check if we're in E2E mode (no duration flag, so use env var detection)
    const isE2EMode = process.env.E2E_ABLY_API_KEY !== undefined;
    
    if (isE2EMode) {
      // Set up unhandled promise rejection handler for E2E mode
      process.on('unhandledRejection', (reason) => {
        console.error('Unhandled promise rejection:', reason);
        process.exit(1);
      });
    }

    try {
      // Validate and parse cursor data
      if (!flags.data) {
        this.error("Cursor data is required. Use --data flag with position and optional data.");
        return;
      }

      let cursorData: Record<string, unknown>;
      try {
        cursorData = JSON.parse(flags.data);
      } catch {
        this.error("Invalid JSON in --data flag. Expected format: {\"position\":{\"x\":number,\"y\":number},\"data\":{...}}");
        return;
      }

      // Validate position
      if (!cursorData.position || 
          typeof (cursorData.position as Record<string, unknown>).x !== 'number' || 
          typeof (cursorData.position as Record<string, unknown>).y !== 'number') {
        this.error("Invalid cursor position. Expected format: {\"position\":{\"x\":number,\"y\":number}}");
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
        "Successfully entered space",
        { clientId: this.realtimeClient!.auth.clientId },
      );

      const { position, data } = cursorData as { position: CursorPosition; data?: CursorData };

      const cursorForOutput = { position, ...(data ? { data } : {}) };

      // Workaround for known SDK issue: cursors.set() fails if the underlying ::$cursors channel is not attached
      // This will be fixed upstream in the Spaces SDK - see https://github.com/ably/spaces/pull/339
      this.logCliEvent(flags, "cursor", "waitingForChannelAttachment", "Waiting for cursors channel to attach");
      
      // First, trigger channel creation by accessing the cursors API
      // This ensures the channel exists before we try to wait for it to attach
      try {
        await this.space.cursors.getAll();
        this.logCliEvent(flags, "cursor", "channelCreated", "Cursors channel created via getAll()");
      } catch (error) {
        // getAll() might fail if no cursors exist yet, but it should still create the channel
        this.logCliEvent(flags, "cursor", "channelCreationAttempted", "Attempted to create cursors channel", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Now wait for the channel to be attached
      if (this.space.cursors.channel) {
        await new Promise<void>((resolve, reject) => {
          const channel = this.space!.cursors.channel;
          
          if (!channel) {
            reject(new Error("Cursors channel is not available"));
            return;
          }
          
          if (channel.state === "attached") {
            this.logCliEvent(flags, "cursor", "channelAlreadyAttached", "Cursors channel already attached");
            resolve();
            return;
          }
          
          const timeout = setTimeout(() => {
            channel.off("attached", onAttached);
            channel.off("failed", onFailed);
            reject(new Error("Timeout waiting for cursors channel to attach"));
          }, 10000); // 10 second timeout
          
          const onAttached = () => {
            clearTimeout(timeout);
            channel.off("attached", onAttached);
            channel.off("failed", onFailed);
            this.logCliEvent(flags, "cursor", "channelAttached", "Cursors channel attached successfully");
            resolve();
          };
          
          const onFailed = (stateChange: Ably.ChannelStateChange) => {
            clearTimeout(timeout);
            channel.off("attached", onAttached);
            channel.off("failed", onFailed);
            reject(new Error(`Cursors channel failed to attach: ${stateChange.reason?.message || 'Unknown error'}`));
          };
          
          channel.on("attached", onAttached);
          channel.on("failed", onFailed);
          
          this.logCliEvent(flags, "cursor", "waitingForAttachment", `Cursors channel state: ${channel.state}, waiting for attachment`);
        });
      } else {
        // If channel still doesn't exist after getAll(), log a warning but continue
        this.logCliEvent(flags, "cursor", "channelNotAvailable", "Warning: cursors channel not available after creation attempt");
      }

      // Set cursor position
      await this.space.cursors.set(cursorForOutput);

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
              cursor: cursorForOutput,
              spaceId,
              success: true,
            },
            flags,
          ),
        );
      } else {
        this.log(
          `${chalk.green("✓")} Set cursor in space ${chalk.cyan(spaceId)} with data: ${chalk.blue(JSON.stringify(cursorForOutput))}`,
        );
      }

      // Decide how long to remain connected
      const effectiveDuration =
        typeof flags.duration === "number"
          ? flags.duration
          : process.env.ABLY_CLI_DEFAULT_DURATION
          ? Number(process.env.ABLY_CLI_DEFAULT_DURATION)
          : undefined;

      if (isE2EMode || effectiveDuration === 0) {
        // Give Ably a moment to propagate the cursor update before exiting so that
        // subscribers in automated tests have a chance to receive the event.
        await new Promise(resolve => setTimeout(resolve, 600));

        // In E2E / immediate exit mode, we don't keep the process alive beyond this.
        process.exit(0);
      }

      // Inform the user and wait until interrupted or timeout (if provided)
      this.logCliEvent(
        flags,
        "cursor",
        "waiting",
        "Cursor set – waiting for further instructions",
        { duration: effectiveDuration ?? "indefinite" },
      );

      if (!this.shouldOutputJson(flags)) {
        this.log(
          effectiveDuration
            ? `Waiting ${effectiveDuration}s before exiting… Press Ctrl+C to exit sooner.`
            : `Cursor set. Press Ctrl+C to exit.`,
        );
      }

      const exitReason = await waitUntilInterruptedOrTimeout(effectiveDuration);
      this.logCliEvent(
        flags,
        "cursor",
        "waitingComplete",
        "Exiting wait loop",
        { exitReason },
      );

      this.cleanupInProgress = true;
      // After cleanup (handled in finally), ensure the process exits so user doesn't need multiple Ctrl-C
      process.exit(0);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, "cursor", "setError", errorMsg, {
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
        this.error(`Failed to set cursor: ${errorMsg}`);
      }
    } finally {
      // Leave space and close connection (unless in E2E mode where we force exit)
      if (!isE2EMode && !this.cleanupInProgress) {
        if (this.space) {
          try {
            await this.space.leave();
          } catch {
            // ignore
          }
        }
        if (this.realtimeClient) {
          try {
            this.realtimeClient.close();
          } catch {
            // ignore
          }
        }
      }
    }
  }
}
