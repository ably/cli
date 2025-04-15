import { Flags } from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import { AblyBaseCommand } from '../../base-command.js'

interface ChannelMetrics {
  connections?: number;
  presenceConnections?: number;
  presenceMembers?: number;
  publishers?: number;
  subscribers?: number;
}

interface ChannelStatus {
  occupancy?: {
    metrics?: ChannelMetrics;
  };
}

interface ChannelItem {
  channelId: string;
  status?: ChannelStatus;
}

// Type for channel listing request parameters
interface ChannelListParams {
  limit: number;
  prefix?: string;
}

export default class ChannelsList extends AblyBaseCommand {
  static override description = 'List active channels using the channel enumeration API'

  static override examples = [
    '$ ably channels list',
    '$ ably channels list --prefix my-channel',
    '$ ably channels list --limit 50',
    '$ ably channels list --json',
    '$ ably channels list --pretty-json',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    'limit': Flags.integer({
      default: 100,
      description: 'Maximum number of channels to return',
    }),
    'prefix': Flags.string({
      char: 'p',
      description: 'Filter channels by prefix',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(ChannelsList)

    // Create the Ably client - this will handle displaying data plane info
    const client = await this.createAblyClient(flags)
    if (!client) return

    try {
      // REST client for channel enumeration
      const rest = new Ably.Rest(this.getClientOptions(flags))

      // Build params for channel listing
      const params: ChannelListParams = {
        limit: flags.limit,
      }

      if (flags.prefix) {
        params.prefix = flags.prefix
      }

      // Fetch channels
      const channelsResponse = await rest.request('get', '/channels', 2, params, null)

      if (channelsResponse.statusCode !== 200) {
        this.error(`Failed to list channels: ${channelsResponse.statusCode}`)
        return
      }

      const channels = channelsResponse.items || []

      // Output channels based on format
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          channels: channels.map((channel: ChannelItem) => ({
            channelId: channel.channelId,
            metrics: channel.status?.occupancy?.metrics || {}
          })),
          hasMore: channels.length === flags.limit,
          success: true,
          timestamp: new Date().toISOString(),
          total: channels.length
        }, flags))
      } else {
        if (channels.length === 0) {
          this.log('No active channels found.')
          return
        }

        this.log(`Found ${chalk.cyan(channels.length.toString())} active channels:`)
        
        for (const channel of channels as ChannelItem[]) {
          this.log(`${chalk.green(channel.channelId)}`)
          
          // Show occupancy if available
          if (channel.status?.occupancy?.metrics) {
            const {metrics} = channel.status.occupancy
            this.log(`  ${chalk.dim('Connections:')} ${metrics.connections || 0}`)
            this.log(`  ${chalk.dim('Publishers:')} ${metrics.publishers || 0}`)
            this.log(`  ${chalk.dim('Subscribers:')} ${metrics.subscribers || 0}`)
            
            if (metrics.presenceConnections !== undefined) {
              this.log(`  ${chalk.dim('Presence Connections:')} ${metrics.presenceConnections}`)
            }
            
            if (metrics.presenceMembers !== undefined) {
              this.log(`  ${chalk.dim('Presence Members:')} ${metrics.presenceMembers}`)
            }
          }
          
          this.log('') // Add a line break between channels
        }

        if (channels.length === flags.limit) {
          this.log(chalk.yellow(`Showing maximum of ${flags.limit} channels. Use --limit to show more.`))
        }
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: error instanceof Error ? error.message : String(error),
          status: 'error',
          success: false
        }, flags))
      } else {
        this.error(`Error listing channels: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      client.close()
    }
  }
} 