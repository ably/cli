import {Command, Flags} from '@oclif/core'

export default class HelpCommand extends Command {
  static description = 'Get help from Ably'

  static examples = [
    '$ ably help ask "How do I publish to a channel?"',
    '$ ably help status',
    '$ ably help contact',
    '$ ably help support',
  ]

  static flags = {
    help: Flags.help({char: 'h'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(HelpCommand)

    this.log('Ably help commands:')
    this.log('')
    this.log('  ably help ask       - Ask a question to the Ably AI agent for help')
    this.log('  ably help contact   - Contact Ably for assistance')
    this.log('  ably help support   - Get support from Ably')
    this.log('  ably help status    - Check the status of the Ably service')
    this.log('')
    this.log('Run `ably help COMMAND --help` for more information on a command.')
  }
} 