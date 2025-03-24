import {Command} from '@oclif/core'

export default class AppsLogs extends Command {
  static override description = 'Stream or retrieve app logs'

  static override examples = [
    '$ ably apps logs subscribe',
    '$ ably apps logs subscribe --rewind 10',
    '$ ably apps logs history',
  ]

  async run() {
    this.log('Use one of the apps logs subcommands. See --help for more information.')
  }
} 