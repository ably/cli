import { Command } from '@oclif/core'
import AppsList from '../apps/list.js'

export default class AppList extends Command {
  static override hidden = true
  static override description = 'Alias for "ably apps list"'
  static override flags = AppsList.flags
  static override args = AppsList.args
  
  // Special property to identify this as an alias command
  static isAlias = true

  async run(): Promise<void> {
    // Forward to the apps list command
    const command = new AppsList(this.argv, this.config)
    await command.run()
  }
} 