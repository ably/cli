import { Command } from '@oclif/core'
import ChannelsList from '../channels/list.js'

export default class ChannelList extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels list"'
  static override flags = ChannelsList.flags
  static override args = ChannelsList.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels list command
    const command = new ChannelsList(this.argv, this.config)
    await command.run()
  }
} 