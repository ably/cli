import { Command } from '@oclif/core'

export default class ChannelsPresence extends Command {
  static override description = 'Manage presence on Ably channels'

  static override examples = [
    '$ ably channels presence enter my-channel',
    '$ ably channels presence subscribe my-channel',
  ]

  async run(): Promise<void> {
    this.log('This is a placeholder. Please use a subcommand: enter or subscribe')
    this.log('Examples:')
    this.log('  $ ably channels presence enter my-channel')
    this.log('  $ ably channels presence subscribe my-channel')
  }
} 