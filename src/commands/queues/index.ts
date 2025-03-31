import { ControlBaseCommand } from '../../control-base-command.js'

export default class QueuesIndexCommand extends ControlBaseCommand {
  static description = 'Manage Ably Queues'

  static examples = [
    'ably queues list',
    'ably queues create --name "my-queue"',
    'ably queues delete my-queue',
  ]

  async run(): Promise<void> {
    this.log('Ably queues management commands:')
    this.log('')
    this.log('  ably queues list             - List all queues')
    this.log('  ably queues create           - Create a queue')
    this.log('  ably queues delete           - Delete a queue')
    this.log('')
    this.log('Run `ably queues COMMAND --help` for more information on a command.')
  }
} 