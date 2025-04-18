import {Command, Flags} from '@oclif/core'

export default class SpacesCursors extends Command {
  static override description = 'Commands for interacting with Cursors in Ably Spaces'

  static override examples: Command.Example[] = [
    `$ ably spaces cursors set my-space --position '{"x": 100, "y": 200}' --data '{"color": "red"}'`,
    `$ ably spaces cursors subscribe my-space`,
    `$ ably spaces cursors get-all my-space`,
  ]

  static override flags = {
    scope: Flags.string({
      description: 'Space ID or comma-separated IDs for the scope (e.g., "my-space-1,my-space-2")',
      required: true,
    }),
  }

  public async run(): Promise<void> {
    this.log('Use `ably spaces cursors set` or `ably spaces cursors subscribe`.')
  }
} 