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
    this.log('Ably Pub/Sub channel commands:')
    this.log('')
    this.log('  ably channels list                    - List active channels')
    this.log('  ably channels publish                 - Publish a message to a channel')
    this.log('  ably channels batch-publish           - Publish a batch of messages to a channel')
    this.log('  ably channels subscribe               - Subscribe to messages on a channel')
    this.log('  ably channels history                 - Get historical messages from a channel')
    this.log('  ably channels occupancy               - Get channel occupancy information')
    this.log('  ably channels presence                - Manage presence on channels')
    this.log('  ably channels presence enter          - Enter presence on a channel')
    this.log('  ably channels presence subscribe      - Subscribe to presence events on a channel')
    this.log('  ably channels logs                    - View channel lifecycle logs')
    this.log('')
    this.log('Run `ably channels COMMAND --help` for more information on a command.')
  }
} 