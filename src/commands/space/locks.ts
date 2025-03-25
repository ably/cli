import { Command } from '@oclif/core'
import SpacesLocks from '../spaces/locks.js'

export default class SpaceLocks extends Command {
  static description = 'Alias for the command `ably spaces locks`'
  static hidden = true

  static flags = SpacesLocks.flags
  static args = SpacesLocks.args

  async run(): Promise<void> {
    // Forward to the original command
    await SpacesLocks.run(process.argv.slice(2))
  }
} 