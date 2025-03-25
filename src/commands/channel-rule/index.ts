import { Command } from '@oclif/core'
import ChannelRules from '../apps/channel-rules/index.js'

export default class ChannelRule extends Command {
  static override hidden = true
  static override description = 'Alias for "ably apps channel-rules"'
  static override flags = ChannelRules.flags
  static override args = ChannelRules.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channel-rules command
    const command = new ChannelRules(this.argv, this.config)
    await command.run()
  }
} 