import { Command } from '@oclif/core'
import ChannelsPresence from '../../channels/presence.js'

export default class ChannelPresence extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels presence"'
  static override flags = ChannelsPresence.flags
  static override args = ChannelsPresence.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels presence command
    const command = new ChannelsPresence(this.argv, this.config)
    await command.run()
  }
} 