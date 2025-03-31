import { Command } from '@oclif/core'
import Logs from '../logs/index.js'

export default class Log extends Command {
  static override hidden = true
  static override description = 'Alias for "ably logs"'
  static override flags = Logs.flags
  static override args = Logs.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the logs command using static run method
    await Logs.run(this.argv, this.config)
  }
} 