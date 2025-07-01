import { BaseTopicCommand } from '../../base-topic-command.js';
import CustomHelp from '../../help.js';
import chalk from 'chalk';
import inquirer from 'inquirer';
import pkg from "fast-levenshtein";
import * as readline from 'node:readline';
const { get: levenshteinDistance } = pkg;

export default class HelpCommand extends BaseTopicCommand {
  protected topicName = 'help';
  protected commandGroup = 'help';
  
  static description = 'Get help from Ably';
  
  static examples = [
    '$ ably help ask "How do I publish to a channel?"',
    '$ ably help status',
    '$ ably help contact',
    '$ ably help support',
  ];
  
  // Override to allow any arguments (bypass strict parsing)
  static strict = false;

  async run(): Promise<void> {
    // Check for --help flag first
    if (this.argv.includes('--help') || this.argv.includes('-h')) {
      // Show help for the help command itself
      const help = new CustomHelp(this.config);
      await help.showCommandHelp(this.constructor as any);
      return;
    }
    
    // Get raw argv before parsing to handle unknown subcommands
    const rawArgv = this.argv.filter(arg => !arg.startsWith('-')); // Filter out flags
    
    // If raw arguments suggest a subcommand (e.g., "help aska")
    if (rawArgv.length > 0) {
      // Check if this might be a misspelled subcommand
      const possibleSubcommand = rawArgv[0];
      const fullCommandId = `help:${possibleSubcommand}`;
      
      // Check if this exact command exists
      const exactCommand = this.config.findCommand(fullCommandId);
      if (!exactCommand) {
        // Find the closest help subcommand
        const helpCommands = await this.getTopicCommands();
        const helpCommandIds = helpCommands.map(cmd => `help:${cmd.id.split(' ')[1]}`);
        
        let closestCommand = '';
        let closestDistance = Infinity;
        
        for (const cmdId of helpCommandIds) {
          const distance = levenshteinDistance(fullCommandId, cmdId, { useCollator: true });
          if (distance < closestDistance) {
            closestDistance = distance;
            closestCommand = cmdId;
          }
        }
        
        // Check if we found a close match
        const threshold = Math.max(1, Math.floor(possibleSubcommand.length / 2));
        const maxDistance = 3;
        
        if (closestCommand && closestDistance <= Math.min(threshold, maxDistance)) {
          const isInteractiveMode = process.env.ABLY_INTERACTIVE_MODE === 'true';
          const displayOriginal = `help ${possibleSubcommand}`;
          const displaySuggestion = closestCommand.replaceAll(':', ' ');
          
          // Warn about command not found
          const warningMessage = `${chalk.cyan(displayOriginal)} is not an ably command.`;
          if (isInteractiveMode) {
            console.log(chalk.yellow(`Warning: ${warningMessage}`));
          } else {
            this.warn(warningMessage);
          }
          
          // Handle confirmation based on mode
          let confirmed = false;
          const skipConfirmation = process.env.SKIP_CONFIRMATION === 'true' || process.env.ABLY_CLI_NON_INTERACTIVE === 'true';
          
          if (skipConfirmation) {
            confirmed = true;
          } else {
            // In interactive mode, handle readline
            const interactiveReadline = isInteractiveMode ? (globalThis as Record<string, unknown>).__ablyInteractiveReadline as readline.Interface : null;
            
            if (interactiveReadline) {
              // Pause readline and remove listeners
              interactiveReadline.pause();
              const lineListeners = interactiveReadline.listeners('line');
              interactiveReadline.removeAllListeners('line');
              
              try {
                const result = await inquirer.prompt([{
                  name: 'confirmed',
                  type: 'confirm',
                  message: `Did you mean ${chalk.green(displaySuggestion)}?`,
                  default: true
                }]);
                confirmed = result.confirmed;
              } finally {
                // Restore listeners and resume
                lineListeners.forEach((listener) => {
                  interactiveReadline.on('line', listener as (...args: any[]) => void);
                });
                interactiveReadline.resume();
              }
            } else {
              // Normal mode
              const result = await inquirer.prompt([{
                name: 'confirmed',
                type: 'confirm',
                message: `Did you mean ${chalk.green(displaySuggestion)}?`,
                default: true
              }]);
              confirmed = result.confirmed;
            }
          }
          
          if (confirmed) {
            // Run the suggested command
            try {
              return await this.config.runCommand(closestCommand, rawArgv.slice(1));
            } catch (error) {
              // Handle errors in interactive mode
              if (isInteractiveMode) {
                throw error;
              } else {
                const err = error as { message?: string; oclif?: { exit?: number } };
                this.error(err.message || 'Unknown error', { exit: err.oclif?.exit || 1 });
              }
            }
          }
          
          // If not confirmed, just return
          return;
        }
        
        // No close match found - show error
        const isInteractiveMode = process.env.ABLY_INTERACTIVE_MODE === 'true';
        const errorMessage = isInteractiveMode 
          ? `Command help ${possibleSubcommand} not found. Run 'help' for a list of available commands.`
          : `Command help ${possibleSubcommand} not found.\nRun ${this.config.bin} help for a list of available commands.`;
        
        if (isInteractiveMode) {
          const error = new Error(errorMessage);
          (error as Error & {isCommandNotFound?: boolean}).isCommandNotFound = true;
          throw error;
        } else {
          this.error(errorMessage, { exit: 127 });
        }
      }
    }
    
    // If we get here, no subcommand was found or suggested
    // Parse remaining arguments to check if any were provided
    try {
      const { argv } = await this.parse(HelpCommand);
      
      if (argv.length > 0) {
        // If arguments provided, let the default BaseTopicCommand behavior handle it
        // This will show an error for non-existent commands
        return super.run();
      }
    } catch (error) {
      // If parsing fails (e.g., unexpected arguments), handle it gracefully
      if ((error as Error).message?.includes('Unexpected argument')) {
        // Already handled above - just return
        return;
      }
      throw error;
    }
    
    // Otherwise, show root help like 'ably --help' but also include help subcommands
    // This is more intuitive than showing only help subcommands
    const help = new CustomHelp(this.config);
    const rootHelp = help.formatRoot();
    
    // Add help subcommands section
    const helpCommands = await this.getTopicCommands();
    if (helpCommands.length > 0) {
      const helpSection = [
        '',
        '',
        'Ably help commands:',
        '',
        ...helpCommands.map(cmd => `  ${cmd.id.padEnd(20)} - ${cmd.description}`),
        '',
        'Run `ably help COMMAND --help` for more information on a command.'
      ].join('\n');
      
      console.log(rootHelp + helpSection);
    } else {
      console.log(rootHelp);
    }
  }
}