import {Command} from '@oclif/core'

export default class LogsPush extends Command {
  static override description = 'Stream or retrieve push notification logs from [meta]log:push'

  static override examples = [
    '$ ably logs push subscribe',
    '$ ably logs push subscribe --rewind 10',
    '$ ably logs push history',
  ]

  async run() {
    this.log('Use one of the push logs subcommands. See --help for more information.')
  }
} 