import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";

import { StdioServerTransport as StdioConnection } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { URL } from "node:url";

import ChannelsHistory from "../commands/channels/history.js";
import ChannelsList from "../commands/channels/list.js";
import ChannelsPresenceSubscribe from "../commands/channels/presence/subscribe.js";
import ChannelsPublish from "../commands/channels/publish.js";
import ChannelsSubscribe from "../commands/channels/subscribe.js";
import { ConfigManager } from "../services/config-manager.js";
import Ably, { Connection } from "ably";
// Comment to explain why we're not using these directly but still need to import
// We need these types from control-api but using them through a different interface
import {
  ControlApi as _ImportedControlApi,
  App as ControlApp,
  Key as ControlKey,
} from "../services/control-api.js";

// Maximum execution time for long-running operations (15 seconds)
const MAX_EXECUTION_TIME = 15_000;

interface Message {
  clientId?: string;
  connectionId?: string;
  data: unknown;
  id: string;
  name: string;
  timestamp: number;
  isRewind?: boolean;
  [key: string]: unknown;
}

interface PresenceMember {
  action: number;
  clientId?: string;
  connectionId: string;
  data: unknown;
  id: string;
  timestamp: number;
  [key: string]: unknown;
}

interface ChannelInfo {
  name: string;
  occupancy: Record<string, unknown>;
  status: Record<string, unknown>;
  [key: string]: unknown;
}

// Define interfaces for Ably SDK responses

// Aliasing types directly from Ably namespace
type RealtimePresenceMessage = Ably.PresenceMessage;
type RealtimeMessage = Ably.Message;
type RealtimeHistoryParams = Ably.RealtimeHistoryParams;
type PaginatedResult<T> = Ably.PaginatedResult<T>;

// Simplified interfaces to avoid type compatibility issues
interface AblyChannel {
  presence: {
    get: () => Promise<RealtimePresenceMessage[]>;
  };
  history: (
    options?: RealtimeHistoryParams,
  ) => Promise<PaginatedResult<RealtimeMessage>>;
  subscribe: (callback: (message: RealtimeMessage) => void) => Promise<void>;
  unsubscribe: () => Promise<void>;
  publish: (name: string, data: unknown) => Promise<void>;
}

interface AblyClient {
  channels: {
    get: (channelName: string) => AblyChannel;
  };
  request: (
    method: string,
    path: string,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  connection: Connection;
}

interface ControlApiClient {
  listApps: () => Promise<ControlApp[]>;
  getAppStats: (appId: string, options?: GetStatsParams) => Promise<unknown>;
  listKeys: (appId: string) => Promise<ControlKey[]>;
}

// Define interfaces for parameters

// Define GetStatsParams based on Control API structure
interface GetStatsParams {
  unit?: "minute" | "hour" | "day" | "month";
  direction?: "forwards" | "backwards";
  limit?: number;
  start?: number; // epoch ms
  end?: number; // epoch ms
}

interface AppStatsParams {
  app?: string;
  end?: number;
  limit?: number;
  start?: number;
  unit?: "minute" | "hour" | "day" | "month";
}

interface PublishParams {
  channel: string;
  message: unknown;
  name?: string;
  [key: string]: unknown;
}

// Add types for command classes
type CommandClass =
  | typeof ChannelsList
  | typeof ChannelsHistory
  | typeof ChannelsPublish
  | typeof ChannelsSubscribe
  | typeof ChannelsPresenceSubscribe;

// Define the return type for executeCommand
type CommandResult =
  | Message[]
  | ChannelInfo[]
  | PresenceMember[]
  | { data: unknown; name: string };

// Define local types for resource parameters
type ParamsType = Record<string, string | string[] | undefined>;
type ListParamsType = { variables?: ParamsType; signal?: AbortSignal };

export class AblyMcpServer {
  private activeOperations: Set<AbortController> = new Set();
  private configManager: ConfigManager;
  private controlHost?: string;
  private server: McpServer;

  constructor(
    configManager: ConfigManager,
    options?: { controlHost?: string },
  ) {
    this.configManager = configManager;
    this.controlHost = options?.controlHost;

    // Initialize the MCP server
    this.server = new McpServer({
      name: "Ably CLI",
      version: process.env.npm_package_version || "1.0.0",
    });
  }

  public async start(): Promise<void> {
    console.error("Initializing MCP server...");

    // Set up client ID if not provided
    this.setupClientId();

    // Set up tools and resources
    this.setupTools();
    this.setupResources();

    // Create a stdio transport
    const transport = new StdioConnection();

    try {
      // Connect the server to the transport
      await this.server.connect(transport);

      console.error("MCP server ready, waiting for requests...");

      // Register signal handlers for graceful shutdown
      process.on("SIGINT", () => this.shutdown());
      process.on("SIGTERM", () => this.shutdown());
    } catch (error) {
      console.error("Error starting MCP server:", error);
      throw error;
    }
  }

  private async executeChannelsHistoryCommand(
    args: string[],
  ): Promise<Message[]> {
    try {
      // Parse arguments
      const channelName = args.find((arg) => !arg.startsWith("-")) || "";
      if (!channelName || channelName === "--json") {
        throw new Error("Channel name is required");
      }

      const limit = Number.parseInt(this.getArgValue(args, "--limit") || "100");
      const direction = this.getArgValue(args, "--direction") || "backwards";

      // Get Ably client
      const ably = await this.getAblyClient();

      // Get channel
      const channel = ably.channels.get(channelName);

      // Get history
      const historyPage: PaginatedResult<RealtimeMessage> =
        await channel.history({
          direction: direction as RealtimeHistoryParams["direction"],
          limit,
        });

      return historyPage.items.map((msg: RealtimeMessage) => ({
        clientId: msg.clientId,
        connectionId: msg.connectionId,
        data: msg.data,
        id: msg.id ?? `no-id-${Date.now()}`,
        name: msg.name ?? "no-name",
        timestamp: msg.timestamp ?? Date.now(),
      }));
    } catch (error: unknown) {
      console.error("Error getting channel history:", error);
      throw new Error(
        `Failed to get channel history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async executeChannelsListCommand(
    args: string[],
  ): Promise<ChannelInfo[]> {
    try {
      // Parse arguments
      const prefix = this.getArgValue(args, "--prefix");
      const limit = Number.parseInt(this.getArgValue(args, "--limit") || "100");

      // Get Ably client
      const ably = await this.getAblyClient();

      // Build params
      const params: Record<string, unknown> = { limit };
      if (prefix) params.prefix = prefix;

      // Make the API request
      const response = await ably.request("get", "/channels", params);

      if (response.statusCode !== 200) {
        throw new Error(`Failed to list channels: ${response.statusCode}`);
      }

      // Ensure response.items is an array before mapping
      const items = Array.isArray(response.items) ? response.items : [];

      // Map response to simplified format
      return items.map((channel: Record<string, unknown>) => ({
        name: channel.channelId as string,
        occupancy: channel.occupancy as Record<string, unknown>,
        status: (channel.status as Record<string, unknown>) || {},
      }));
    } catch (error: unknown) {
      console.error("Error listing channels:", error);
      throw new Error(
        `Failed to list channels: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async executeChannelsPresenceCommand(
    args: string[],
  ): Promise<PresenceMember[]> {
    try {
      // Parse arguments
      const channelName =
        args.find((arg) => !arg.startsWith("-") && arg !== "--json") || "";
      if (!channelName) {
        throw new Error("Channel name is required");
      }

      // Get Ably client
      const ably = await this.getAblyClient();

      // Get channel
      const channel = ably.channels.get(channelName);

      // Get presence members
      const presenceMembers = await channel.presence.get();

      return presenceMembers.map((member: RealtimePresenceMessage) => ({
        action:
          member.action === "present" || member.action === "enter" ? 1 : 0,
        clientId: member.clientId,
        connectionId: member.connectionId,
        data: member.data,
        id: member.id,
        timestamp: member.timestamp,
      }));
    } catch (error: unknown) {
      console.error("Error getting channel presence:", error);
      throw new Error(
        `Failed to get presence: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async executeChannelsPublishCommand(
    args: string[] | PublishParams,
  ): Promise<{ data: unknown; name: string }> {
    try {
      // Check if we're dealing with an array of arguments or an object
      let channelName: string;
      let message: unknown;
      let name: string | undefined;

      if (Array.isArray(args)) {
        // Parse arguments from command line
        channelName =
          args.find((arg) => !arg.startsWith("-") && arg !== "--json") || "";
        if (!channelName) {
          throw new Error("Channel name is required");
        }

        // Get message argument (next non-flag after channel name)
        const channelIndex = args.indexOf(channelName);
        message = args[channelIndex + 1];
        if (
          !message ||
          (typeof message === "string" && message.startsWith("-"))
        ) {
          throw new Error("Message is required");
        }

        // Try to parse as JSON if possible
        if (typeof message === "string") {
          try {
            message = JSON.parse(message);
          } catch {
            // Keep as string if not valid JSON
          }
        }

        name = this.getArgValue(args, "--name");
      } else if (typeof args === "object" && args !== null) {
        // Handle direct object parameters (from MCP tool)
        channelName = args.channel;
        message = args.message;
        name = args.name;

        if (!channelName) {
          throw new Error("Channel name is required");
        }

        if (message === undefined) {
          throw new Error("Message is required");
        }
      } else {
        throw new Error("Invalid arguments format");
      }

      // Get Ably client
      const ably = await this.getAblyClient();

      // Get channel and publish
      const channel = ably.channels.get(channelName);

      if (name) {
        await channel.publish(name, message);
        return { data: message, name };
      }

      // If message is already an object with name/data, use that
      if (
        typeof message === "object" &&
        message !== null &&
        "name" in message &&
        "data" in message
      ) {
        const msgName = String(message.name);
        await channel.publish(msgName, message.data);
        return { data: message.data, name: msgName };
      }

      // Default event name
      await channel.publish("message", message);
      return { data: message, name: "message" };
    } catch (error: unknown) {
      console.error("Error publishing to channel:", error);
      throw new Error(
        `Failed to publish message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async executeChannelsSubscribeCommand(
    args: string[],
    signal?: AbortSignal,
  ): Promise<Message[]> {
    try {
      // Parse arguments
      const channelName =
        args.find((arg) => !arg.startsWith("-") && arg !== "--json") || "";
      if (!channelName) {
        throw new Error("Channel name is required");
      }

      const rewind = Number.parseInt(this.getArgValue(args, "--rewind") || "0");

      // Get Ably client
      const ably = await this.getAblyClient();

      // Get channel
      const channel = ably.channels.get(channelName);

      // Subscribe for messages
      const messages: Message[] = [];

      // Create a promise that resolves when signal is aborted or timeout
      const abortPromise = new Promise<void>((resolve) => {
        if (signal) {
          signal.addEventListener("abort", () => resolve());
        }

        // Also set a timeout
        setTimeout(() => resolve(), MAX_EXECUTION_TIME);
      });

      // Create a promise for subscription
      const _subscribePromise = new Promise<Message[]>((_resolve) => {
        // Handle rewind if specified
        if (rewind > 0) {
          void (async () => {
            try {
              let currentPage: PaginatedResult<RealtimeMessage> | null =
                await channel.history({
                  direction: "backwards",
                  limit: rewind,
                });
              while (currentPage) {
                currentPage.items.forEach((msg: RealtimeMessage) => {
                  messages.push({
                    clientId: msg.clientId,
                    connectionId: msg.connectionId,
                    data: msg.data,
                    id: msg.id ?? `no-id-${Date.now()}`,
                    name: msg.name ?? "no-name",
                    timestamp: msg.timestamp ?? Date.now(),
                  });
                });

                if (!currentPage.hasNext()) {
                  break;
                }

                currentPage = await currentPage.next();
              }
            } catch (historyError) {
              console.error(
                "Error fetching history during rewind:",
                historyError,
              );
            }
          })();
        }

        // Subscribe to new messages
        const _subscription = channel.subscribe((msg: RealtimeMessage) => {
          messages.push({
            clientId: msg.clientId as string | undefined,
            connectionId: msg.connectionId as string,
            data: msg.data,
            id: msg.id as string,
            name: msg.name as string,
            timestamp: msg.timestamp as number,
          });
        });
      });

      // Wait for abort or timeout
      await abortPromise;

      // Unsubscribe
      await channel.unsubscribe();

      return messages;
    } catch (error: unknown) {
      console.error("Error subscribing to channel:", error);
      throw new Error(
        `Failed to subscribe: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async executeCommand(
    CommandClass: CommandClass,
    args: string[] | PublishParams,
    signal?: AbortSignal,
  ): Promise<CommandResult> {
    try {
      // Create direct execution functions for each command type
      if (CommandClass === ChannelsList) {
        return this.executeChannelsListCommand(
          Array.isArray(args) ? args : ["--json", args.channel],
        );
      }

      if (CommandClass === ChannelsHistory) {
        return this.executeChannelsHistoryCommand(
          Array.isArray(args) ? args : ["--json", args.channel],
        );
      }

      if (CommandClass === ChannelsPublish) {
        return this.executeChannelsPublishCommand(args);
      }

      if (CommandClass === ChannelsSubscribe) {
        return this.executeChannelsSubscribeCommand(
          Array.isArray(args) ? args : ["--json", args.channel],
          signal,
        );
      }

      if (CommandClass === ChannelsPresenceSubscribe) {
        return this.executeChannelsPresenceCommand(
          Array.isArray(args) ? args : ["--json", args.channel],
        );
      }

      throw new Error(`Unsupported command class: ${CommandClass.name}`);
    } catch (error) {
      console.error("Error executing command:", error);
      throw error;
    }
  }

  private async getAblyClient(): Promise<AblyClient> {
    try {
      // Assign the imported module to a variable first
      const AblyModule = await import("ably");
      const Ably = AblyModule.default;

      // Get API key from config
      const apiKey = this.configManager.getApiKey() || process.env.ABLY_API_KEY;

      if (!apiKey) {
        throw new Error(
          'No API key configured. Please run "ably login" or set ABLY_API_KEY environment variable',
        );
      }

      const clientOptions = {
        clientId: process.env.ABLY_CLIENT_ID,
        key: apiKey,
      };

      // Create Ably REST client (not Realtime, to avoid connections)
      // Note: We can't use createAblyRestClient here since this class doesn't extend AblyBaseCommand
      const client = new Ably.Rest(clientOptions);

      // Type assertion to ensure compatibility with our interface
      return client as unknown as AblyClient;
    } catch (error) {
      console.error("Error creating Ably client:", error);
      throw new Error(
        `Failed to create Ably client: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private getArgValue(args: string[], flag: string): string | undefined {
    const index = args.indexOf(flag);
    if (index !== -1 && index < args.length - 1) {
      return args[index + 1];
    }

    return undefined;
  }

  // Helper method to get a Control API instance
  private async getControlApi(): Promise<ControlApiClient> {
    try {
      const { ControlApi } = await import("../services/control-api.js");
      const accessToken =
        process.env.ABLY_ACCESS_TOKEN || this.configManager.getAccessToken();

      if (!accessToken) {
        throw new Error(
          'No access token configured. Please run "ably login" to authenticate.',
        );
      }

      return new ControlApi({
        accessToken,
        controlHost: this.controlHost || process.env.ABLY_CONTROL_HOST,
      });
    } catch (error: unknown) {
      console.error("Error creating Control API client:", error);
      throw new Error(
        `Failed to create Control API client: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private setupClientId(): void {
    // If client ID not provided, generate one with mcp prefix
    if (!process.env.ABLY_CLIENT_ID) {
      process.env.ABLY_CLIENT_ID = `mcp-${Math.random().toString(36).slice(2, 10)}`;
      console.error(`Generated client ID: ${process.env.ABLY_CLIENT_ID}`);
    }
  }

  private setupResources(): void {
    const resourceMethod = this.server.resource;

    // Channels resource
    resourceMethod(
      "channels",
      new ResourceTemplate("ably://channels/{prefix?}", {
        list: async (extra: ListParamsType) => {
          try {
            const args = ["--json"];
            const params = extra?.variables || {};
            const prefixParam = params.prefix;
            const prefix =
              typeof prefixParam === "string"
                ? prefixParam
                : Array.isArray(prefixParam)
                  ? prefixParam[0]
                  : undefined;
            if (prefix) args.push("--prefix", prefix);

            const commandResult = await this.executeCommand(ChannelsList, args);
            const channels: ChannelInfo[] = Array.isArray(commandResult)
              ? (commandResult as ChannelInfo[])
              : [];

            return {
              resources: channels.map((channel: ChannelInfo) => ({
                name: String(channel.name),
                uri: `ably://channels/${channel.name}`,
              })),
            };
          } catch (error) {
            console.error("Error listing channels:", error);
            throw new Error(
              `Failed to list channels: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      }),
      async (uri: URL, params: ParamsType) => {
        try {
          const args = ["--json"];
          const prefixParam = params.prefix;
          const prefix =
            typeof prefixParam === "string"
              ? prefixParam
              : Array.isArray(prefixParam)
                ? prefixParam[0]
                : undefined;
          if (prefix) args.push("--prefix", prefix);

          const commandResult = await this.executeCommand(ChannelsList, args);
          const channels: ChannelInfo[] = Array.isArray(commandResult)
            ? (commandResult as ChannelInfo[])
            : [];

          return {
            contents: channels.map((channel: ChannelInfo) => ({
              text: JSON.stringify(channel, null, 2),
              title: channel.name,
              uri: `ably://channels/${channel.name}`,
            })),
          };
        } catch (error) {
          console.error("Error fetching channels resource:", error);
          throw new Error(
            `Failed to fetch channels: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // Channel History Resource
    resourceMethod(
      "channel_history",
      new ResourceTemplate("ably://channel_history/{channel}", {
        list: undefined,
      }),
      async (uri: URL, params: ParamsType) => {
        try {
          const args = ["--json"];
          const channelParam = params.channel;
          const channel =
            typeof channelParam === "string"
              ? channelParam
              : Array.isArray(channelParam)
                ? channelParam[0]
                : undefined;
          if (channel) args.push(channel);

          const history = await this.executeCommand(ChannelsHistory, args);

          return {
            contents: [
              {
                text: JSON.stringify(history, null, 2),
                title: `Message history for ${params.channel}`,
                uri: uri.href,
              },
            ],
          };
        } catch (error) {
          console.error("Error fetching channel history resource:", error);
          throw new Error(
            `Failed to fetch channel history: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // Channel Presence Resource
    resourceMethod(
      "channel_presence",
      new ResourceTemplate("ably://channel_presence/{channel}", {
        list: undefined,
      }),
      async (uri: URL, params: ParamsType) => {
        try {
          const args = ["--json"];
          const channelParam = params.channel;
          const channel =
            typeof channelParam === "string"
              ? channelParam
              : Array.isArray(channelParam)
                ? channelParam[0]
                : undefined;
          if (channel) args.push(channel);

          const presence = await this.executeCommand(
            ChannelsPresenceSubscribe,
            args,
          );

          return {
            contents: [
              {
                text: JSON.stringify(presence, null, 2),
                title: `Presence members for ${params.channel}`,
                uri: uri.href,
              },
            ],
          };
        } catch (error) {
          console.error("Error fetching channel presence resource:", error);
          throw new Error(
            `Failed to fetch channel presence: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // Apps Resource
    resourceMethod(
      "apps",
      new ResourceTemplate("ably://apps", {
        list: async () => {
          try {
            const controlApi = await this.getControlApi();
            const apps = await controlApi.listApps();

            // Add the current app indicator
            const currentAppId = this.configManager.getCurrentAppId();

            return {
              resources: apps.map((app: ControlApp) => ({
                current: app.id === currentAppId,
                name: app.name,
                uri: `ably://apps/${app.id}`,
              })),
            };
          } catch (error) {
            console.error("Error listing apps:", error);
            throw new Error(
              `Failed to list apps: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      }),
      async (uri: URL) => {
        try {
          const controlApi = await this.getControlApi();
          const apps = await controlApi.listApps();

          // Add the current app indicator
          const currentAppId = this.configManager.getCurrentAppId();
          const appsWithCurrent = apps.map((app: ControlApp) => ({
            ...app,
            current: app.id === currentAppId,
          }));

          return {
            contents: [
              {
                text: JSON.stringify(appsWithCurrent, null, 2),
                title: "Ably Apps",
                uri: uri.href,
              },
            ],
          };
        } catch (error) {
          console.error("Error fetching apps resource:", error);
          throw new Error(
            `Failed to fetch apps: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // App Stats Resource
    resourceMethod(
      "app_stats",
      new ResourceTemplate("ably://apps/{appId}/stats", { list: undefined }),
      async (uri: URL, params: ParamsType) => {
        try {
          // Use the app ID from the URI or fall back to default
          const appIdParam = params.appId;
          const appId =
            (typeof appIdParam === "string"
              ? appIdParam
              : Array.isArray(appIdParam)
                ? appIdParam[0]
                : undefined) || this.configManager.getCurrentAppId();

          if (!appId) {
            throw new Error("No app ID provided and no default app selected");
          }

          const controlApi = await this.getControlApi();

          // Get stats for the last 24 hours
          const now = new Date();
          const start = now.getTime() - 24 * 60 * 60 * 1000; // 24 hours ago
          const end = now.getTime();

          const stats = await controlApi.getAppStats(appId as string, {
            end,
            limit: 10,
            start,
            unit: "minute",
          });

          return {
            contents: [
              {
                text: JSON.stringify(stats, null, 2),
                title: `Statistics for app ${appId}`,
                uri: uri.href,
              },
            ],
          };
        } catch (error) {
          console.error("Error fetching app stats resource:", error);
          throw new Error(
            `Failed to fetch app stats: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // App Keys Resource
    resourceMethod(
      "app_keys",
      new ResourceTemplate("ably://apps/{appId}/keys", { list: undefined }),
      async (uri: URL, params: ParamsType) => {
        try {
          // Use the app ID from the URI or fall back to default
          const appIdParam = params.appId;
          const appId =
            (typeof appIdParam === "string"
              ? appIdParam
              : Array.isArray(appIdParam)
                ? appIdParam[0]
                : undefined) || this.configManager.getCurrentAppId();

          if (!appId) {
            throw new Error("No app ID provided and no default app selected");
          }

          const controlApi = await this.getControlApi();
          const keys = await controlApi.listKeys(appId as string);

          // Add the current key indicator
          const currentKeyId = this.configManager.getKeyId(appId as string);
          const currentKeyName =
            currentKeyId && currentKeyId.includes(".")
              ? currentKeyId
              : currentKeyId
                ? `${appId}.${currentKeyId}`
                : undefined;

          const keysWithCurrent = keys.map((key: ControlKey) => {
            const keyName = `${key.appId}.${key.id}`;
            return {
              ...key,
              current: keyName === currentKeyName,
              keyName,
              capabilities: {}, // Add missing capabilities property
            };
          });

          return {
            contents: [
              {
                text: JSON.stringify(keysWithCurrent, null, 2),
                title: `API Keys for app ${appId}`,
                uri: uri.href,
              },
            ],
          };
        } catch (error) {
          console.error("Error fetching app keys resource:", error);
          throw new Error(
            `Failed to fetch app keys: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  }

  private setupTools(): void {
    // List Channels tool
    this.server.tool(
      "list_channels",
      "List active channels using the channel enumeration API",
      {
        limit: z
          .number()
          .optional()
          .describe("Maximum number of channels to return"),
        prefix: z.string().optional().describe("Filter channels by prefix"),
      },
      async (_params: { limit?: number; prefix?: string }) => {
        try {
          const result = await this.executeCommand(ChannelsList, [
            "--json",
            ...(_params.prefix ? ["--prefix", _params.prefix] : []),
            ...(_params.limit ? ["--limit", _params.limit.toString()] : []),
          ]);

          return {
            content: [
              {
                text: JSON.stringify(result, null, 2),
                type: "text",
              },
            ],
          };
        } catch (error) {
          console.error("Error listing channels:", error);
          throw new Error(
            `Failed to list channels: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // Channel History tool
    this.server.tool(
      "get_channel_history",
      "Retrieve message history for a channel",
      {
        channel: z.string().describe("Name of the channel to get history for"),
        direction: z
          .enum(["forwards", "backwards"])
          .optional()
          .describe("Direction of message history"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of messages to retrieve"),
      },
      async (_params: {
        channel: string;
        direction?: string;
        limit?: number;
      }) => {
        try {
          const args = ["--json", _params.channel];
          if (_params.limit) args.push("--limit", _params.limit.toString());
          if (_params.direction) args.push("--direction", _params.direction);

          const result = await this.executeCommand(ChannelsHistory, args);
          return {
            content: [
              {
                text: JSON.stringify(result, null, 2),
                type: "text",
              },
            ],
          };
        } catch (error) {
          console.error("Error getting channel history:", error);
          throw new Error(
            `Failed to get channel history: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // Publish to Channel tool
    this.server.tool(
      "publish_to_channel",
      "Publish a message to an Ably channel",
      {
        channel: z.string().describe("Name of the channel to publish to"),
        message: z
          .string()
          .describe("Message content to publish (can be string or JSON)"),
        name: z
          .string()
          .optional()
          .describe("Event name (optional, defaults to 'message')"),
      },
      async (_params: { channel: string; message: string; name?: string }) => {
        try {
          // Try to parse message as JSON if it's a string
          let messageContent = _params.message;
          if (typeof messageContent === "string") {
            try {
              messageContent = JSON.parse(messageContent);
            } catch {
              // Keep as string if not valid JSON
            }
          }

          // Create parameters object with parsed message
          const paramsWithParsedMessage = {
            ..._params,
            message: messageContent,
          };

          // Pass parameters in the format expected by executeChannelsPublishCommand
          const result = await this.executeChannelsPublishCommand(
            paramsWithParsedMessage,
          );
          return {
            content: [
              {
                text: JSON.stringify(result, null, 2),
                type: "text",
              },
            ],
          };
        } catch (error) {
          console.error("Error publishing to channel:", error);
          throw new Error(
            `Failed to publish to channel: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // Channel Presence tool
    this.server.tool(
      "get_channel_presence",
      "Get presence members for a channel",
      {
        channel: z.string().describe("Name of the channel to get presence for"),
      },
      async (_params: { channel: string }) => {
        try {
          const args = ["--json", _params.channel];

          const result = await this.executeCommand(
            ChannelsPresenceSubscribe,
            args,
          );
          return {
            content: [
              {
                text: JSON.stringify(result, null, 2),
                type: "text",
              },
            ],
          };
        } catch (error) {
          console.error("Error getting channel presence:", error);
          throw new Error(
            `Failed to get channel presence: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // Apps List tool
    this.server.tool(
      "list_apps",
      "List Ably apps within the current account",
      {
        format: z
          .enum(["json", "pretty"])
          .optional()
          .default("json")
          .describe("Output format (json or pretty)"),
      },
      async (_params: { format?: string }) => {
        try {
          // Create a Control API instance
          const controlApi = await this.getControlApi();

          // Get the apps
          const apps = await controlApi.listApps();

          // Add the current app indicator
          const currentAppId = this.configManager.getCurrentAppId();
          const appsWithCurrent = apps.map((app: ControlApp) => ({
            ...app,
            current: app.id === currentAppId,
          }));

          return {
            content: [
              {
                text: JSON.stringify(appsWithCurrent, null, 2),
                type: "text",
              },
            ],
          };
        } catch (error) {
          console.error("Error listing apps:", error);
          throw new Error(
            `Failed to list apps: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // Apps Stats tool
    this.server.tool(
      "get_app_stats",
      "Get statistics for an Ably app",
      {
        app: z
          .string()
          .optional()
          .describe(
            "App ID to get stats for (uses current app if not provided)",
          ),
        end: z
          .number()
          .optional()
          .describe("End time in milliseconds since epoch"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of stats records to return"),
        start: z
          .number()
          .optional()
          .describe("Start time in milliseconds since epoch"),
        unit: z
          .enum(["minute", "hour", "day", "month"])
          .optional()
          .default("minute")
          .describe("Time unit for stats"),
      },
      async (_params: AppStatsParams) => {
        try {
          // Use provided app ID or fall back to default app ID
          const appId = _params.app || this.configManager.getCurrentAppId();

          if (!appId) {
            throw new Error("No app ID provided and no default app selected");
          }

          // Create a Control API instance
          const controlApi = await this.getControlApi();

          // If no start/end time provided, use the last 24 hours
          const now = new Date();
          const start = _params.start || now.getTime() - 24 * 60 * 60 * 1000; // 24 hours ago
          const end = _params.end || now.getTime();

          // Get the stats
          const stats = await controlApi.getAppStats(appId, {
            end,
            limit: _params.limit,
            start,
            unit: _params.unit,
          });

          return {
            content: [
              {
                text: JSON.stringify(stats, null, 2),
                type: "text",
              },
            ],
          };
        } catch (error) {
          console.error("Error getting app stats:", error);
          throw new Error(
            `Failed to get app stats: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );

    // Auth Keys List tool
    this.server.tool(
      "list_auth_keys",
      "List API keys for an Ably app",
      {
        app: z
          .string()
          .optional()
          .describe(
            "App ID to list keys for (uses current app if not provided)",
          ),
      },
      async (_params: { app?: string }) => {
        try {
          // Get app ID from parameter or current config
          const appId = _params.app || this.configManager.getCurrentAppId();

          if (!appId) {
            throw new Error("No app specified");
          }

          // Create a Control API instance
          const controlApi = await this.getControlApi();

          // Get the keys
          const keys = await controlApi.listKeys(appId as string);

          // Add the current key indicator
          const currentKeyId = this.configManager.getKeyId(appId as string);
          const currentKeyName =
            currentKeyId && currentKeyId.includes(".")
              ? currentKeyId
              : currentKeyId
                ? `${appId}.${currentKeyId}`
                : undefined;

          const keysWithCurrent = keys.map((key: ControlKey) => {
            const keyName = `${key.appId}.${key.id}`;
            return {
              ...key,
              current: keyName === currentKeyName,
              keyName, // Add the full key name
              capabilities: {}, // Add missing capabilities property
            };
          });

          return {
            content: [
              {
                text: JSON.stringify(keysWithCurrent, null, 2),
                type: "text",
              },
            ],
          };
        } catch (error) {
          console.error("Error listing keys:", error);
          throw new Error(
            `Failed to list keys: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  }

  private shutdown(): void {
    console.error("MCP server shutting down...");

    // Abort any active operations
    for (const controller of this.activeOperations) {
      controller.abort();
    }

    // Exit process

    process.exit(0);
  }
}
