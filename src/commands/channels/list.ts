import { Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ChannelsList extends AblyBaseCommand {
  static override description = 'List active channels using the channel enumeration API'

  static override examples = [
    '$ ably channels list',
    '$ ably channels list --prefix my-channel',
    '$ ably channels list --limit 50',
    '$ ably channels list --format json',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    'prefix': Flags.string({
      description: 'Filter channels by prefix',
      char: 'p',
    }),
    'limit': Flags.integer({
      description: 'Maximum number of channels to return',
      default: 100,
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(ChannelsList)

    // Create the Ably client
    const client = await this.createAblyClient(flags)
    if (!client) return

    try {
      // REST client for channel enumeration
      const rest = new Ably.Rest(this.getClientOptions(flags))

      // Build params for channel listing
      const params: any = {
        limit: flags.limit,
      }

      if (flags.prefix) {
        params.prefix = flags.prefix
      }

      // Fetch channels
      const channelsResponse = await rest.request('get', '/channels', params)

      if (channelsResponse.statusCode !== 200) {
        this.error(`Failed to list channels: ${channelsResponse.statusCode}`)
        return
      }

      const channels = channelsResponse.items || []

      // Output channels based on format
      if (flags.format === 'json') {
        this.log(JSON.stringify(channels, null, 2))
      } else {
        if (channels.length === 0) {
          this.log('No active channels found.')
          return
        }

        this.log(`Found ${chalk.cyan(channels.length.toString())} active channels:`)
        
        channels.forEach(channel => {
          this.log(`${chalk.green(channel.channelId)}`)
          
          // Show occupancy if available
          if (channel.status?.occupancy?.metrics) {
            const metrics = channel.status.occupancy.metrics
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
        })

        if (channels.length === flags.limit) {
          this.log(chalk.yellow(`Showing maximum of ${flags.limit} channels. Use --limit to show more.`))
        }
      }
    } catch (error) {
      this.error(`Error listing channels: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      client.close()
    }
  }
} 