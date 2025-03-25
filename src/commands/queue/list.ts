import { Command } from '@oclif/core'
import QueuesList from '../queues/list.js'

export default class QueueList extends Command {
  static override hidden = true
  static override description = 'Alias for "ably queues list"'
  static override flags = QueuesList.flags
  static override args = QueuesList.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the queues list command
    const command = new QueuesList(this.argv, this.config)
    await command.run()
  }
} 