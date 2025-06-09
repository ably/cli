import { Args, Flags } from "@oclif/core";
import * as Ably from "ably";
import { Subscription, StatusSubscription, MessageEvent } from "@ably/chat"; // Import ChatClient and StatusSubscription
import chalk from "chalk";

import { ChatBaseCommand } from "../../../chat-base-command.js";
import { waitUntilInterruptedOrTimeout } from "../../../utils/long-running.js";

// Define message interface
interface ChatMessage {
  clientId: string;
  text: string;
  timestamp: number | Date; // Support both timestamp types
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// Define status change interface
interface StatusChange {
  current: string;
  reason?: {
    message?: string;
    code?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Define room interface
interface ChatRoom {
  messages: {
    subscribe: (callback: (event: MessageEvent) => void) => Subscription;
  };
  onStatusChange: (callback: (statusChange: unknown) => void) => StatusSubscription;
  attach: () => Promise<void>;
  error?: {
    message?: string;
  };
}

// Define chat client interface
interface ChatClientType {
  rooms: {
    get: (roomId: string, options: Record<string, unknown>) => Promise<ChatRoom>;
    release: (roomId: string) => Promise<void>;
  };
  clientId?: string;
}

export default class MessagesSubscribe extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: "The room ID to subscribe to messages from",
      required: true,
    }),
  };

  static override description = "Subscribe to messages in an Ably Chat room";

  static override examples = [
    "$ ably rooms messages subscribe my-room",
    '$ ably rooms messages subscribe --api-key "YOUR_API_KEY" my-room',
    "$ ably rooms messages subscribe --show-metadata my-room",
    "$ ably rooms messages subscribe my-room --duration 30",
    "$ ably rooms messages subscribe my-room --json",
    "$ ably rooms messages subscribe my-room --pretty-json",
  ];

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    "show-metadata": Flags.boolean({
      default: false,
      description: "Display message metadata if available",
    }),
    duration: Flags.integer({
      description: "Automatically exit after the given number of seconds (0 = run indefinitely)",
      char: "D",
      required: false,
    }),
  };

  private ablyClient: Ably.Realtime | null = null; // Store Ably client for cleanup
  private messageSubscription: Subscription | null = null;
  private unsubscribeStatusFn: StatusSubscription | null = null;
  private chatClient: ChatClientType | null = null;
  private roomId: string | null = null;
  private cleanupInProgress: boolean = false;

  private async properlyCloseAblyClient(): Promise<void> {
    if (!this.ablyClient || this.ablyClient.connection.state === 'closed') {
      return;
    }

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('Ably client cleanup timed out after 2 seconds');
        resolve();
      }, 2000); // Reduced from 3000 to 2000

      const onClosed = () => {
        clearTimeout(timeout);
        resolve();
      };

      // Listen for both closed and failed states
      this.ablyClient!.connection.once('closed', onClosed);
      this.ablyClient!.connection.once('failed', onClosed);
      
      this.ablyClient!.close();
    });
  }

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    // Proper cleanup sequence
    try {
      // Release room if we haven't already
      if (this.chatClient && this.roomId) {
        await this.chatClient.rooms.release(this.roomId);
      }
    } catch {
      // Ignore release errors in cleanup
    }

    if (this.messageSubscription) {
      try {
        this.messageSubscription.unsubscribe();
      } catch {
        /* ignore */
      }
    }
    if (this.unsubscribeStatusFn) {
      try {
        this.unsubscribeStatusFn.off();
      } catch {
        /* ignore */
      }
    }
    
    // Close Ably client properly with timeout
    await this.properlyCloseAblyClient();

    // Ensure the process does not linger due to any stray async handles
    await super.finally(err);

    // Force a graceful exit shortly after cleanup to avoid hanging (skip in tests)
    if (process.env.NODE_ENV !== 'test') {
      setTimeout(() => {
        process.exit(0);
      }, 100);
    }
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(MessagesSubscribe);
    this.roomId = args.roomId; // Store for cleanup
    this.logCliEvent(flags, "subscribe.run", "start", `Starting rooms messages subscribe for room: ${this.roomId}`);

    try {
      // Create clients
      this.logCliEvent(flags, "subscribe.auth", "attemptingClientCreation", "Attempting to create Chat and Ably clients.");
      // Create Chat client (which also creates the Ably client internally)
      this.chatClient = await this.createChatClient(flags) as ChatClientType;
      // Get the underlying Ably client for cleanup and state listeners
      this.ablyClient = this._chatRealtimeClient;
      this.logCliEvent(flags, "subscribe.auth", "clientCreationSuccess", "Chat and Ably clients created.");
      
      if (!this.shouldOutputJson(flags)) {
        this.log(`Attaching to room: ${chalk.cyan(this.roomId)}...`);
      }

      if (!this.chatClient || !this.ablyClient) {
        throw new Error("Failed to create Chat or Ably client");
      }

      // Set up connection state logging
      this.setupConnectionStateLogging(this.ablyClient, flags, {
        includeUserFriendlyMessages: true
      });

      // Get the room
      this.logCliEvent(flags, "room", "gettingRoom", `Getting room handle for ${this.roomId}`);
      const room = await this.chatClient.rooms.get(this.roomId, {});
      this.logCliEvent(flags, "room", "gotRoom", `Got room handle for ${this.roomId}`);

      // Setup message handler
      this.logCliEvent(
        flags,
        "room",
        "subscribingToMessages",
        `Subscribing to messages in room ${this.roomId}`,
      );
      this.messageSubscription = room.messages.subscribe(
        (messageEvent: MessageEvent) => {
          const { message } = messageEvent;
          const messageLog: ChatMessage = {
            clientId: message.clientId,
            text: message.text,
            timestamp: message.timestamp,
            ...(message.metadata ? { metadata: message.metadata } : {}),
          };
          this.logCliEvent(flags, "message", "received", "Message received", {
            message: messageLog,
            roomId: this.roomId,
          });

          if (this.shouldOutputJson(flags)) {
            this.log(
              this.formatJsonOutput(
                {
                  message: messageLog,
                  roomId: this.roomId,
                  success: true,
                },
                flags,
              ),
            );
          } else {
            // Format message with timestamp, author and content
            const timestamp = new Date(message.timestamp).toLocaleTimeString();
            const author = message.clientId || "Unknown";

            // Message content with consistent formatting
            this.log(
              `${chalk.gray(`[${timestamp}]`)} ${chalk.cyan(`${author}:`)} ${message.text}`,
            );

            // Show metadata if enabled and available
            if (flags["show-metadata"] && message.metadata) {
              this.log(
                `${chalk.blue("  Metadata:")} ${chalk.yellow(this.formatJsonOutput(message.metadata, flags))}`,
              );
            }

            this.log(""); // Empty line for better readability
          }
        },
      );
      this.logCliEvent(
        flags,
        "room",
        "subscribedToMessages",
        `Successfully subscribed to messages in room ${this.roomId}`,
      );

      // Subscribe to room status changes
      this.logCliEvent(flags, "room", "subscribingToStatus", `Subscribing to status changes for room ${this.roomId}`);
      this.unsubscribeStatusFn = room.onStatusChange(
        (statusChange: unknown) => {
          const change = statusChange as StatusChange;
          this.logCliEvent(flags, "room", `status-${change.current}`, `Room status changed to ${change.current}`, { reason: change.reason, roomId: this.roomId });
          if (change.current === "attached") {
            this.logCliEvent(flags, "room", "statusAttached", "Room status is ATTACHED.");
            // Log the ready signal for E2E tests
            this.log(`Connected to room: ${this.roomId}`);
            if (!this.shouldOutputJson(flags)) {
              this.log(chalk.green(`✓ Subscribed to room: ${chalk.cyan(this.roomId)}. Listening for messages...`));
            }
            // If we want to suppress output, we just don't log anything
          } else if (change.current === "failed") {
            const errorMsg = room.error?.message || "Unknown error";
            if (this.shouldOutputJson(flags)) {
              // Logged via logCliEvent
            } else {
              this.error(`Failed to attach to room: ${errorMsg}`);
            }
          }
        },
      );
      this.logCliEvent(
        flags,
        "room",
        "subscribedToStatus",
        `Successfully subscribed to status changes for room ${this.roomId}`,
      );

      // Attach to the room
      this.logCliEvent(flags, "room", "attaching", `Attaching to room ${this.roomId}`);
      await room.attach();
      this.logCliEvent(flags, "room", "attachCallComplete", `room.attach() call complete for ${this.roomId}. Waiting for status change to 'attached'.`);
      // Note: successful attach logged by onStatusChange handler

      this.logCliEvent(
        flags,
        "subscribe",
        "listening",
        "Now listening for messages and status changes",
      );
      
      // Wait until the user interrupts or the optional duration elapses
      const effectiveDuration =
        typeof flags.duration === "number" && flags.duration > 0
          ? flags.duration
          : process.env.ABLY_CLI_DEFAULT_DURATION
          ? Number(process.env.ABLY_CLI_DEFAULT_DURATION)
          : undefined;

      const exitReason = await waitUntilInterruptedOrTimeout(effectiveDuration);
      this.logCliEvent(flags, "subscribe", "runComplete", "Exiting wait loop", { exitReason });
      this.cleanupInProgress = exitReason === "signal"; // mark if signal so finally knows
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(
        flags,
        "subscribe",
        "fatalError",
        `Failed to subscribe to messages: ${errorMsg}`,
        { error: errorMsg, roomId: this.roomId },
      );
      // Close the connection in case of error
      if (this.ablyClient) {
        this.ablyClient.close();
      }

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            { error: errorMsg, roomId: this.roomId, success: false },
            flags,
          ),
        );
      } else {
        this.error(`Failed to subscribe to messages: ${errorMsg}`);
      }
    } finally {
      // Wrap all cleanup in a timeout to prevent hanging
      await Promise.race([
        this.performCleanup(flags || {}),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            this.logCliEvent(flags || {}, "subscribe", "cleanupTimeout", "Cleanup timed out after 5s, forcing completion");
            resolve();
          }, 5000);
        })
      ]);

      this.logCliEvent(
        flags || {},
        "subscribe",
        "cleanupComplete",
        "Cleanup complete",
      );
      // Don't show cleanup messages for minimal output
    }
  }

  private async performCleanup(flags: Record<string, unknown>): Promise<void> {
    // Unsubscribe from messages with timeout
    if (this.messageSubscription) {
      try {
        this.logCliEvent(
          flags,
          "room",
          "unsubscribingMessages",
          "Unsubscribing from messages",
        );
        await Promise.race([
          Promise.resolve(this.messageSubscription.unsubscribe()),
          new Promise<void>((resolve) => setTimeout(resolve, 1000))
        ]);
        this.logCliEvent(
          flags,
          "room",
          "unsubscribedMessages",
          "Unsubscribed from messages",
        );
      } catch (error) {
        this.logCliEvent(
          flags,
          "room",
          "unsubscribeMessagesError",
          "Error unsubscribing messages",
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    // Unsubscribe from status with timeout
    if (this.unsubscribeStatusFn) {
      try {
        this.logCliEvent(
          flags,
          "room",
          "unsubscribingStatus",
          "Unsubscribing from status changes",
        );
        await Promise.race([
          Promise.resolve(this.unsubscribeStatusFn.off()),
          new Promise<void>((resolve) => setTimeout(resolve, 1000))
        ]);
        this.logCliEvent(
          flags,
          "room",
          "unsubscribedStatus",
          "Unsubscribed from status changes",
        );
      } catch (error) {
        this.logCliEvent(
          flags,
          "room",
          "unsubscribeStatusError",
          "Error unsubscribing status",
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    // Release the room with timeout
    try {
      if (this.chatClient && this.roomId) {
        this.logCliEvent(
          flags,
          "room",
          "releasing",
          `Releasing room ${this.roomId}`,
        );
        await Promise.race([
          this.chatClient.rooms.release(this.roomId),
          new Promise<void>((resolve) => setTimeout(resolve, 2000))
        ]);
        this.logCliEvent(
          flags,
          "room",
          "released",
          `Room ${this.roomId} released`,
        );
      }
    } catch (error) {
      this.logCliEvent(
        flags,
        "room",
        "releaseError",
        `Error releasing room: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
      );
    }

    // Close Ably client properly with timeout (already has internal timeout)
    await this.properlyCloseAblyClient();
  }
}
