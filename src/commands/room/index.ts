import { Command } from '@oclif/core'
import Rooms from '../rooms/index.js'

export default class Room extends Command {
  static override hidden = true
  static override description = 'Alias for "ably rooms"'
  static override flags = Rooms.flags
  static override args = Rooms.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the rooms command
    const command = new Rooms(this.argv, this.config)
    await command.run()
  }
} 