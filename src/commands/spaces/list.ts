import { Flags } from '@oclif/core'
import { ChatBaseCommand } from '../../chat-base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

interface SpaceMetrics {
  connections?: number;
  publishers?: number;
  subscribers?: number;
  presenceConnections?: number;
  presenceMembers?: number;
}

interface SpaceStatus {
  occupancy?: {
    metrics?: SpaceMetrics;
  };
}

interface SpaceItem {
  spaceName: string;
  status?: SpaceStatus;
}

export default class SpacesList extends ChatBaseCommand {
  static override description = 'List active spaces'

  static override examples = [
    '$ ably spaces list',
    '$ ably spaces list --prefix my-space',
    '$ ably spaces list --limit 50',
    '$ ably spaces list --json',
    '$ ably spaces list --pretty-json']

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    'prefix': Flags.string({
      description: 'Filter spaces by prefix',
      char: 'p',
    }),
    'limit': Flags.integer({
      description: 'Maximum number of spaces to return',
      default: 100,
    }),
    
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(SpacesList)

    // Create the Ably client
    const client = await this.createAblyClient(flags)
    if (!client) return

    try {
      // REST client for channel enumeration
      const rest = new Ably.Rest(this.getClientOptions(flags))

      // Build params for channel listing
      // We request more channels than the limit to account for filtering
      const params: any = {
        limit: flags.limit * 5, // Request more to allow for filtering
      }

      if (flags.prefix) {
        params.prefix = flags.prefix
      }

      // Fetch channels
      const channelsResponse = await rest.request('get', '/channels', params)

      if (channelsResponse.statusCode !== 200) {
        this.error(`Failed to list spaces: ${channelsResponse.statusCode}`)
        return
      }

      // Filter to only include space channels
      const allChannels = channelsResponse.items || []
      
      // Map to store deduplicated spaces
      const spaces = new Map<string, any>()
      
      // Filter for space channels and deduplicate
      allChannels.forEach(channel => {
        const channelId = channel.channelId
        
        // Check if this is a space channel (has ::$space suffix)
        if (channelId.includes('::$space')) {
          // Extract the base space name (everything before the first ::$space)
          // We need to escape the $ in the regex pattern since it's a special character
          const spaceNameMatch = channelId.match(/^(.+?)(?:::\$space.*)$/)
          if (spaceNameMatch && spaceNameMatch[1]) {
            const spaceName = spaceNameMatch[1]
            // Only add if we haven't seen this space before
            if (!spaces.has(spaceName)) {
              // Store the original channel data but with the simple space name
              const spaceData = { ...channel, spaceName, channelId: spaceName }
              spaces.set(spaceName, spaceData)
            }
          }
        }
      })
      
      // Convert map to array
      const spacesList = Array.from(spaces.values())
      
      // Limit the results to the requested number
      const limitedSpaces = spacesList.slice(0, flags.limit)

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: true,
          timestamp: new Date().toISOString(),
          spaces: limitedSpaces.map((space: SpaceItem) => ({
            spaceName: space.spaceName,
            metrics: space.status?.occupancy?.metrics || {}
          })),
          total: spacesList.length,
          shown: limitedSpaces.length,
          hasMore: spacesList.length > flags.limit
        }, flags));
      } else {
        if (limitedSpaces.length === 0) {
          this.log('No active spaces found.');
          return;
        }

        this.log(`Found ${chalk.cyan(limitedSpaces.length.toString())} active spaces:`);
        
        limitedSpaces.forEach((space: SpaceItem) => {
          this.log(`${chalk.green(space.spaceName)}`);
          
          // Show occupancy if available
          if (space.status?.occupancy?.metrics) {
            const metrics = space.status.occupancy.metrics;
            this.log(`  ${chalk.dim('Connections:')} ${metrics.connections || 0}`);
            this.log(`  ${chalk.dim('Publishers:')} ${metrics.publishers || 0}`);
            this.log(`  ${chalk.dim('Subscribers:')} ${metrics.subscribers || 0}`);
            
            if (metrics.presenceConnections !== undefined) {
              this.log(`  ${chalk.dim('Presence Connections:')} ${metrics.presenceConnections}`);
            }
            
            if (metrics.presenceMembers !== undefined) {
              this.log(`  ${chalk.dim('Presence Members:')} ${metrics.presenceMembers}`);
            }
          }
          
          this.log(''); // Add a line break between spaces
        });

        if (spacesList.length > flags.limit) {
          this.log(chalk.yellow(`Showing ${flags.limit} of ${spacesList.length} spaces. Use --limit to show more.`));
        }
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          status: 'error'
        }, flags));
      } else {
        this.error(`Error listing spaces: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      client.close()
    }
  }
} 