import {Command} from '@oclif/core'

export default class BenchTopic extends Command {
  static description = 'Commands for running benchmark tests'
  static examples = [
    `$ ably bench publisher my-channel
$ ably bench subscriber my-channel`,
  ]
  
  async run(): Promise<void> {
    this.log('Ably benchmark testing commands:')
    this.log('')
    this.log('  ably bench publisher CHANNEL        - Run a publisher benchmark test')
    this.log('  ably bench subscriber CHANNEL       - Run a subscriber benchmark test')
    this.log('')
    this.log('Run `ably bench COMMAND --help` for more information on a command.')
  }
} 