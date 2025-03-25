import { Command } from '@oclif/core'
import Integrations from '../integrations/index.js'

export default class Integration extends Command {
  static override hidden = true
  static override description = 'Alias for "ably integrations"'
  static override flags = Integrations.flags
  static override args = Integrations.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the integrations command
    const command = new Integrations(this.argv, this.config)
    await command.run()
  }
} 