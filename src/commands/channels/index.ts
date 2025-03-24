import {Command} from '@oclif/core'

export default class Channels extends Command {
  static override description = 'Interact with Ably Pub/Sub channels'

  static override examples = [
    '$ ably channels publish my-channel \'{"name":"message","data":"Hello, World"}\'',
    '$ ably channels subscribe my-channel',
    '$ ably channels occupancy get my-channel',
    '$ ably channels occupancy live my-channel',
    '$ ably channels list',
  ]

  async run() {
    this.log('Use one of the channels subcommands. See --help for more information.')
  }
} 