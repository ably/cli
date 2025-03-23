import {Command} from '@oclif/core'

export default class Channels extends Command {
  static override description = 'Commands for working with Ably channels'

  static override examples = [
    '$ ably channels publish my-channel \'{"name":"message","data":"Hello, World"}\'',
    '$ ably channels subscribe my-channel',
    '$ ably channels list',
  ]

  async run() {
    this.log('Use one of the channels subcommands. See --help for more information.')
  }
} 