import {Command} from '@oclif/core'

export default class BenchTopic extends Command {
  static description = 'Commands for running benchmark tests'
  static examples = [
    `$ ably bench publisher my-channel
$ ably bench subscriber my-channel`,
  ]
  
  async run(): Promise<void> {
    // This is a topic command that just displays help
    await this.parse(BenchTopic)
    await BenchTopic.run(['--help'])
  }
} 