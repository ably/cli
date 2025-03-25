import { Command } from '@oclif/core'
import ChannelRulesCreate from '../apps/channel-rules/create.js'

export default class ChannelRuleCreate extends Command {
  static override hidden = true
  static override description = 'Alias for "ably apps channel-rules create"'
  static override flags = ChannelRulesCreate.flags
  static override args = ChannelRulesCreate.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channel-rules create command
    const command = new ChannelRulesCreate(this.argv, this.config)
    await command.run()
  }
} 