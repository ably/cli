// @ts-nocheck
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import ChannelsList from '../commands/channels/list.js'
import ChannelsSubscribe from '../commands/channels/subscribe.js'
import ChannelsHistory from '../commands/channels/history.js'
import ChannelsPublish from '../commands/channels/publish.js'
import ChannelsPresenceSubscribe from '../commands/channels/presence/subscribe.js'
import { ConfigManager } from '../services/config-manager.js'
import { z } from 'zod'

// Maximum execution time for long-running operations (15 seconds)
const MAX_EXECUTION_TIME = 15000

export class AblyMcpServer {
  private configManager: ConfigManager
  private server: McpServer
  private activeOperations: Set<AbortController> = new Set()

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
    
    // Initialize the MCP server
    this.server = new McpServer({
      name: 'Ably CLI',
      version: process.env.npm_package_version || '1.0.0'
    })
  }

  private setupClientId(): void {
    // If client ID not provided, generate one with mcp prefix
    if (!process.env.ABLY_CLIENT_ID) {
      process.env.ABLY_CLIENT_ID = `mcp-${Math.random().toString(36).substring(2, 10)}`
      console.error(`Generated client ID: ${process.env.ABLY_CLIENT_ID}`)
    }
  }

  private setupTools(): void {
    // List Channels tool
    this.server.tool(
      "list_channels", 
      "List active channels using the channel enumeration API",
      {
        prefix: z.string().optional().describe("Filter channels by prefix"),
        limit: z.number().optional().describe("Maximum number of channels to return")
      },
      async (params) => {
        try {
          const result = await this.executeChannelsListCommand([
            '--json', 
            ...(params.prefix ? ['--prefix', params.prefix] : []),
            ...(params.limit ? ['--limit', params.limit.toString()] : [])
          ])
          
          return {
            content: [{ 
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error listing channels:', error)
          throw new Error(`Failed to list channels: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // Channel History tool
    this.server.tool(
      "get_channel_history", 
      "Retrieve message history for a channel",
      {
        channel: z.string().describe("Name of the channel to get history for"),
        limit: z.number().optional().describe("Maximum number of messages to retrieve"),
        direction: z.enum(["forwards", "backwards"]).optional().describe("Direction of message history")
      },
      async (params) => {
        try {
          const args = ['--json', params.channel]
          if (params.limit) args.push('--limit', params.limit.toString())
          if (params.direction) args.push('--direction', params.direction)
          
          const result = await this.executeChannelsHistoryCommand(args)
          return {
            content: [{ 
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error getting channel history:', error)
          throw new Error(`Failed to get channel history: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // Publish to Channel tool
    this.server.tool(
      "publish_to_channel", 
      "Publish a message to an Ably channel",
      {
        channel: z.string().describe("Name of the channel to publish to"),
        message: z.string().describe("Message content to publish (can be string or JSON)"),
        name: z.string().optional().describe("Event name (optional, defaults to 'message')")
      },
      async (params) => {
        try {
          // Try to parse message as JSON if it's a string
          let messageContent = params.message;
          if (typeof messageContent === 'string') {
            try {
              messageContent = JSON.parse(messageContent);
            } catch (e) {
              // Keep as string if not valid JSON
            }
          }
          
          // Create parameters object with parsed message
          const paramsWithParsedMessage = {
            ...params,
            message: messageContent
          };
          
          const result = await this.executeChannelsPublishCommand(paramsWithParsedMessage)
          return {
            content: [{ 
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error publishing to channel:', error)
          throw new Error(`Failed to publish to channel: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // Channel Presence tool
    this.server.tool(
      "get_channel_presence", 
      "Get presence members for a channel",
      {
        channel: z.string().describe("Name of the channel to get presence for")
      },
      async (params) => {
        try {
          const args = ['--json', params.channel]
          
          const result = await this.executeChannelsPresenceCommand(args)
          return {
            content: [{ 
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error getting channel presence:', error)
          throw new Error(`Failed to get channel presence: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // Apps List tool
    this.server.tool(
      "list_apps",
      "List all Ably apps",
      {
        format: z.enum(["json", "pretty"]).optional().default("json").describe("Output format (json or pretty)")
      },
      async (params) => {
        try {
          // Create a Control API instance
          const controlApi = await this.getControlApi()
          
          // Get the apps
          const apps = await controlApi.listApps()
          
          // Add the current app indicator
          const currentAppId = this.configManager.getCurrentAppId()
          const appsWithCurrent = apps.map(app => ({
            ...app,
            current: app.id === currentAppId
          }))
          
          return {
            content: [{ 
              type: 'text',
              text: JSON.stringify(appsWithCurrent, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error listing apps:', error)
          throw new Error(`Failed to list apps: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // Apps Stats tool
    this.server.tool(
      "get_app_stats",
      "Get statistics for an Ably app",
      {
        app: z.string().optional().describe("App ID to get stats for (uses current app if not provided)"),
        unit: z.enum(["minute", "hour", "day", "month"]).optional().default("minute").describe("Time unit for stats"),
        limit: z.number().optional().default(10).describe("Maximum number of stats records to return"),
        start: z.number().optional().describe("Start time in milliseconds since epoch"),
        end: z.number().optional().describe("End time in milliseconds since epoch")
      },
      async (params) => {
        try {
          // Use provided app ID or fall back to default app ID
          const appId = params.app || this.configManager.getCurrentAppId()
          
          if (!appId) {
            throw new Error('No app ID provided and no default app selected')
          }
          
          // Create a Control API instance
          const controlApi = await this.getControlApi()
          
          // If no start/end time provided, use the last 24 hours
          const now = new Date()
          const start = params.start || now.getTime() - (24 * 60 * 60 * 1000) // 24 hours ago
          const end = params.end || now.getTime()
          
          // Get the stats
          const stats = await controlApi.getAppStats(appId, {
            start: start,
            end: end,
            unit: params.unit,
            limit: params.limit
          })
          
          return {
            content: [{ 
              type: 'text',
              text: JSON.stringify(stats, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error getting app stats:', error)
          throw new Error(`Failed to get app stats: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // Auth Keys List tool
    this.server.tool(
      "list_auth_keys",
      "List API keys for an Ably app",
      {
        app: z.string().optional().describe("App ID to list keys for (uses current app if not provided)")
      },
      async (params) => {
        try {
          // Get app ID from parameter or current config
          const appId = params.app || this.configManager.getCurrentAppId()
          
          if (!appId) {
            throw new Error('No app specified')
          }
          
          // Create a Control API instance
          const controlApi = await this.getControlApi()
          
          // Get the keys
          const keys = await controlApi.listKeys(appId)
          
          // Add the current key indicator
          const currentKeyId = this.configManager.getKeyId(appId)
          const currentKeyName = currentKeyId && currentKeyId.includes('.') 
            ? currentKeyId 
            : currentKeyId ? `${appId}.${currentKeyId}` : undefined
            
          const keysWithCurrent = keys.map(key => {
            const keyName = `${key.appId}.${key.id}`
            return {
              ...key,
              keyName, // Add the full key name
              current: keyName === currentKeyName
            }
          })
          
          return {
            content: [{ 
              type: 'text',
              text: JSON.stringify(keysWithCurrent, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error listing keys:', error)
          throw new Error(`Failed to list keys: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )
  }

  private setupResources(): void {
    // Channels resource
    this.server.resource(
      'channels',
      new ResourceTemplate('ably://channels/{prefix?}', { 
        list: async (params) => {
          try {
            const args = ['--json']
            if (params.prefix) args.push('--prefix', params.prefix)
            
            const channels = await this.executeChannelsListCommand(args)
            
            return {
              resources: channels.map((channel) => ({
                name: channel.name,
                uri: `ably://channels/${channel.name}`
              }))
            }
          } catch (error) {
            console.error('Error listing channels:', error)
            throw new Error(`Failed to list channels: ${error instanceof Error ? error.message : String(error)}`)
          }
        } 
      }),
      async (uri, params) => {
        try {
          const args = ['--json']
          if (params.prefix) args.push('--prefix', params.prefix)
          
          const channels = await this.executeChannelsListCommand(args)
          
          return {
            contents: channels.map((channel) => ({
              uri: `ably://channels/${channel.name}`,
              title: channel.name,
              text: JSON.stringify(channel, null, 2)
            }))
          }
        } catch (error) {
          console.error('Error fetching channels resource:', error)
          throw new Error(`Failed to fetch channels: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // Channel History Resource
    this.server.resource(
      'channel_history',
      new ResourceTemplate('ably://channel_history/{channel}', { list: undefined }),
      async (uri, params) => {
        try {
          const args = ['--json', params.channel]
          
          const history = await this.executeChannelsHistoryCommand(args)
          
          return {
            contents: [{
              uri: uri.href,
              title: `Message history for ${params.channel}`,
              text: JSON.stringify(history, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error fetching channel history resource:', error)
          throw new Error(`Failed to fetch channel history: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // Channel Presence Resource
    this.server.resource(
      'channel_presence',
      new ResourceTemplate('ably://channel_presence/{channel}', { list: undefined }),
      async (uri, params) => {
        try {
          const args = ['--json', params.channel]
          
          const presence = await this.executeChannelsPresenceCommand(args)
          
          return {
            contents: [{
              uri: uri.href,
              title: `Presence members for ${params.channel}`,
              text: JSON.stringify(presence, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error fetching channel presence resource:', error)
          throw new Error(`Failed to fetch channel presence: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // Apps Resource
    this.server.resource(
      'apps',
      new ResourceTemplate('ably://apps', { 
        list: async () => {
          try {
            const controlApi = await this.getControlApi()
            const apps = await controlApi.listApps()
            
            // Add the current app indicator 
            const currentAppId = this.configManager.getCurrentAppId()
            
            return {
              resources: apps.map((app) => ({
                name: app.name,
                uri: `ably://apps/${app.id}`,
                current: app.id === currentAppId
              }))
            }
          } catch (error) {
            console.error('Error listing apps:', error)
            throw new Error(`Failed to list apps: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }),
      async (uri) => {
        try {
          const controlApi = await this.getControlApi()
          const apps = await controlApi.listApps()
          
          // Add the current app indicator
          const currentAppId = this.configManager.getCurrentAppId()
          const appsWithCurrent = apps.map(app => ({
            ...app,
            current: app.id === currentAppId
          }))
          
          return {
            contents: [{
              uri: uri.href,
              title: 'Ably Apps',
              text: JSON.stringify(appsWithCurrent, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error fetching apps resource:', error)
          throw new Error(`Failed to fetch apps: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // App Stats Resource 
    this.server.resource(
      'app_stats',
      new ResourceTemplate('ably://apps/{appId}/stats', { list: undefined }),
      async (uri, params) => {
        try {
          // Use the app ID from the URI or fall back to default
          const appId = params.appId || this.configManager.getCurrentAppId()
          
          if (!appId) {
            throw new Error('No app ID provided and no default app selected')
          }
          
          const controlApi = await this.getControlApi()
          
          // Get stats for the last 24 hours
          const now = new Date()
          const start = now.getTime() - (24 * 60 * 60 * 1000) // 24 hours ago
          const end = now.getTime()
          
          const stats = await controlApi.getAppStats(appId, {
            start: start,
            end: end,
            unit: 'minute',
            limit: 10
          })
          
          return {
            contents: [{
              uri: uri.href,
              title: `Statistics for app ${appId}`,
              text: JSON.stringify(stats, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error fetching app stats resource:', error)
          throw new Error(`Failed to fetch app stats: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )

    // App Keys Resource
    this.server.resource(
      'app_keys',
      new ResourceTemplate('ably://apps/{appId}/keys', { list: undefined }),
      async (uri, params) => {
        try {
          // Use the app ID from the URI or fall back to default
          const appId = params.appId || this.configManager.getCurrentAppId()
          
          if (!appId) {
            throw new Error('No app ID provided and no default app selected')
          }
          
          const controlApi = await this.getControlApi()
          const keys = await controlApi.listKeys(appId)
          
          // Add the current key indicator
          const currentKeyId = this.configManager.getKeyId(appId)
          const currentKeyName = currentKeyId && currentKeyId.includes('.') 
            ? currentKeyId 
            : currentKeyId ? `${appId}.${currentKeyId}` : undefined
            
          const keysWithCurrent = keys.map(key => {
            const keyName = `${key.appId}.${key.id}`
            return {
              ...key,
              keyName,
              current: keyName === currentKeyName
            }
          })
          
          return {
            contents: [{
              uri: uri.href,
              title: `API Keys for app ${appId}`,
              text: JSON.stringify(keysWithCurrent, null, 2)
            }]
          }
        } catch (error) {
          console.error('Error fetching app keys resource:', error)
          throw new Error(`Failed to fetch app keys: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )
  }

  private async executeCommand(CommandClass: any, args: string[], signal?: AbortSignal): Promise<any> {
    try {
      // Create direct execution functions for each command type
      if (CommandClass === ChannelsList) {
        return this.executeChannelsListCommand(args);
      } else if (CommandClass === ChannelsHistory) {
        return this.executeChannelsHistoryCommand(args);
      } else if (CommandClass === ChannelsPublish) {
        return this.executeChannelsPublishCommand(args);
      } else if (CommandClass === ChannelsSubscribe) {
        return this.executeChannelsSubscribeCommand(args, signal);
      } else if (CommandClass === ChannelsPresenceSubscribe) {
        return this.executeChannelsPresenceCommand(args);
      } else {
        throw new Error(`Unsupported command class: ${CommandClass.name}`);
      }
    } catch (error) {
      console.error('Error executing command:', error);
      throw error;
    }
  }

  private async executeChannelsListCommand(args: string[]): Promise<any[]> {
    try {
      // Parse arguments
      const prefix = this.getArgValue(args, '--prefix');
      const limit = parseInt(this.getArgValue(args, '--limit') || '100');

      // Get Ably client
      const ably = await this.getAblyClient();
      
      // Build params
      const params: any = { limit };
      if (prefix) params.prefix = prefix;
      
      // Make the API request
      const response = await ably.request('get', '/channels', params);
      
      if (response.statusCode !== 200) {
        throw new Error(`Failed to list channels: ${response.statusCode}`);
      }
      
      // Map response to simplified format
      return (response.items || []).map((channel: any) => ({
        name: channel.channelId,
        status: channel.status,
        occupancy: channel.status?.occupancy
      }));
    } catch (error) {
      console.error('Error listing channels:', error);
      throw new Error(`Failed to list channels: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeChannelsHistoryCommand(args: string[]): Promise<any[]> {
    try {
      // Parse arguments
      const channelName = args.find(arg => !arg.startsWith('-')) || '';
      if (!channelName || channelName === '--json') {
        throw new Error('Channel name is required');
      }
      
      const limit = parseInt(this.getArgValue(args, '--limit') || '100');
      const direction = this.getArgValue(args, '--direction') || 'backwards';
      
      // Get Ably client
      const ably = await this.getAblyClient();
      
      // Get channel
      const channel = ably.channels.get(channelName);
      
      // Get history
      const historyPage = await channel.history({ limit, direction });
      
      return historyPage.items.map(msg => ({
        id: msg.id,
        name: msg.name,
        timestamp: msg.timestamp,
        data: msg.data,
        clientId: msg.clientId,
        connectionId: msg.connectionId
      }));
    } catch (error) {
      console.error('Error getting channel history:', error);
      throw new Error(`Failed to get channel history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeChannelsPublishCommand(args: string[]): Promise<any> {
    try {
      // Check if we're dealing with an array of arguments or an object
      let channelName: string;
      let message: any;
      let name: string | undefined;

      if (Array.isArray(args)) {
        // Parse arguments from command line
        channelName = args.find(arg => !arg.startsWith('-') && arg !== '--json') || '';
        if (!channelName) {
          throw new Error('Channel name is required');
        }
        
        // Get message argument (next non-flag after channel name)
        const channelIndex = args.indexOf(channelName);
        message = args[channelIndex + 1];
        if (!message || message.startsWith('-')) {
          throw new Error('Message is required');
        }
        
        // Try to parse as JSON if possible
        try {
          message = JSON.parse(message);
        } catch (e) {
          // Keep as string if not valid JSON
        }
        
        name = this.getArgValue(args, '--name');
      } else if (typeof args === 'object' && args !== null) {
        // Handle direct object parameters (from MCP tool)
        channelName = args.channel;
        message = args.message;
        name = args.name;
        
        if (!channelName) {
          throw new Error('Channel name is required');
        }
        if (message === undefined) {
          throw new Error('Message is required');
        }
      } else {
        throw new Error('Invalid arguments format');
      }
      
      // Get Ably client
      const ably = await this.getAblyClient();
      
      // Get channel and publish
      const channel = ably.channels.get(channelName);
      
      if (name) {
        await channel.publish(name, message);
        return { name, data: message };
      } else {
        // If message is already an object with name/data, use that
        if (typeof message === 'object' && message !== null && 'name' in message && 'data' in message) {
          await channel.publish(message.name, message.data);
          return message;
        } else {
          // Default event name
          await channel.publish('message', message);
          return { name: 'message', data: message };
        }
      }
    } catch (error) {
      console.error('Error publishing to channel:', error);
      throw new Error(`Failed to publish message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeChannelsSubscribeCommand(args: string[], signal?: AbortSignal): Promise<any[]> {
    try {
      // Parse arguments
      const channelName = args.find(arg => !arg.startsWith('-') && arg !== '--json') || '';
      if (!channelName) {
        throw new Error('Channel name is required');
      }
      
      const rewind = parseInt(this.getArgValue(args, '--rewind') || '0');
      
      // Get Ably client
      const ably = await this.getAblyClient();
      
      // Get channel
      const channel = ably.channels.get(channelName);
      
      // Subscribe for messages
      const messages: any[] = [];
      
      // Create a promise that resolves when signal is aborted or timeout
      const abortPromise = new Promise<void>((resolve) => {
        if (signal) {
          signal.addEventListener('abort', () => resolve());
        }
        
        // Also set a timeout
        setTimeout(() => resolve(), MAX_EXECUTION_TIME);
      });
      
      // Create a promise for subscription
      const subscribePromise = new Promise<any[]>((resolve) => {
        // Handle rewind if specified
        if (rewind > 0) {
          channel.history({ limit: rewind })
            .then(page => {
              page.items.reverse().forEach(msg => {
                messages.push({
                  id: msg.id,
                  name: msg.name,
                  timestamp: msg.timestamp,
                  data: msg.data,
                  clientId: msg.clientId,
                  connectionId: msg.connectionId,
                  isRewind: true
                });
              });
            })
            .catch(err => console.error('Error rewinding messages:', err));
        }
        
        // Subscribe to new messages
        const subscription = channel.subscribe((message) => {
          messages.push({
            id: message.id,
            name: message.name,
            timestamp: message.timestamp,
            data: message.data,
            clientId: message.clientId,
            connectionId: message.connectionId
          });
        });
      });
      
      // Wait for abort or timeout
      await abortPromise;
      
      // Unsubscribe
      await channel.unsubscribe();
      
      return messages;
    } catch (error) {
      console.error('Error subscribing to channel:', error);
      throw new Error(`Failed to subscribe: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeChannelsPresenceCommand(args: string[]): Promise<any[]> {
    try {
      // Parse arguments
      const channelName = args.find(arg => !arg.startsWith('-') && arg !== '--json') || '';
      if (!channelName) {
        throw new Error('Channel name is required');
      }
      
      // Get Ably client
      const ably = await this.getAblyClient();
      
      // Get channel
      const channel = ably.channels.get(channelName);
      
      // Get presence
      const presencePage = await channel.presence.get();
      
      return presencePage.items.map(member => ({
        clientId: member.clientId,
        connectionId: member.connectionId,
        id: member.id,
        timestamp: member.timestamp,
        data: member.data,
        action: member.action
      }));
    } catch (error) {
      console.error('Error getting channel presence:', error);
      throw new Error(`Failed to get presence: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getAblyClient(): Promise<any> {
    try {
      const Ably = (await import('ably')).default;
      
      // Get API key from config
      const apiKey = this.configManager.getApiKey() || process.env.ABLY_API_KEY;
      
      if (!apiKey) {
        throw new Error('No API key configured. Please run "ably login" or set ABLY_API_KEY environment variable');
      }
      
      const clientOptions = {
        key: apiKey,
        clientId: process.env.ABLY_CLIENT_ID
      };
      
      // Create Ably REST client (not Realtime, to avoid connections)
      const client = new Ably.Rest(clientOptions);
      
      return client;
    } catch (error) {
      console.error('Error creating Ably client:', error);
      throw new Error(`Failed to create Ably client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getArgValue(args: string[], flag: string): string | undefined {
    const index = args.indexOf(flag);
    if (index !== -1 && index < args.length - 1) {
      return args[index + 1];
    }
    return undefined;
  }

  public async start(): Promise<void> {
    console.error('Initializing MCP server...')
    
    // Set up client ID if not provided
    this.setupClientId()
    
    // Set up tools and resources
    this.setupTools()
    this.setupResources()
    
    // Create a stdio transport
    const transport = new StdioServerTransport()
    
    try {
      // Connect the server to the transport
      await this.server.connect(transport)
      
      console.error('MCP server ready, waiting for requests...')
      
      // Register signal handlers for graceful shutdown
      process.on('SIGINT', () => this.shutdown())
      process.on('SIGTERM', () => this.shutdown())
    } catch (error) {
      console.error('Error starting MCP server:', error)
      throw error
    }
  }

  private shutdown(): void {
    console.error('MCP server shutting down...')
    
    // Abort any active operations
    for (const controller of this.activeOperations) {
      controller.abort()
    }
    
    // Exit process
    process.exit(0)
  }

  // Helper method to get a Control API instance
  private async getControlApi(): Promise<any> {
    try {
      const { ControlApi } = await import('../services/control-api.js')
      const accessToken = process.env.ABLY_ACCESS_TOKEN || this.configManager.getAccessToken()
      
      if (!accessToken) {
        throw new Error('No access token configured. Please run "ably login" to authenticate.')
      }
      
      return new ControlApi(accessToken)
    } catch (error) {
      console.error('Error creating Control API client:', error)
      throw new Error(`Failed to create Control API client: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 