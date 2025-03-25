import { Command } from '@oclif/core'
import SpacesMembers from '../spaces/members.js'

export default class SpaceMembers extends Command {
  static description = 'Alias for the command `ably spaces members`'
  static hidden = true

  static flags = SpacesMembers.flags
  static args = SpacesMembers.args

  async run(): Promise<void> {
    // Forward to the original command
    await SpacesMembers.run(process.argv.slice(2))
  }
} 