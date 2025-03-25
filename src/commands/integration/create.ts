import { Command } from '@oclif/core'
import IntegrationsCreate from '../integrations/create.js'

export default class IntegrationCreate extends Command {
  static override hidden = true
  static override description = 'Alias for "ably integrations create"'
  static override flags = IntegrationsCreate.flags
  static override args = IntegrationsCreate.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the integrations create command
    const command = new IntegrationsCreate(this.argv, this.config)
    await command.run()
  }
} 