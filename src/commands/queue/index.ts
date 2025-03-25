import { Command } from '@oclif/core'
import Queues from '../queues/index.js'

export default class Queue extends Command {
  static override hidden = true
  static override description = 'Alias for "ably queues"'
  static override flags = Queues.flags
  static override args = Queues.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the queues command
    const command = new Queues(this.argv, this.config)
    await command.run()
  }
} 