import {Args, Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'

export default class ConnectionsLogs extends AblyBaseCommand {
  static override description = 'Alias for ably logs connection-lifecycle subscribe'

  static override examples = [
    '$ ably connections logs connections-lifecycle',
    '$ ably connections logs connections-lifecycle --rewind 10',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    rewind: Flags.integer({
      description: 'Number of messages to rewind when subscribing',
      default: 0,
    }),
    json: Flags.boolean({
      description: 'Output results as JSON',
      default: false,
    }),
  }

  static override args = {
    topic: Args.string({
      description: 'Log topic to subscribe to (currently only connections-lifecycle is supported)',
      default: 'connections-lifecycle',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ConnectionsLogs)

    // Currently only support connections-lifecycle
    if (args.topic !== 'connections-lifecycle') {
      this.error(`Unsupported log topic: ${args.topic}. Currently only 'connections-lifecycle' is supported.`)
      return
    }

    // Delegate to the original command
    await this.config.runCommand('logs:connection-lifecycle:subscribe', [
      '--rewind', flags.rewind.toString(),
      ...(flags.json ? ['--json'] : []),
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