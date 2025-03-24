import { Command } from '@oclif/core'
import ChannelsPresenceEnter from '../../channels/presence/enter.js'

export default class ChannelPresenceEnter extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels presence enter"'
  static override flags = ChannelsPresenceEnter.flags
  static override args = ChannelsPresenceEnter.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels presence enter command
    const command = new ChannelsPresenceEnter(this.argv, this.config)
    await command.run()
  }
} 