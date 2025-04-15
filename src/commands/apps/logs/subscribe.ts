import {Flags} from '@oclif/core'

import {AblyBaseCommand} from '../../../base-command.js'

export default class AppsLogsSubscribe extends AblyBaseCommand {
  static override description = 'Alias for ably logs app subscribe'

  static override examples = [
    '$ ably apps logs subscribe',
    '$ ably apps logs subscribe --rewind 10',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    json: Flags.boolean({
      default: false,
      description: 'Output results as JSON',
    }),
    rewind: Flags.integer({
      default: 0,
      description: 'Number of messages to rewind when subscribing',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AppsLogsSubscribe)

    // Delegate to the original command
    await this.config.runCommand('logs:app:subscribe', [
      '--rewind', flags.rewind.toString(),
      ...(flags.json ? ['--json'] : []),
      ...(flags.json ? ['--pretty-json'] : []),
      // Forward all global flags
      ...(flags.host ? ['--host', flags.host] : []),
      ...(flags.env ? ['--env', flags.env] : []),
      ...(flags['control-host'] ? ['--control-host', flags['control-host']] : []),
      ...(flags['access-token'] ? ['--access-token', flags['access-token']] : []),
      ...(flags['api-key'] ? ['--api-key', flags['api-key']] : []),
      ...(flags['client-id'] ? ['--client-id', flags['client-id']] : []),
      ...(flags.app ? ['--app', flags.app] : []),
    ])
  }
} 