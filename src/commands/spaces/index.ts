import {Command, Flags} from '@oclif/core'

export default class SpacesIndex extends Command {
  static override description = 'Interact with Ably Spaces'

  static override examples = [
    '$ ably spaces members subscribe my-space',
    '$ ably spaces members enter my-space',
    '$ ably spaces locations set my-space --location "{\"x\":10,\"y\":20}"',
    '$ ably spaces locations subscribe my-space',
    '$ ably spaces locations get-all my-space',
    '$ ably spaces cursors set my-space --position "{\"x\":100,\"y\":150}"',
    '$ ably spaces cursors subscribe my-space',
    '$ ably spaces cursors get-all my-space',
    '$ ably spaces locks acquire my-space my-lock-id',
    '$ ably spaces locks subscribe my-space',
    '$ ably spaces locks get my-space my-lock-id',
    '$ ably spaces locks get-all my-space',
  ]

  async run(): Promise<void> {
    this.log('Use one of the spaces subcommands:')
    this.log('')
    this.log('  ably spaces members     - Commands for managing members in spaces')
    this.log('  ably spaces locations   - Commands for tracking user locations in spaces')
    this.log('  ably spaces cursors     - Commands for realtime cursor tracking in spaces')
    this.log('  ably spaces locks       - Commands for component locking in spaces')
  }
} 