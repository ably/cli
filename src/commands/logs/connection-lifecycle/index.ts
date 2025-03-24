import {Command} from '@oclif/core'

export default class LogsConnectionLifecycle extends Command {
  static override description = 'Stream logs from [meta]connection.lifecycle meta channel'

  static override examples = [
    '$ ably logs connection-lifecycle subscribe',
    '$ ably logs connection-lifecycle subscribe --rewind 10',
  ]

  async run() {
    this.log('Use the subscribe subcommand. See --help for more information.')
  }
} 