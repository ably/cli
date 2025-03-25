import { Command } from '@oclif/core'
import IntegrationsDelete from '../integrations/delete.js'

export default class IntegrationDelete extends Command {
  static override hidden = true
  static override description = 'Alias for "ably integrations delete"'
  static override flags = IntegrationsDelete.flags
  static override args = IntegrationsDelete.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the integrations delete command
    const command = new IntegrationsDelete(this.argv, this.config)
    await command.run()
  }
} 