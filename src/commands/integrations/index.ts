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
    this.log(IntegrationsIndexCommand.description)
    this.log('\nCommands:')
    this.log('  list      List all integrations')
    this.log('  get       Get an integration by ID')
    this.log('  create    Create an integration rule')
    this.log('  update    Update an integration rule')
    this.log('  delete    Delete an integration rule')
    
    this.log('\nExamples:')
    IntegrationsIndexCommand.examples.forEach(example => {
      this.log(`  ${example}`)
    })
  }
} 