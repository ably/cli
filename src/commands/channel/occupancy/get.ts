import { Command } from '@oclif/core'
import ChannelsOccupancyGet from '../../channels/occupancy/get.js'

export default class ChannelOccupancyGet extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels occupancy get"'
  static override flags = ChannelsOccupancyGet.flags
  static override args = ChannelsOccupancyGet.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels occupancy get command
    const command = new ChannelsOccupancyGet(this.argv, this.config)
    await command.run()
  }
} 