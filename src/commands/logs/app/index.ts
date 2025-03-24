import {Command} from '@oclif/core'

export default class LogsApp extends Command {
  static override description = 'Stream or retrieve logs from the app-wide meta channel [meta]log'

  static override examples = [
    '$ ably logs app subscribe',
    '$ ably logs app subscribe --rewind 10',
    '$ ably logs app history',
  ]

  async run() {
    this.log('Use one of the app logs subcommands. See --help for more information.')
  }
} 