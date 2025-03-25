import { Command } from '@oclif/core'
import SpacesCursors from '../spaces/cursors.js'

export default class SpaceCursors extends Command {
  static description = 'Alias for the command `ably spaces cursors`'
  static hidden = true

  static flags = SpacesCursors.flags
  static args = SpacesCursors.args

  async run(): Promise<void> {
    // Forward to the original command
    await SpacesCursors.run(process.argv.slice(2))
  }
} 