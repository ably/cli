import {Command, Flags} from '@oclif/core'
import open from 'open'
import chalk from 'chalk'

export default class ContactCommand extends Command {
  static description = 'Contact Ably for assistance'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    help: Flags.help({char: 'h'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ContactCommand)

    this.log(`${chalk.cyan('Opening')} https://ably.com/contact ${chalk.cyan('in your browser')}...`)
    await open('https://ably.com/contact')
  }
} 