import { Command } from '@oclif/core';
import * as readline from 'node:readline';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { HistoryManager } from '../services/history-manager.js';
import { displayLogo } from '../utils/logo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class Interactive extends Command {
  static description = 'Launch interactive Ably shell (experimental)';
  static hidden = true; // Hide from help until stable
  static EXIT_CODE_USER_EXIT = 42; // Special code for 'exit' command

  private rl!: readline.Interface;
  private historyManager!: HistoryManager;
  private isWrapperMode = process.env.ABLY_WRAPPER_MODE === '1';

  async run() {
    try {
      // Set environment variable to indicate we're in interactive mode
      process.env.ABLY_INTERACTIVE_MODE = 'true';
      
      // Disable stack traces in interactive mode unless explicitly debugging
      if (!process.env.DEBUG) {
        process.env.NODE_ENV = 'production';
      }
      
      // Silence oclif's error output
      const originalConsoleError = console.error;
      let suppressNextError = false;
      console.error = ((...args: any[]) => {
        // Skip oclif error stack traces in interactive mode
        if (suppressNextError || (args[0] && typeof args[0] === 'string' && 
            (args[0].includes('at async Config.runCommand') || 
             args[0].includes('at Object.hook')))) {
          suppressNextError = false;
          return;
        }
        originalConsoleError.apply(console, args);
      }) as any;
      
      // Store readline instance globally for hooks to access
      (globalThis as any).__ablyInteractiveReadline = null;

    // Show welcome message only on first run
    if (!process.env.ABLY_SUPPRESS_WELCOME) {
      // Display logo
      displayLogo(console.log);
      console.log(`   Version: ${this.config.version}\n`);
      console.log('Welcome to the Ably CLI interactive shell!');
      console.log('Type "help" to see available commands or "exit" to quit.');
      if (this.isWrapperMode) {
        console.log('Press Ctrl+C to interrupt running commands.');
      }
      console.log();
      
      // Show basic commands info
      console.log('COMMON COMMANDS');
      console.log('  help                          Show help for any command');
      console.log('  channels publish <channel>    Publish a message to a channel');
      console.log('  channels subscribe <channel>  Subscribe to channel messages');
      console.log('  apps list                     List your Ably apps');
      console.log('  exit                          Exit the interactive shell');
      console.log();
    }

      this.historyManager = new HistoryManager();
      this.setupReadline();
      await this.historyManager.loadHistory(this.rl);
      this.rl.prompt();
    } catch (error) {
      // If there's an error starting up, exit gracefully
      console.error('Failed to start interactive mode:', error);
      process.exit(1);
    }
  }

  private setupReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '$ ',
      terminal: true,
      completer: this.completer.bind(this)
    });
    
    // Store readline instance globally for hooks to access
    (globalThis as any).__ablyInteractiveReadline = this.rl;
    
    // No process.exit override - we'll handle errors properly instead

    this.rl.on('line', async (input) => {
      await this.handleCommand(input.trim());
    });

    this.rl.on('SIGINT', () => {
      // Show yellow warning message
      console.log('\n\u001B[33mSignal received. To exit this shell, type \'exit\' and press Enter.\u001B[0m');
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      this.cleanup();
      // Use special exit code when in wrapper mode
      const exitCode = this.isWrapperMode ? Interactive.EXIT_CODE_USER_EXIT : 0;
      process.exit(exitCode);
    });
  }

  private async handleCommand(input: string) {
    if (input === 'exit' || input === '.exit') {
      this.rl.close();
      return;
    }

    if (input === '') {
      this.rl.prompt();
      return;
    }

    // Save to history
    await this.historyManager.saveCommand(input);
    

    // Pause readline to prevent it from interfering with command output
    this.rl.pause();
    
    try {
      const args = this.parseCommand(input);
      
      // Separate flags from command parts
      const flags: string[] = [];
      const commandParts: string[] = [];
      
      for (const arg of args) {
        if (arg.startsWith('-')) {
          // This is a flag - keep it for later
          flags.push(arg);
        } else if (commandParts.length > 0 || flags.length === 0) {
          // This is a command part (or we haven't seen flags yet)
          commandParts.push(arg);
        } else {
          // This is an argument after flags started
          flags.push(arg);
        }
      }
      
      // Handle special case of only flags (like --version)
      if (commandParts.length === 0 && flags.length > 0) {
        // Check for version flag
        if (flags.includes('--version') || flags.includes('-v')) {
          const { getVersionInfo } = await import('../utils/version.js');
          const versionInfo = getVersionInfo(this.config);
          this.log(`Version: ${versionInfo.version}`);
          return;
        }
        // For other global flags, show help
        await this.config.runCommand('help', []);
        return;
      }
      
      // Find the command by trying different combinations
      // Commands in oclif use colons, e.g., "help:ask" for "help ask"
      let commandId: string | undefined;
      let commandArgs: string[] = [];
      
      // Try to find a matching command
      for (let i = commandParts.length; i > 0; i--) {
        const possibleId = commandParts.slice(0, i).join(':');
        const cmd = this.config.findCommand(possibleId);
        if (cmd) {
          commandId = possibleId;
          // Include remaining command parts and all flags as arguments
          commandArgs = [...commandParts.slice(i), ...flags];
          break;
        }
      }
      
      if (!commandId) {
        // No command found - this will trigger command_not_found hook
        commandId = commandParts.join(':');
        commandArgs = flags;
      }
      
      // Use runCommand to avoid process.exit
      
      // Special handling for help flags
      if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
        // If the command has help flags, we need to handle it specially
        // because oclif's runCommand doesn't properly handle help for subcommands
        const { default: CustomHelp } = await import('../help.js');
        const help = new CustomHelp(this.config);
        
        // Find the actual command
        const cmd = this.config.findCommand(commandId);
        if (cmd) {
          await help.showCommandHelp(cmd);
          return;
        }
      }
      
      await this.config.runCommand(commandId, commandArgs);
      
    } catch (error: any) {
      // Special handling for intentional exits
      if (error.code === 'EEXIT' && error.exitCode === 0) {
        // Normal exit (like from help command) - don't display anything
        return;
      }
      
      
      // Always show errors in red
      let errorMessage = error.message || 'Unknown error';
      
      // Clean up the error message if it has ANSI codes or extra formatting
      // eslint-disable-next-line no-control-regex
      errorMessage = errorMessage.replaceAll(/\u001B\[[0-9;]*m/g, ''); // Remove ANSI codes
      
      // Check for specific error types
      if (error.isCommandNotFound) {
        // Command not found - already has appropriate message
        console.error(chalk.red(errorMessage));
      } else if (error.oclif?.exit !== undefined || error.exitCode !== undefined || error.code === 'EEXIT') {
        // This is an oclif error or exit that would normally exit the process
        // Show in red without the "Error:" prefix as it's already formatted
        console.error(chalk.red(errorMessage));
      } else if (error.stack && process.env.DEBUG) {
        // Show stack trace in debug mode
        console.error(chalk.red('Error:'), errorMessage);
        console.error(error.stack);
      } else {
        // All other errors - show with Error prefix
        console.error(chalk.red('Error:'), errorMessage);
      }
    } finally {
      // Small delay to ensure error messages are visible
      setTimeout(() => {
        this.rl.resume();
        this.rl.prompt();
      }, 50);
    }
  }

  private parseCommand(input: string): string[] {
    // Handle quoted strings properly
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const args: string[] = [];
    let match;
    
    while ((match = regex.exec(input))) {
      // match[1] is content of double quotes (can be empty string)
      // match[2] is content of single quotes (can be empty string)
      // match[0] is the full match (including quotes or unquoted text)
      if (match[1] !== undefined) {
        args.push(match[1]);
      } else if (match[2] === undefined) {
        args.push(match[0]);
      } else {
        args.push(match[2]);
      }
    }
    
    return args;
  }

  private cleanup() {
    console.log('\nGoodbye!');
  }

  private completer(line: string): [string[], string] {
    const words = line.trim().split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    
    // If line ends with a space, we're starting a new word
    const isNewWord = line.endsWith(' ');
    const currentWord = isNewWord ? '' : lastWord;
    
    // Get the command path (excluding the last word if not new)
    const commandPath = isNewWord ? words : words.slice(0, -1);
    
    if (commandPath.length === 0 || (!isNewWord && words.length === 1)) {
      // Complete top-level commands
      const commands = this.getTopLevelCommands();
      const matches = commands.filter(cmd => cmd.startsWith(currentWord));
      return [matches.length > 0 ? matches : commands, currentWord];
    }
    
    // Check if we're completing flags
    if (currentWord.startsWith('-')) {
      // For now, return basic flags synchronously
      const flags = this.getBasicFlagsForCommand(commandPath);
      const matches = flags.filter(flag => flag.startsWith(currentWord));
      return [matches.length > 0 ? matches : flags, currentWord];
    }
    
    // Try to find subcommands
    const subcommands = this.getSubcommandsForPath(commandPath);
    const matches = subcommands.filter(cmd => cmd.startsWith(currentWord));
    
    // If no subcommands, might be completing arguments - show no suggestions
    if (subcommands.length === 0) {
      return [[], currentWord];
    }
    
    return [matches.length > 0 ? matches : subcommands, currentWord];
  }

  private getTopLevelCommands(): string[] {
    // Cache this on first use
    if (!this._commandCache) {
      this._commandCache = [];
      
      for (const command of this.config.commands) {
        if (!command.hidden && !command.id.includes(':')) {
          this._commandCache.push(command.id);
        }
      }
      
      // Add special commands
      this._commandCache.push('exit', 'help', 'version');
      this._commandCache.sort();
    }
    
    return this._commandCache;
  }

  private getSubcommandsForPath(commandPath: string[]): string[] {
    // Convert space-separated path to colon-separated for oclif
    const parentCommand = commandPath.filter(p => p).join(':');
    const subcommands: string[] = [];
    
    for (const command of this.config.commands) {
      if (!command.hidden && command.id.startsWith(parentCommand + ':')) {
        // Get the next part of the command
        const remaining = command.id.slice(parentCommand.length + 1);
        const parts = remaining.split(':');
        const nextPart = parts[0];
        
        // Only add direct children (one level deep)
        if (nextPart && parts.length === 1) {
          subcommands.push(nextPart);
        }
      }
    }
    
    return [...new Set(subcommands)].sort();
  }

  private getBasicFlagsForCommand(commandPath: string[]): string[] {
    // Return common flags that are available for most commands
    const flags = ['--help', '-h'];
    
    // Add global flags
    if (commandPath.length === 0 || commandPath[0] === '') {
      flags.push('--version', '-v');
    }
    
    // Could be enhanced to cache command-specific flags
    // For now, return basic flags only
    
    return [...new Set(flags)].sort();
  }

  private _commandCache?: string[];
}