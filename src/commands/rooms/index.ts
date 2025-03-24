import {Command, Flags} from '@oclif/core'

export default class RoomsIndex extends Command {
  static override description = 'Interact with Ably Chat rooms'

  static override examples = [
    '$ ably rooms list',
    '$ ably rooms messages send my-room "Hello world!"',
    '$ ably rooms messages subscribe my-room',
    '$ ably rooms messages get my-room',
    '$ ably rooms typing subscribe my-room',
    '$ ably rooms typing start my-room',
  ]

  async run(): Promise<void> {
    this.log('Use one of the rooms subcommands:')
    this.log('')
    this.log('  ably rooms list        - List chat rooms')
    this.log('  ably rooms messages    - Commands for managing messages in chat rooms')
    this.log('  ably rooms typing      - Commands for typing indicators in chat rooms')
  }
} 