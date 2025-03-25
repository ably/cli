import { Command } from '@oclif/core'
import QueuesCreate from '../queues/create.js'

export default class QueueCreate extends Command {
  static override hidden = true
  static override description = 'Alias for "ably queues create"'
  static override flags = QueuesCreate.flags
  static override args = QueuesCreate.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the queues create command
    const command = new QueuesCreate(this.argv, this.config)
    await command.run()
  }
} 