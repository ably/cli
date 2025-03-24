import { Command } from '@oclif/core'

export default class RoomsReactions extends Command {
  static override description = 'Manage reactions in Ably chat rooms'

  static override examples = [
    '$ ably rooms reactions send my-room thumbs_up',
    '$ ably rooms reactions subscribe my-room',
  ]

  async run(): Promise<void> {
    this.log('This is a placeholder. Please use a subcommand: send or subscribe')
    this.log('Examples:')
    this.log('  $ ably rooms reactions send my-room thumbs_up')
    this.log('  $ ably rooms reactions subscribe my-room')
  }
} 