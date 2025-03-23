import { ControlBaseCommand } from '../../control-base-command.js'

export default class AccountsCommand extends ControlBaseCommand {
  static description = 'Commands for working with Ably accounts'

  static examples = [
    'ably accounts stats',
  ]

  async run(): Promise<void> {
    this.log('Use one of the accounts subcommands:')
    this.log('  ably accounts stats       Get account stats with optional live updates')
    this.log('')
    this.log('Run `ably accounts COMMAND --help` for more information on a command.')
  }
} 