import {Command} from '@oclif/core'

export default class Connections extends Command {
  static override description = 'Interact with Ably Pub/Sub connections'

  static override examples = [
    '$ ably connections stats',
    '$ ably connections logs connections-lifecycle',
    '$ ably connections test',
  ]

  async run() {
    this.log('Use one of the connections subcommands. See --help for more information.')
  }
} 