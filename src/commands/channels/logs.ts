import {Args, Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'

export default class ChannelsLogs extends AblyBaseCommand {
  static override description = 'Alias for ably logs channel-lifecycle subscribe'

  static override examples = [
    '$ ably channels logs channel-lifecycle',
    '$ ably channels logs channel-lifecycle --rewind 10',
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
      description: 'Log topic to subscribe to (currently only channel-lifecycle is supported)',
      default: 'channel-lifecycle',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelsLogs)

    // Currently only support channel-lifecycle
    if (args.topic !== 'channel-lifecycle') {
      this.error(`Unsupported log topic: ${args.topic}. Currently only 'channel-lifecycle' is supported.`)
      return
    }

    // Delegate to the original command
    await this.config.runCommand('logs:channel-lifecycle:subscribe', [
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