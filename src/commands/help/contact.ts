import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import open from 'open'

export default class ContactCommand extends Command {
  static description = 'Contact Ably for assistance'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    help: Flags.help({char: 'h'}),
  }

  async run(): Promise<void> {
    await this.parse(ContactCommand)

    this.log(`${chalk.cyan('Opening')} https://ably.com/contact ${chalk.cyan('in your browser')}...`)
    await open('https://ably.com/contact')
  }
}
