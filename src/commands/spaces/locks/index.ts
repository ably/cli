import {Command} from '@oclif/core'

export default class SpacesLocksIndex extends Command {
  static override description = 'Commands for component locking in Ably Spaces'

  static override examples = [
    '$ ably spaces locks acquire my-space my-lock-id',
    '$ ably spaces locks subscribe my-space',
    '$ ably spaces locks get my-space my-lock-id',
    '$ ably spaces locks get-all my-space',
  ]

  async run(): Promise<void> {
    this.log('Ably Spaces locks commands:')
    this.log('')
    this.log('  ably spaces locks acquire     - Acquire a lock in a space')
    this.log('  ably spaces locks subscribe   - Subscribe to lock changes in a space')
    this.log('  ably spaces locks get         - Get information about a specific lock')
    this.log('  ably spaces locks get-all     - Get all current locks in a space')
    this.log('')
    this.log('Run `ably spaces locks COMMAND --help` for more information on a command.')
  }
} 