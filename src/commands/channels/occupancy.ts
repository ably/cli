import { Command } from '@oclif/core'

export default class ChannelsOccupancy extends Command {
  static description = 'Get occupancy metrics for a channel'

  static examples = [
    '$ ably channels occupancy:get my-channel',
    '$ ably channels occupancy:live my-channel',
  ]

  async run(): Promise<void> {
    this.log('This is a placeholder. Please use a subcommand: get or live')
    this.log('Examples:')
    this.log('  $ ably channels occupancy:get my-channel')
    this.log('  $ ably channels occupancy:live my-channel')
  }
} 