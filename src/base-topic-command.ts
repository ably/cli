import chalk from 'chalk';
import inquirer from 'inquirer';
import pkg from "fast-levenshtein";
import { InteractiveBaseCommand } from './interactive-base-command.js';
import { runInquirerWithReadlineRestore } from './utils/readline-helper.js';
import * as readline from 'node:readline';

const { get: levenshteinDistance } = pkg;

export abstract class BaseTopicCommand extends InteractiveBaseCommand {
  protected abstract topicName: string;
  protected abstract commandGroup: string;
  
  // Allow any arguments to enable did-you-mean functionality
  static strict = false;
  
  async run(): Promise<void> {
    // Check for --help flag first
    if (this.argv.includes('--help') || this.argv.includes('-h')) {
      // Show help for this topic command using CustomHelp
      const { default: CustomHelp } = await import('./help.js');
      const help = new CustomHelp(this.config);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await help.showCommandHelp(this.constructor as any);
      return;
    }
    
    // Check for potential subcommands in raw argv
    const rawArgv = this.argv.filter(arg => !arg.startsWith('-')); // Filter out flags
    
    if (rawArgv.length > 0) {
      // User provided what might be a subcommand
      const possibleSubcommand = rawArgv[0];
      const fullCommandId = `${this.topicName}:${possibleSubcommand}`;
      
      // Check if this exact command exists
      const exactCommand = this.config.findCommand(fullCommandId);
      if (exactCommand) {
        // Exact command found - run it with remaining args and flags
        const remainingArgs = [...rawArgv.slice(1), ...this.argv.filter(arg => arg.startsWith('-'))];
        
        // Special handling for help flags in interactive mode
        if (process.env.ABLY_INTERACTIVE_MODE === 'true' && 
            (remainingArgs.includes('--help') || remainingArgs.includes('-h'))) {
          const { default: CustomHelp } = await import('./help.js');
          const help = new CustomHelp(this.config);
          const cmd = this.config.findCommand(fullCommandId);
          if (cmd) {
            await help.showCommandHelp(cmd);
            return;
          }
        }
        
        return await this.config.runCommand(fullCommandId, remainingArgs);
      } else {
        // Try to find the closest subcommand
        const subcommands = await this.getTopicCommands();
        const subcommandIds = subcommands.map(cmd => `${this.topicName}:${cmd.id.split(' ').at(-1)}`);
        
        let closestCommand = '';
        let closestDistance = Infinity;
        
        for (const cmdId of subcommandIds) {
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
          const displayOriginal = `${this.topicName} ${possibleSubcommand}`;
          const displaySuggestion = closestCommand.replaceAll(':', ' ');
          
          // Warn about command not found
          const warningMessage = `${chalk.cyan(displayOriginal)} is not an ably command.`;
          
          // In interactive mode, we need to ensure the message is visible
          // Write directly to stderr to avoid readline interference
          if (isInteractiveMode) {
            process.stderr.write(chalk.yellow(`Warning: ${warningMessage}\n`));
          } else {
            this.warn(warningMessage);
          }
          
          // Handle confirmation
          let confirmed = false;
          const skipConfirmation = process.env.SKIP_CONFIRMATION === 'true' || process.env.ABLY_CLI_NON_INTERACTIVE === 'true';
          
          if (skipConfirmation) {
            confirmed = true;
          } else {
            // In interactive mode, we need to handle readline carefully
            const interactiveReadline = isInteractiveMode ? (globalThis as Record<string, unknown>).__ablyInteractiveReadline : null;
            
            const result = await runInquirerWithReadlineRestore(
              async () => inquirer.prompt([{
                name: 'confirmed',
                type: 'confirm',
                message: `Did you mean ${chalk.green(displaySuggestion)}?`,
                default: true
              }]),
              interactiveReadline as readline.Interface | null
            );
            confirmed = result.confirmed;
          }
          
          if (confirmed) {
            // Run the suggested command with remaining args and original flags
            const remainingArgs = [...rawArgv.slice(1), ...this.argv.filter(arg => arg.startsWith('-'))];
            try {
              return await this.config.runCommand(closestCommand, remainingArgs);
            } catch (error) {
              // Handle errors in interactive mode
              if (isInteractiveMode) {
                throw error;
              } else {
                const err = error as Error & { oclif?: { exit?: number } };
                this.error(err.message || 'Unknown error', { exit: err.oclif?.exit || 1 });
              }
            }
          }
          
          // If not confirmed, show available commands
          // Fall through to the help display below
        } else {
          // No close match found - show error first, then commands
          const isInteractiveMode = process.env.ABLY_INTERACTIVE_MODE === 'true';
          const errorMessage = `Command ${this.topicName} ${possibleSubcommand} not found.`;
          
          // Show the error
          if (isInteractiveMode) {
            console.error(chalk.red(errorMessage));
          } else {
            this.warn(errorMessage);
          }
          
          // Fall through to show available commands
        }
      }
    }
    
    // No arguments provided or only unknown flags - show help for this topic
    const commands = await this.getTopicCommands();
    const isInteractiveMode = process.env.ABLY_INTERACTIVE_MODE === 'true';
    
    this.log(`Ably ${this.commandGroup} commands:`);
    this.log('');
    
    // If no commands found, show message and return
    if (commands.length === 0) {
      this.log('  No commands found.');
      return;
    }
    
    const maxLength = Math.max(...commands.map(cmd => cmd.id.length));
    const prefix = isInteractiveMode ? '' : 'ably ';
    const prefixLength = prefix.length;
    
    for (const cmd of commands) {
      const paddedId = `${prefix}${cmd.id}`.padEnd(maxLength + prefixLength + 2); // +2 for spacing
      const description = cmd.description || '';
      this.log(`  ${chalk.cyan(paddedId)} - ${description}`);
    }
    
    this.log('');
    const helpCommand = isInteractiveMode 
      ? `${this.topicName.replaceAll(':', ' ')} COMMAND --help`
      : `ably ${this.topicName.replaceAll(':', ' ')} COMMAND --help`;
    this.log(`Run \`${chalk.cyan(helpCommand)}\` for more information on a command.`);
  }
  
  protected async getTopicCommands(): Promise<Array<{id: string; description: string}>> {
    const commands: Array<{id: string; description: string}> = [];
    const topicPrefix = `${this.topicName}:`;
    
    
    for (const cmd of this.config.commands) {
      if (cmd.id.startsWith(topicPrefix) && !cmd.hidden) {
        // Check if this is a direct child (no additional colons after the topic prefix)
        const remainingId = cmd.id.slice(topicPrefix.length);
        const isDirectChild = !remainingId.includes(':');
        
        if (isDirectChild) {
          try {
            const loadedCmd = await cmd.load();
            if (!loadedCmd.hidden) {
              commands.push({
                id: cmd.id.replaceAll(':', ' '),
                description: loadedCmd.description || ''
              });
            }
          } catch {
            // Skip commands that can't be loaded
          }
        }
      }
    }
    
    return commands.sort((a, b) => a.id.localeCompare(b.id));
  }
}