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
    this.log('Streaming and retrieving logs from Ably:')
    this.log('')
    this.log('  ably logs channel-lifecycle subscribe  - Stream logs from channel lifecycle events')
    this.log('  ably logs connection-lifecycle subscribe - Stream logs from connection lifecycle events')
    this.log('  ably logs app subscribe              - Stream logs from the app-wide meta channel')
    this.log('  ably logs app history                - View historical app logs')
    this.log('  ably logs push subscribe             - Stream logs from the app push notifications')
    this.log('  ably logs push history               - View historical push logs')
    this.log('')
    this.log('Run `ably logs COMMAND --help` for more information on a command.')
  }
} 