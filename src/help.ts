import { Command, Help } from '@oclif/core'
import chalk from 'chalk'

import { ConfigManager } from './services/config-manager.js'
import { displayLogo } from './utils/logo.js'

export default class CustomHelp extends Help {
  configManager = new ConfigManager()

  // Override the formatCommands method to filter out our alias commands
  formatCommands(commands: Command.Loadable[]): string {
    // Filter out commands that have the isAlias property or start with -
    const filteredCommands = commands.filter(c => {
      try {
        // Access the command class to check for our custom isAlias property
        const CommandClass = c.load()
        
        // Skip alias commands, internal commands, and commands starting with --
        return !(
          (CommandClass as any).isAlias || 
          (CommandClass as any).isInternal ||
          c.id.startsWith('--')
        )
      } catch {
        return true // Include command if there's an error loading it
      }
    })
    
    // Use the parent formatCommands method with the filtered commands
    return super.formatCommands(filteredCommands)
  }

  // Override the formatRoot method to return an empty string, as we're using showRootHelp instead
  formatRoot(): string {
    // Only proceed with default behavior if we're not at the root
    // @ts-expect-error oclif Help class has argv property in its options
    if (this.opts.argv && this.opts.argv.length > 0) {
      // Hide the --web-cli-help flag from regular help output
      // @ts-expect-error oclif Help class has argv property in its options
      const isWebCliHelpRequest = this.opts.argv.includes('--web-cli-help')
      if (isWebCliHelpRequest) {
        return ''
      }

      return super.formatRoot()
    }
    
    // Return empty string for root help since we're using showRootHelp
    return ''
  }

  // Completely override the root help to implement custom welcome screen
  async showRootHelp(): Promise<void> {
    // Check if this is a web CLI help request
    // @ts-expect-error oclif Help class has argv property in its options
    const isWebCliHelp = this.opts.argv?.includes('--web-cli-help')

    // Don't use the default root help output
    const output = isWebCliHelp
      ? await this.createWebCliWelcomeScreen()
      : await this.createCustomWelcomeScreen()

    this.log(output)
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
    lines.push(chalk.bold('ably.com CLI for Pub/Sub, Chat, Spaces and the Control API'), '')

    // 3. Show version info
    // @ts-expect-error showVersion is a valid property in opts
    if (this.opts.showVersion && config.version) {
      lines.push(`${chalk.bold('VERSION')}`, `  ${config.version}`, '')
    }

    // 4. Show usage info
    lines.push(`${chalk.bold('USAGE')}`, `  $ ${config.bin} [COMMAND]`, '')

    // 5. Show a unified list of commands
    lines.push(`${chalk.bold('COMMANDS')}`)
    
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
        if ((cmd as any).isAlias || (cmd as any).isInternal || (cmd as any).hidden) {
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
    
    // Add each command with its description to the output
    for (const entry of rootCommands) {
      const padding = ' '.repeat(paddingLength - entry.id.length)
      lines.push(`  ${chalk.cyan(entry.id)}${padding}${entry.description}`)
    }
    
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

  // Create web CLI specific welcome screen
  private async createWebCliWelcomeScreen(): Promise<string> {
    const lines: string[] = []

    // 1. Display the Ably logo
    const captureLog: string[] = []
    displayLogo((message) => captureLog.push(message))
    lines.push(...captureLog)

    // 2. Show the CLI description with web-specific wording
    lines.push(chalk.bold('ably.com browser-based CLI for Pub/Sub, Chat, Spaces and the Control API'), '')

    // 3. Show the web CLI specific instructions
    lines.push(`${chalk.bold('COMMON COMMANDS')}`)
    lines.push(`  ${chalk.cyan('View Ably commands:')} ably --help`)
    lines.push(`  ${chalk.cyan('Publish a message:')} ably channels publish [channel] [message]`)
    lines.push(`  ${chalk.cyan('View live channel lifecycle events:')} ably channels logs`, '')

    // 4. Check if login recommendation is needed
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