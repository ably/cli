import { Command } from '@oclif/core'
import SpacesIndex from '../spaces/index.js'

export default class SpaceIndex extends Command {
  static description = 'Alias for the command `ably spaces`'
  static hidden = true

  static flags = SpacesIndex.flags
  static args = SpacesIndex.args

  async run(): Promise<void> {
    // Forward to the original command
    await SpacesIndex.run(process.argv.slice(2))
  }
} 