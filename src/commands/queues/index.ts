import { ControlBaseCommand } from '../../control-base-command.js'

export default class QueuesIndexCommand extends ControlBaseCommand {
  static description = 'Manage Ably Queues'

  static examples = [
    'ably queues list',
    'ably queues create --name "my-queue"',
    'ably queues delete my-queue',
  ]

  async run(): Promise<void> {
    this.log(QueuesIndexCommand.description)
    this.log('\nCommands:')
    this.log('  list      List all queues')
    this.log('  create    Create a queue')
    this.log('  delete    Delete a queue')
    
    this.log('\nExamples:')
    QueuesIndexCommand.examples.forEach(example => {
      this.log(`  ${example}`)
    })
  }
} 