import { Command } from '@oclif/core'
import ChannelsPublish from '../channels/publish.js'

export default class ChannelPublish extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels publish"'
  static override flags = ChannelsPublish.flags
  static override args = ChannelsPublish.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels publish command
    const command = new ChannelsPublish(this.argv, this.config)
    await command.run()
  }
} 