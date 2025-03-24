import { Command } from '@oclif/core'
import ChannelsPresenceSubscribe from '../../channels/presence/subscribe.js'

export default class ChannelPresenceSubscribe extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels presence subscribe"'
  static override flags = ChannelsPresenceSubscribe.flags
  static override args = ChannelsPresenceSubscribe.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels presence subscribe command
    const command = new ChannelsPresenceSubscribe(this.argv, this.config)
    await command.run()
  }
} 