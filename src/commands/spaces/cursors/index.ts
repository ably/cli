import {Command} from '@oclif/core'

export default class SpacesCursorsIndex extends Command {
  static override description = 'Commands for cursor management in Ably Spaces'

  static override examples = [
    '$ ably spaces cursors set my-space',
    '$ ably spaces cursors subscribe my-space',
    '$ ably spaces cursors get-all my-space',
  ]

  async run(): Promise<void> {
    this.log('Ably Spaces cursors commands:')
    this.log('')
    this.log('  ably spaces cursors set        - Set cursor position in a space')
    this.log('  ably spaces cursors subscribe  - Subscribe to cursor movements in a space')
    this.log('  ably spaces cursors get-all    - Get all current cursors in a space')
    this.log('')
    this.log('Run `ably spaces cursors COMMAND --help` for more information on a command.')
  }
} 