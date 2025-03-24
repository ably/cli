import { Command } from '@oclif/core'
import ChannelsHistory from '../channels/history.js'

export default class ChannelHistory extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels history"'
  static override flags = ChannelsHistory.flags
  static override args = ChannelsHistory.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels history command
    const command = new ChannelsHistory(this.argv, this.config)
    await command.run()
  }
} 