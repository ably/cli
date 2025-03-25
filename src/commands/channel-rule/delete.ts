import { Command } from '@oclif/core'
import ChannelRulesDelete from '../apps/channel-rules/delete.js'

export default class ChannelRuleDelete extends Command {
  static override hidden = true
  static override description = 'Alias for "ably apps channel-rules delete"'
  static override flags = ChannelRulesDelete.flags
  static override args = ChannelRulesDelete.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channel-rules delete command
    const command = new ChannelRulesDelete(this.argv, this.config)
    await command.run()
  }
} 