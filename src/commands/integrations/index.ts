import { ControlBaseCommand } from '../../control-base-command.js'

export default class IntegrationsIndexCommand extends ControlBaseCommand {
  static description = 'Manage Ably integrations'

  static examples = [
    'ably integrations list',
    'ably integrations get rule123',
    'ably integrations create',
    'ably integrations update rule123',
    'ably integrations delete rule123',
  ]

  async run(): Promise<void> {
    this.log('Ably integrations management commands:')
    this.log('')
    this.log('  ably integrations list       - List all integrations')
    this.log('  ably integrations get        - Get an integration by ID')
    this.log('  ably integrations create     - Create an integration rule')
    this.log('  ably integrations update     - Update an integration rule')
    this.log('  ably integrations delete     - Delete an integration rule')
    this.log('')
    this.log('Run `ably integrations COMMAND --help` for more information on a command.')
  }
} 