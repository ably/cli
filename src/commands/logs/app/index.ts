import {Command} from '@oclif/core'

export default class LogsApp extends Command {
  static override description = 'Stream or retrieve logs from the app-wide meta channel [meta]log'

  static override examples = [
    '$ ably logs app subscribe',
    '$ ably logs app subscribe --rewind 10',
    '$ ably logs app history',
  ]

  async run() {
    this.log('App logs commands:')
    this.log('')
    this.log('  ably logs app subscribe    - Stream logs from the app-wide meta channel')
    this.log('  ably logs app history      - View historical app logs')
    this.log('')
    this.log('Run `ably logs app COMMAND --help` for more information on a command.')
  }
} 