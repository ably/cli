import { Command } from '@oclif/core'

import CustomHelp from '../../help.js'

// Command for internal use in web CLI only
export default class WebCliHelp extends Command {
  static description = 'Show help formatted for the web CLI' // Hide from help output
  static hidden = true
  static isAlias = true // Allow arbitrary arguments
  
  // Mark as internal command that should never appear in help
  static isInternal = true
  static strict = false // This will make it filtered out by our custom help formatter

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