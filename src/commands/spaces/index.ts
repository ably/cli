import { Command } from '@oclif/core'

export default class SpacesIndex extends Command {
  static override description = 'Interact with Ably Spaces'

  static override examples = [
    '$ ably spaces list',
    '$ ably spaces members subscribe my-space',
    '$ ably spaces members enter my-space',
    '$ ably spaces locations set my-space',
    '$ ably spaces locations subscribe my-space',
    '$ ably spaces locations get-all my-space',
    '$ ably spaces cursors set my-space',
    '$ ably spaces cursors subscribe my-space',
    '$ ably spaces cursors get-all my-space',
    '$ ably spaces locks acquire my-space',
    '$ ably spaces locks subscribe my-space',
    '$ ably spaces locks get my-space',
    '$ ably spaces locks get-all my-space',
  ]

  async run(): Promise<void> {
    this.log('Use one of the spaces subcommands:')
    this.log('')
    this.log('  ably spaces list              - List spaces')
    this.log('  ably spaces members           - Commands for managing members in spaces')
    this.log('  ably spaces locations         - Commands for managing locations in spaces')
    this.log('  ably spaces cursors           - Commands for managing cursors in spaces')
    this.log('  ably spaces locks             - Commands for managing locks in spaces')
  }
} 