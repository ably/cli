import {Command} from '@oclif/core'

export default class LogsChannelLifecycle extends Command {
  static override description = 'Stream logs from [meta]channel.lifecycle meta channel'

  static override examples = [
    '$ ably logs channel-lifecycle subscribe',
    '$ ably logs channel-lifecycle subscribe --rewind 10',
  ]

  async run() {
    this.log('Use the subscribe subcommand. See --help for more information.')
  }
} 