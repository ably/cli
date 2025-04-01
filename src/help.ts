import { Command, Help } from '@oclif/core'
import { displayLogo } from './utils/logo.js'
import chalk from 'chalk'
import { ConfigManager } from './services/config-manager.js'

export default class CustomHelp extends Help {
  configManager = new ConfigManager()

  // Override the formatCommands method to filter out our alias commands
  formatCommands(commands: Command.Loadable[]): string {
    // Filter out commands that have the isAlias property
    const filteredCommands = commands.filter(c => {
      try {
        // Access the command class to check for our custom isAlias property
        const CommandClass = c.load()
        return !(CommandClass as any).isAlias
      } catch (error) {
        return true // Include command if there's an error loading it
      }
    })
    
    // Use the parent formatCommands method with the filtered commands
    return super.formatCommands(filteredCommands)
  }

  // Completely override the root help to implement custom welcome screen
  async showRootHelp(): Promise<void> {
    // Don't use the default root help output
    const output = await this.createCustomWelcomeScreen()
    this.log(output)
  }

  // Override the formatRoot method to return an empty string, as we're using showRootHelp instead
  formatRoot(): string {
    // Only proceed with default behavior if we're not at the root
    // @ts-ignore oclif Help class has argv property in its options
    if (this.opts.argv && this.opts.argv.length > 0) {
      return super.formatRoot()
    }
    
    // Return empty string for root help since we're using showRootHelp
    return ''
  }

  // Create our custom welcome screen
  private async createCustomWelcomeScreen(): Promise<string> {
    const { config } = this
    
    // Build the custom welcome screen
    const lines: string[] = []

    // 1. Display the Ably logo
    const captureLog: string[] = []
    displayLogo((message) => captureLog.push(message))
    lines.push(...captureLog)

    // 2. Show the CLI description beneath the logo
    // The description might not be accessible through config in some environments
    // So we'll hardcode the description from package.json
    lines.push(chalk.bold('ably.com CLI for Pub/Sub, Chat, Spaces and the Control API'))
    lines.push('')

    // 3. Show version info
    // @ts-ignore showVersion is a valid property in opts
    if (this.opts.showVersion && config.version) {
      lines.push(`${chalk.bold('VERSION')}`)
      lines.push(`  ${config.version}`)
      lines.push('')
    }

    // 4. Show usage info
    lines.push(`${chalk.bold('USAGE')}`)
    lines.push(`  $ ${config.bin} [COMMAND]`)
    lines.push('')

    // 5. Show a unified list of commands
    lines.push(`${chalk.bold('COMMANDS')}`)
    
    // Get all top-level commands and topics
    const rootCommands: { id: string, description: string }[] = []
    
    // Process all commands, filtering for root-level commands only
    for (const c of this.config.commands) {
      try {
        // Only process commands with no spaces or colons (top-level commands)
        if (c.id.includes(' ') || c.id.includes(':')) {
          continue
        }
        
        // Skip alias commands
        const cmd = await c.load()
        if ((cmd as any).isAlias) {
          continue
        }
        
        rootCommands.push({
          id: c.id,
          description: cmd.description || ''
        })
      } catch (error) {
        // Skip commands that can't be loaded
      }
    }
    
    // Sort commands alphabetically
    rootCommands.sort((a, b) => a.id.localeCompare(b.id))
    
    // Calculate padding - find the longest command ID
    const maxLength = Math.max(...rootCommands.map(cmd => cmd.id.length))
    const paddingLength = maxLength + 4 // Add 4 spaces of padding
    
    // Add each command with its description to the output
    rootCommands.forEach(entry => {
      const padding = ' '.repeat(paddingLength - entry.id.length)
      lines.push(`  ${chalk.cyan(entry.id)}${padding}${entry.description}`)
    })
    
    // 6. Check if login recommendation is needed
    const accessToken = process.env.ABLY_ACCESS_TOKEN || this.configManager.getAccessToken()
    const apiKey = process.env.ABLY_API_KEY
    
    if (!accessToken && !apiKey) {
      lines.push('')
      lines.push(chalk.yellow('You are not logged in. Run the following command to log in:'))
      lines.push(chalk.cyan('  $ ably login'))
    }

    return lines.join('\n')
  }
} 