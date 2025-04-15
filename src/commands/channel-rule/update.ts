import { Command } from '@oclif/core'

import ChannelRulesUpdate from '../apps/channel-rules/update.js'

export default class ChannelRuleUpdate extends Command {
  static override args = ChannelRulesUpdate.args
  static override description = 'Alias for "ably apps channel-rules update"'
  static override flags = ChannelRulesUpdate.flags
  static override hidden = true
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channel-rules update command
    const command = new ChannelRulesUpdate(this.argv, this.config)
    await command.run()
  }
} 