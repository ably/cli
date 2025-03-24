import {Command} from '@oclif/core'

export default class Logs extends Command {
  static override description = 'Streaming and retrieving logs from Ably'

  static override examples = [
    '$ ably logs channel-lifecycle subscribe',
    '$ ably logs connection-lifecycle subscribe',
    '$ ably logs app subscribe',
    '$ ably logs app history',
    '$ ably logs push subscribe',
    '$ ably logs push history',
  ]

  async run() {
    this.log('Use one of the logs subcommands. See --help for more information.')
  }
} 