import {Command, Flags} from '@oclif/core'

export default class SpacesCursors extends Command {
  static override description = 'Commands for realtime cursor tracking in Ably Spaces'

  static override examples = [
    '$ ably spaces cursors set my-space --position "{\"x\":100,\"y\":150}"',
    '$ ably spaces cursors subscribe my-space',
    '$ ably spaces cursors get-all my-space',
  ]

  async run(): Promise<void> {
    this.log('Use one of the spaces cursors subcommands:')
    this.log('')
    this.log('  ably spaces cursors set         - Set your cursor position in a space')
    this.log('  ably spaces cursors subscribe   - Subscribe to cursor movements in a space')
    this.log('  ably spaces cursors get-all     - Get all current cursor positions in a space')
  }
} 