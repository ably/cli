import {Command} from '@oclif/core'

export default class SpacesMembersIndex extends Command {
  static override description = 'Commands for managing members in Ably Spaces'

  static override examples = [
    '$ ably spaces members subscribe my-space',
    '$ ably spaces members enter my-space',
  ]

  async run(): Promise<void> {
    this.log('Ably Spaces members commands:')
    this.log('')
    this.log('  ably spaces members subscribe   - Subscribe to members presence and show real-time updates')
    this.log('  ably spaces members enter       - Enter a space and stay present until terminated')
    this.log('')
    this.log('Run `ably spaces members COMMAND --help` for more information on a command.')
  }
} 