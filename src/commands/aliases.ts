import { Command } from '@oclif/core'

export default class Aliases extends Command {
  static override hidden = true

  // We're using direct command forwarding instead of aliases
  static override aliases = []

  async run() {
    // This command is just for aliases, it doesn't need to do anything
    return
  }
} 