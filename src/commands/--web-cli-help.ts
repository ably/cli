import { Command } from '@oclif/core'
import CustomHelp from '../help.js'

export default class WebCliHelp extends Command {
  static hidden = true // Hide from help output
  static description = 'Show help formatted for the web CLI'
  static strict = false // Allow arbitrary arguments

  async run(): Promise<void> {
    // Create an instance of CustomHelp
    const help = new CustomHelp(this.config)
    
    // Set the argv to include our flag for detection in the help class
    // @ts-ignore - Adding a property that's expected by our help implementation
    help.opts = { argv: ['--web-cli-help'] }
    
    // Call the root help method which will display web help
    await help.showRootHelp()
  }
} 