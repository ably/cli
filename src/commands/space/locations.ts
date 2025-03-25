import { Command } from '@oclif/core'
import SpacesLocations from '../spaces/locations.js'

export default class SpaceLocations extends Command {
  static description = 'Alias for the command `ably spaces locations`'
  static hidden = true

  static flags = SpacesLocations.flags
  static args = SpacesLocations.args

  async run(): Promise<void> {
    // Forward to the original command
    await SpacesLocations.run(process.argv.slice(2))
  }
} 