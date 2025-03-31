import {Command} from '@oclif/core'

export default class AppsLogs extends Command {
  static override description = 'Stream or retrieve app logs'

  static override examples = [
    '$ ably apps logs subscribe',
    '$ ably apps logs subscribe --rewind 10',
    '$ ably apps logs history',
  ]

  async run() {
    this.log('App logs commands:')
    this.log('')
    this.log('  ably apps logs subscribe    - Stream logs from the app-wide meta channel')
    this.log('  ably apps logs history      - View historical app logs')
    this.log('')
    this.log('Run `ably apps logs COMMAND --help` for more information on a command.')
  }
} 