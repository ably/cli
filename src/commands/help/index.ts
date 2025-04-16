import { Args, Command, Flags, Help, Interfaces } from "@oclif/core";
import { Topic } from "@oclif/core/interfaces";
import chalk from 'chalk'

export default class HelpCommand extends Command {
  static description = 'Get help from Ably'

  static examples = [
    '$ ably help ask "How do I publish to a channel?"',
    '$ ably help status',
    '$ ably help contact',
    '$ ably help support',
  ]

  static flags = {
    help: Flags.help({char: 'h'}),
  }

  async run(): Promise<void> {
    /* const {flags} */ await this.parse(HelpCommand) // Removed unused flags

    this.log('Ably help commands:')
    this.log('')
    this.log('  ably help ask       - Ask a question to the Ably AI agent for help')
    this.log('  ably help contact   - Contact Ably for assistance')
    this.log('  ably help support   - Get support from Ably')
    this.log('  ably help status    - Check the status of the Ably service')
    this.log('')
    this.log('Run `ably help COMMAND --help` for more information on a command.')
    
    // Add suggestion for ably --help
    this.log('')
    this.log(chalk.yellow('Did you mean ably --help? Here\'s a list of all commands available for ably:'))
    this.log('')
    
    // Show usage similar to the welcome message
    this.log(`${chalk.bold('USAGE')}`)
    this.log(`  $ ably [COMMAND]`)
    this.log('')
    
    // Show commands list
    this.displayAllCommands()
  }
  
  private async displayAllCommands(): Promise<void> {
    // Create an instance of CustomHelp to access its methods
    /* const help = new CustomHelp(this.config) */ // Removed unused help variable
    
    // Get all top-level commands and topics
    const rootCommands: { description: string, id: string }[] = []
    
    // Process all commands, filtering for root-level commands only
    for (const c of this.config.commands) {
      try {
        // Skip commands with dashes in name
        if (c.id.startsWith('--')) {
          continue;
        }
        
        // Only process commands with no spaces or colons (top-level commands)
        if (c.id.includes(' ') || c.id.includes(':')) {
          continue
        }
        
        // Skip alias and internal commands
         
        const cmd = await c.load()
        // Use type checking instead of any casts
        if ((cmd && ('isAlias' in cmd && cmd.isAlias)) || 
            (cmd && ('isInternal' in cmd && cmd.isInternal)) || 
            (cmd && ('hidden' in cmd && cmd.hidden))) {
          continue
        }
        
        rootCommands.push({
          description: cmd.description || '',
          id: c.id
        })
      } catch {
        // Skip commands that can't be loaded
      }
    }
    
    // Sort commands alphabetically
    rootCommands.sort((a, b) => a.id.localeCompare(b.id))
    
    // Calculate padding - find the longest command ID
    const maxLength = Math.max(...rootCommands.map(cmd => cmd.id.length))
    const paddingLength = maxLength + 4 // Add 4 spaces of padding
    
    // Show commands heading
    this.log(`${chalk.bold('COMMANDS')}`)
    
    // Add each command with its description to the output
    for (const entry of rootCommands) {
      const padding = ' '.repeat(paddingLength - entry.id.length)
      this.log(`  ${chalk.cyan(entry.id)}${padding}${entry.description}`)
    }
  }
} 