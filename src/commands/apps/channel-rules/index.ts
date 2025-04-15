import { ControlBaseCommand } from '../../../control-base-command.js'

export default class ChannelRulesIndexCommand extends ControlBaseCommand {
  static description = 'Manage Ably channel rules (namespaces)'

  static examples = [
    'ably apps channel-rules list',
    'ably apps channel-rules create --name "chat" --persisted',
    'ably apps channel-rules update chat --push-enabled',
    'ably apps channel-rules delete chat',
  ]

  async run(): Promise<void> {
    this.log(ChannelRulesIndexCommand.description)
    this.log('\nCommands:')
    this.log('  list      List all channel rules')
    this.log('  create    Create a channel rule')
    this.log('  update    Update a channel rule')
    this.log('  delete    Delete a channel rule')
    
    this.log('\nExamples:')
    for (const example of ChannelRulesIndexCommand.examples) {
      this.log(`  ${example}`)
    }
  }
} 