import { Command } from '@oclif/core'
import ChannelsOccupancySubscribe from '../../channels/occupancy/subscribe.js'

export default class ChannelOccupancySubscribe extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels occupancy subscribe"'
  static override flags = ChannelsOccupancySubscribe.flags
  static override args = ChannelsOccupancySubscribe.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels occupancy subscribe command
    const command = new ChannelsOccupancySubscribe(this.argv, this.config)
    await command.run()
  }
} 