import { Command } from '@oclif/core'
import Spaces from '../spaces/index.js'

export default class Space extends Command {
  static override hidden = true
  static override description = 'Alias for "ably spaces"'
  static override flags = Spaces.flags
  static override args = Spaces.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the spaces command using static run method
    await Spaces.run(this.argv, this.config)
  }
} 