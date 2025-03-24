import { Command } from '@oclif/core'
import ChannelsSubscribe from '../channels/subscribe.js'

export default class ChannelSubscribe extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels subscribe"'
  static override flags = ChannelsSubscribe.flags
  static override args = ChannelsSubscribe.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels subscribe command
    const command = new ChannelsSubscribe(this.argv, this.config)
    await command.run()
  }
} 