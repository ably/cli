import { Command } from '@oclif/core'
import Channels from '../channels/index.js'

export default class Channel extends Command {
  static override hidden = true
  static override description = 'Alias for "ably channels"'
  static override flags = Channels.flags
  static override args = Channels.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the channels command
    const command = new Channels(this.argv, this.config)
    await command.run()
  }
} 