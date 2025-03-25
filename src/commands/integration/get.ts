import { Command } from '@oclif/core'
import IntegrationsGet from '../integrations/get.js'

export default class IntegrationGet extends Command {
  static override hidden = true
  static override description = 'Alias for "ably integrations get"'
  static override flags = IntegrationsGet.flags
  static override args = IntegrationsGet.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the integrations get command
    const command = new IntegrationsGet(this.argv, this.config)
    await command.run()
  }
} 