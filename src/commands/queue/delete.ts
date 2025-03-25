import { Command } from '@oclif/core'
import QueuesDelete from '../queues/delete.js'

export default class QueueDelete extends Command {
  static override hidden = true
  static override description = 'Alias for "ably queues delete"'
  static override flags = QueuesDelete.flags
  static override args = QueuesDelete.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the queues delete command
    const command = new QueuesDelete(this.argv, this.config)
    await command.run()
  }
} 