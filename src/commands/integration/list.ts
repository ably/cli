import { Command } from '@oclif/core'
import IntegrationsList from '../integrations/list.js'

export default class IntegrationList extends Command {
  static override hidden = true
  static override description = 'Alias for "ably integrations list"'
  static override flags = IntegrationsList.flags
  static override args = IntegrationsList.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the integrations list command
    const command = new IntegrationsList(this.argv, this.config)
    await command.run()
  }
} 