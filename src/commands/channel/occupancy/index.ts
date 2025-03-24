import { Command } from '@oclif/core'
import ChannelsOccupancy from '../../channels/occupancy.js'

export default class ChannelOccupancy extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels occupancy"'
  static override flags = ChannelsOccupancy.flags
  static override args = ChannelsOccupancy.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels occupancy command
    const command = new ChannelsOccupancy(this.argv, this.config)
    await command.run()
  }
} 