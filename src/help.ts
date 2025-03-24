import { Command, Help } from '@oclif/core'

export default class CustomHelp extends Help {
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
} 