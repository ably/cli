import { Command } from '@oclif/core'
import Connections from '../connections/index.js'

export default class Connection extends Command {
  static override hidden = true
  static override description = 'Alias for "ably connections"'
  static override flags = Connections.flags
  static override args = Connections.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the connections command using static run method
    await Connections.run(this.argv, this.config)
  }
} 