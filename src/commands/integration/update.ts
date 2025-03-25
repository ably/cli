import { Command } from '@oclif/core'
import IntegrationsUpdate from '../integrations/update.js'

export default class IntegrationUpdate extends Command {
  static override hidden = true
  static override description = 'Alias for "ably integrations update"'
  static override flags = IntegrationsUpdate.flags
  static override args = IntegrationsUpdate.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the integrations update command
    const command = new IntegrationsUpdate(this.argv, this.config)
    await command.run()
  }
} 