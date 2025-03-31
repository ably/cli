import { Command } from '@oclif/core'
import Apps from '../apps/index.js'

export default class App extends Command {
  static override hidden = true
  static override description = 'Alias for "ably apps"'
  static override flags = Apps.flags
  static override args = Apps.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the apps command using static run method
    await Apps.run(this.argv, this.config)
  }
} 