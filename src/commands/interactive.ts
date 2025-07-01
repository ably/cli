import { Command } from '@oclif/core';
import * as readline from 'node:readline';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { HistoryManager } from '../services/history-manager.js';
import { displayLogo } from '../utils/logo.js';
import { WEB_CLI_RESTRICTED_COMMANDS, WEB_CLI_ANONYMOUS_RESTRICTED_COMMANDS, INTERACTIVE_UNSUITABLE_COMMANDS } from '../base-command.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HistorySearchState {
  active: boolean;
  searchTerm: string;
  matches: string[];
  currentIndex: number;
  originalLine: string;
  originalCursorPos: number;
}

export default class Interactive extends Command {
  static description = 'Launch interactive Ably shell (ALPHA - experimental feature)';
  static hidden = true; // Hide from help until stable
  static EXIT_CODE_USER_EXIT = 42; // Special code for 'exit' command

  private rl!: readline.Interface;
  private historyManager!: HistoryManager;
  private isWrapperMode = process.env.ABLY_WRAPPER_MODE === '1';
  private _flagsCache?: Record<string, string[]>;
  private _manifestCache?: {
    commands: Record<string, {
      flags: Record<string, {
        name: string;
        char?: string;
        description?: string;
        type?: string;
        hidden?: boolean;
      }>;
    }>;
  };
  private runningCommand = false;
  private historySearch: HistorySearchState = {
    active: false,
    searchTerm: '',
    matches: [],
    currentIndex: 0,
    originalLine: '',
    originalCursorPos: 0,
  };

  async run() {
    try {
      // Check if we're running without the wrapper
      if (!this.isWrapperMode) {
        let wrapperPath: string;
        let spawnCommand: string;
        let spawnArgs: string[] = [];
        
        if (process.platform === 'win32') {
          // Windows - use PowerShell wrapper
          wrapperPath = path.join(this.config.root, 'bin', 'ably-interactive.ps1');
          spawnCommand = 'powershell.exe';
          spawnArgs = ['-ExecutionPolicy', 'Bypass', '-File', wrapperPath];
        } else {
          // Unix-like systems - use bash wrapper
          wrapperPath = path.join(this.config.root, 'bin', 'ably-interactive');
          spawnCommand = wrapperPath;
        }
        
        if (fs.existsSync(wrapperPath)) {
          // For Unix systems, make sure it's executable
          if (process.platform !== 'win32') {
            try {
              fs.accessSync(wrapperPath, fs.constants.X_OK);
            } catch {
              // Try to make it executable
              fs.chmodSync(wrapperPath, 0o755);
            }
          }
          
          // Execute the wrapper script instead
          const { spawn } = await import('node:child_process');
          const child = spawn(spawnCommand, spawnArgs, {
            stdio: 'inherit',
            env: process.env,
            shell: false
          });
          
          child.on('exit', (code) => {
            process.exit(code || 0);
          });
          
          // Prevent the rest of this function from running
          return;
        }
      }
      
      // Set environment variable to indicate we're in interactive mode
      process.env.ABLY_INTERACTIVE_MODE = 'true';
      
      // Disable stack traces in interactive mode unless explicitly debugging
      if (!process.env.DEBUG) {
        process.env.NODE_ENV = 'production';
      }
      
      
      // Silence oclif's error output
      const originalConsoleError = console.error;
      let suppressNextError = false;
      console.error = ((...args: unknown[]) => {
        // Skip oclif error stack traces in interactive mode
        if (suppressNextError || (args[0] && typeof args[0] === 'string' && 
            (args[0].includes('at async Config.runCommand') || 
             args[0].includes('at Object.hook')))) {
          suppressNextError = false;
          return;
        }
        originalConsoleError.apply(console, args);
      }) as typeof console.error;
      
      // Store readline instance globally for hooks to access
      (globalThis as Record<string, unknown>).__ablyInteractiveReadline = null;

    // Show welcome message only on first run
    if (!process.env.ABLY_SUPPRESS_WELCOME) {
      // Display logo
      displayLogo(console.log);
      
      // Only show version for alpha/beta releases
      const version = this.config.version;
      if (version.includes('alpha') || version.includes('beta')) {
        console.log(`   Version: ${version}\n`);
      }
      
      // Show appropriate tagline based on mode
      let tagline = 'ably.com ';
      if (this.isWebCliMode()) {
        tagline += 'browser-based ';
      }
      tagline += 'interactive CLI for Pub/Sub, Chat and Spaces';
      console.log(chalk.bold(tagline));
      console.log();
      
      // Show formatted common commands
      console.log(chalk.bold('COMMON COMMANDS'));
      
      const isAnonymousMode = this.isAnonymousWebMode();
      const commands = [];
      
      // Basic commands always available
      commands.push(
        ['help', 'Show help for any command'],
        ['channels publish [channel] [message]', 'Publish a message to a channel'],
        ['channels subscribe [channel]', 'Subscribe to a channel']
      );
      
      // Commands available only for authenticated users
      if (!isAnonymousMode) {
        commands.push(
          ['channels logs', 'View live channel events'],
          ['channels list', 'List active channels']
        );
      }
      
      commands.push(
        ['spaces enter [space]', 'Enter a collaborative space'],
        ['rooms messages send [room] [message]', 'Send a message to a chat room'],
        ['exit', 'Exit the interactive shell']
      );
      
      // Calculate padding for alignment
      const maxCmdLength = Math.max(...commands.map(([cmd]) => cmd.length));
      
      // Display commands with proper alignment
      commands.forEach(([cmd, desc]) => {
        const paddedCmd = cmd.padEnd(maxCmdLength + 2);
        console.log(`  ${chalk.cyan(paddedCmd)}${desc}`);
      });
      
      console.log();
      console.log('Type ' + chalk.cyan('help') + ' to see the complete list of commands.');
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
    // Debug terminal capabilities
    if (process.env.ABLY_DEBUG_KEYS === 'true') {
      console.error('[DEBUG] Terminal capabilities:');
      console.error(`  - process.stdin.isTTY: ${process.stdin.isTTY}`);
      console.error(`  - process.stdout.isTTY: ${process.stdout.isTTY}`);
      console.error(`  - TERM env: ${process.env.TERM}`);
      console.error(`  - COLORTERM env: ${process.env.COLORTERM}`);
      console.error(`  - terminal mode: ${process.stdin.isTTY ? 'TTY' : 'pipe'}`);
      console.error(`  - setRawMode available: ${typeof (process.stdin as any).setRawMode === 'function'}`);
    }
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '$ ',
      terminal: true,
      completer: this.completer.bind(this)
    });
    
    // Store readline instance globally for hooks to access
    (globalThis as Record<string, unknown>).__ablyInteractiveReadline = this.rl;
    
    // Setup keypress handler for Ctrl+R and other special keys
    this.setupKeypressHandler();
    
    // Don't install any SIGINT handler initially

    this.rl.on('line', async (input) => {
      // Exit history search mode when a command is executed
      if (this.historySearch.active) {
        this.exitHistorySearch();
      }
      await this.handleCommand(input.trim());
    });

    // Handle SIGINT events on readline
    this.rl.on('SIGINT', () => {
      if (this.runningCommand) {
        // If a command is running, send SIGINT to the process
        // This allows the command to handle Ctrl+C properly
        process.kill(process.pid, 'SIGINT');
        return;
      }
      
      // If in history search mode, exit it
      if (this.historySearch.active) {
        this.exitHistorySearch();
        return;
      }
      
      // Clear the current line similar to how zsh behaves
      const currentLine = (this.rl as readline.Interface & {line?: string}).line || '';
      if (currentLine.length > 0) {
        // Clear the entire line content
        (this.rl as readline.Interface & {_deleteLineLeft: () => void})._deleteLineLeft();
        (this.rl as readline.Interface & {_deleteLineRight: () => void})._deleteLineRight();
      }
      // Show ^C and new prompt
      process.stdout.write('^C\n');
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      if (!this.runningCommand) {
        this.cleanup();
        // Use special exit code when in wrapper mode
        const exitCode = this.isWrapperMode ? Interactive.EXIT_CODE_USER_EXIT : 0;
        process.exit(exitCode);
      }
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

    // Set command running state
    this.runningCommand = true;
    
    // Pause readline
    this.rl.pause();
    
    // CRITICAL FIX: Set stdin to cooked mode to allow Ctrl+C to generate SIGINT
    // Readline keeps stdin in raw mode even when paused, which prevents signal generation
    if (process.stdin.isTTY && typeof (process.stdin as NodeJS.ReadStream & {setRawMode?: (mode: boolean) => void}).setRawMode === 'function') {
      (process.stdin as NodeJS.ReadStream & {setRawMode: (mode: boolean) => void}).setRawMode(false);
    }
    
    try {
      const args = this.parseCommand(input);
      
      // Separate command parts from args (everything before first flag)
      const commandParts: string[] = [];
      let firstFlagIndex = args.findIndex(arg => arg.startsWith('-'));
      
      if (firstFlagIndex === -1) {
        // No flags, all args are command parts
        commandParts.push(...args);
      } else {
        // Everything before first flag is command parts
        commandParts.push(...args.slice(0, firstFlagIndex));
      }
      
      // Everything from first flag onwards stays together for oclif to parse
      const remainingArgs = firstFlagIndex === -1 ? [] : args.slice(firstFlagIndex);
      
      // Handle special case of only flags (like --version)
      if (commandParts.length === 0 && remainingArgs.length > 0) {
        // Check for version flag
        if (remainingArgs.includes('--version') || remainingArgs.includes('-v')) {
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
          // Include remaining command parts and all remaining args
          commandArgs = [...commandParts.slice(i), ...remainingArgs];
          break;
        }
      }
      
      if (!commandId) {
        // No command found - this will trigger command_not_found hook
        commandId = commandParts.join(':');
        commandArgs = remainingArgs;
      }
      
      // Check if the command is restricted
      if (this.isCommandRestricted(commandId)) {
        const displayCommand = commandId.replaceAll(':', ' ');
        let errorMessage: string;
        
        if (this.isAnonymousWebMode()) {
          errorMessage = `The '${displayCommand}' command is not available in anonymous mode.\nPlease provide an access token to use this command.`;
        } else {
          errorMessage = `The '${displayCommand}' command is not available in the web CLI.`;
        }
        
        console.error(chalk.red('Error:'), errorMessage);
        return;
      }
      
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
      
      // Run command without any timeout
      await this.config.runCommand(commandId, commandArgs);
      
    } catch (error) {
      const err = error as {
        code?: string;
        exitCode?: number;
        message?: string;
        isCommandNotFound?: boolean;
        oclif?: { exit?: number };
        stack?: string;
      };
      
      // Special handling for intentional exits
      if (err.code === 'EEXIT' && err.exitCode === 0) {
        // Normal exit (like from help command) - don't display anything
        return;
      }
      
      // Always show errors in red
      let errorMessage = err.message || 'Unknown error';
      
      // Clean up the error message if it has ANSI codes or extra formatting
      // eslint-disable-next-line no-control-regex
      errorMessage = errorMessage.replaceAll(/\u001B\[[0-9;]*m/g, ''); // Remove ANSI codes
      
      // Check for specific error types
      if (err.isCommandNotFound) {
        // Command not found - already has appropriate message
        console.error(chalk.red(errorMessage));
      } else if (err.oclif?.exit !== undefined || err.exitCode !== undefined || err.code === 'EEXIT') {
        // This is an oclif error or exit that would normally exit the process
        // Show in red without the "Error:" prefix as it's already formatted
        console.error(chalk.red(errorMessage));
      } else if (err.stack && process.env.DEBUG) {
        // Show stack trace in debug mode
        console.error(chalk.red('Error:'), errorMessage);
        console.error(err.stack);
      } else {
        // All other errors - show with Error prefix
        console.error(chalk.red('Error:'), errorMessage);
      }
    } finally {
      // Reset command running state
      this.runningCommand = false;
      
      // Restore raw mode for readline
      if (process.stdin.isTTY && typeof (process.stdin as NodeJS.ReadStream & {setRawMode?: (mode: boolean) => void}).setRawMode === 'function') {
        (process.stdin as NodeJS.ReadStream & {setRawMode: (mode: boolean) => void}).setRawMode(true);
      }
      
      // Resume readline
      this.rl.resume();
      
      // Small delay to ensure error messages are visible
      setTimeout(() => {
        this.rl.prompt();
      }, 50);
    }
  }

  private parseCommand(input: string): string[] {
    const args: string[] = [];
    let current = '';
    let inDoubleQuote = false;
    let inSingleQuote = false;
    let escaped = false;
    
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const nextChar = input[i + 1];
      
      if (escaped) {
        // Add the escaped character literally
        current += char;
        escaped = false;
        continue;
      }
      
      if (char === '\\' && (inDoubleQuote || inSingleQuote)) {
        // Check if this is an escape sequence
        if (inDoubleQuote && (nextChar === '"' || nextChar === '\\' || nextChar === '$' || nextChar === '`')) {
          escaped = true;
          continue;
        } else if (inSingleQuote && nextChar === "'") {
          escaped = true;
          continue;
        }
        // Otherwise, backslash is literal
        current += char;
        continue;
      }
      
      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        // If we're closing a quote and have content, that's an argument
        if (!inDoubleQuote && current === '') {
          // Empty string argument
          args.push('');
          current = '';
        }
        continue;
      }
      
      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        // If we're closing a quote and have content, that's an argument
        if (!inSingleQuote && current === '') {
          // Empty string argument
          args.push('');
          current = '';
        }
        continue;
      }
      
      if (char === ' ' && !inDoubleQuote && !inSingleQuote) {
        // Space outside quotes - end current argument
        if (current.length > 0) {
          args.push(current);
          current = '';
        }
        continue;
      }
      
      // Regular character - add to current argument
      current += char;
    }
    
    // Handle any remaining content
    if (current.length > 0 || inDoubleQuote || inSingleQuote) {
      args.push(current);
    }
    
    // Warn about unclosed quotes
    if (inDoubleQuote || inSingleQuote) {
      const quoteType = inDoubleQuote ? 'double' : 'single';
      console.error(chalk.yellow(`Warning: Unclosed ${quoteType} quote in command`));
    }
    
    return args;
  }

  private cleanup() {
    console.log('\nGoodbye!');
  }

  private completer(line: string, callback?: (err: Error | null, result: [string[], string]) => void): [string[], string] | void {
    // Debug logging
    if (process.env.ABLY_DEBUG_KEYS === 'true') {
      console.error(`[DEBUG] Completer called with line: "${line}"`);
    }
    
    // Don't provide completions during history search
    if (this.historySearch.active) {
      const emptyResult: [string[], string] = [[], line];
      if (callback) {
        callback(null, emptyResult);
      } else {
        return emptyResult;
      }
      return;
    }
    
    // Support both sync and async patterns
    const result = this.getCompletions(line);
    
    // Debug logging
    if (process.env.ABLY_DEBUG_KEYS === 'true') {
      console.error(`[DEBUG] Completer returning:`, result);
    }
    
    if (callback) {
      // Async mode - used by readline for custom display
      callback(null, result);
    } else {
      // Sync mode - fallback
      return result;
    }
  }
  
  private getCompletions(line: string): [string[], string] {
    const words = line.trim().split(/\s+/);
    const lastWord = words.at(-1) || '';
    
    // If line ends with a space, we're starting a new word
    const isNewWord = line.endsWith(' ');
    const currentWord = isNewWord ? '' : lastWord;
    
    // Get the command path (excluding the last word if not new)
    const commandPath = isNewWord ? words : words.slice(0, -1);
    
    if (commandPath.length === 0 || (!isNewWord && words.length === 1)) {
      // Complete top-level commands
      const commands = this.getTopLevelCommands();
      const matches = commands.filter(cmd => cmd.startsWith(currentWord));
      
      // Custom display for multiple matches
      if (matches.length > 1) {
        this.displayCompletions(matches, 'command');
        return [[], line]; // Don't auto-complete, just show options
      }
      
      return [matches, currentWord];
    }
    
    // Check if we're completing flags
    if (currentWord.startsWith('-')) {
      const flags = this.getFlagsForCommandSync(commandPath);
      const matches = flags.filter(flag => flag.startsWith(currentWord));
      
      if (matches.length > 1) {
        this.displayCompletions(matches, 'flag');
        return [[], line];
      }
      
      return [matches, currentWord];
    }
    
    // Try to find subcommands
    const subcommands = this.getSubcommandsForPath(commandPath);
    const matches = subcommands.filter(cmd => cmd.startsWith(currentWord));
    
    if (matches.length > 1) {
      this.displayCompletions(matches, 'subcommand', commandPath);
      return [[], line];
    }
    
    return [matches.length > 0 ? matches : [], currentWord];
  }

  private getTopLevelCommands(): string[] {
    // Cache this on first use
    if (!this._commandCache) {
      this._commandCache = [];
      
      for (const command of this.config.commands) {
        if (!command.hidden && !command.id.includes(':') && // Filter out restricted commands
          !this.isCommandRestricted(command.id)) {
            this._commandCache.push(command.id);
          }
      }
      
      // Add special commands that aren't filtered
      // Only add 'exit' since help, version, config, and autocomplete are filtered out
      this._commandCache.push('exit');
      this._commandCache.sort();
    }
    
    return this._commandCache;
  }

  private getSubcommandsForPath(commandPath: string[]): string[] {
    // Convert space-separated path to colon-separated for oclif
    const parentCommand = commandPath.filter(Boolean).join(':');
    const subcommands: string[] = [];
    
    for (const command of this.config.commands) {
      if (!command.hidden && command.id.startsWith(parentCommand + ':') && // Filter out restricted commands
        !this.isCommandRestricted(command.id)) {
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

  private getFlagsForCommandSync(commandPath: string[]): string[] {
    // Get cached flags if available
    const commandId = commandPath.filter(Boolean).join(':');
    
    if (this._flagsCache && this._flagsCache[commandId]) {
      return this._flagsCache[commandId];
    }
    
    // Basic flags available for all commands
    const flags: string[] = ['--help', '-h'];
    
    // Try to get flags from manifest first
    try {
      // Load manifest if not already loaded
      if (!this._manifestCache) {
        const manifestPath = path.join(this.config.root, 'oclif.manifest.json');
        if (fs.existsSync(manifestPath)) {
          this._manifestCache = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        }
      }
      
      // Get flags from manifest
      if (this._manifestCache && this._manifestCache.commands) {
        const manifestCommand = this._manifestCache.commands[commandId];
        if (manifestCommand && manifestCommand.flags) {
          for (const [name, flag] of Object.entries(manifestCommand.flags)) {
            const flagDef = flag as {
              name: string;
              char?: string;
              description?: string;
              type?: string;
              hidden?: boolean;
            };
            // Skip hidden flags unless in dev mode
            if (flagDef.hidden && process.env.ABLY_SHOW_DEV_FLAGS !== 'true') {
              continue;
            }
            flags.push(`--${name}`);
            if (flagDef.char) {
              flags.push(`-${flagDef.char}`);
            }
          }
        }
      }
    } catch {
      // Fall back to trying to get from loaded command
      try {
        const command = this.config.findCommand(commandId);
        if (command && command.flags) {
          // Add flags from command definition (these are already loaded)
          for (const [name, flag] of Object.entries(command.flags)) {
            flags.push(`--${name}`);
            if (flag.char) {
              flags.push(`-${flag.char}`);
            }
          }
        }
      } catch {
        // Ignore errors
      }
    }
    
    // Add global flags for top-level
    if (commandPath.length === 0 || commandPath[0] === '') {
      flags.push('--version', '-v');
    }
    
    const uniqueFlags = [...new Set(flags)].sort();
    
    // Cache for next time
    if (!this._flagsCache) {
      this._flagsCache = {};
    }
    this._flagsCache[commandId] = uniqueFlags;
    
    return uniqueFlags;
  }
  
  private displayCompletions(matches: string[], type: string, commandPath?: string[]): void {
    console.log(); // New line for better display
    
    // Get descriptions for each match
    const items: Array<{ name: string; description: string }> = [];
    
    for (const match of matches) {
      let description = '';
      
      if (type === 'command' || type === 'subcommand') {
        const fullId = commandPath ? [...commandPath, match].join(':') : match;
        const cmd = this.config.findCommand(fullId);
        if (cmd && cmd.description) {
          description = cmd.description;
        }
      } else if (type === 'flag' && // Extract flag description from manifest first, then fall back to command
        commandPath) {
          const commandId = commandPath.filter(Boolean).join(':');
          const flagName = match.replace(/^--?/, '');
          
          // Try manifest first
          if (this._manifestCache && this._manifestCache.commands) {
            const manifestCommand = this._manifestCache.commands[commandId];
            if (manifestCommand && manifestCommand.flags) {
              // Find flag by name or char
              for (const [name, flag] of Object.entries(manifestCommand.flags)) {
                const flagDef = flag as {
              name: string;
              char?: string;
              description?: string;
              type?: string;
              hidden?: boolean;
            };
                if (name === flagName || (flagDef.char && flagDef.char === flagName)) {
                  description = flagDef.description || '';
                  break;
                }
              }
            }
          }
          
          // Fall back to loaded command if no description found
          if (!description) {
            try {
              const command = this.config.findCommand(commandId);
              if (command && command.flags) {
                const flag = Object.entries(command.flags).find(([name, f]) => 
                  name === flagName || (f.char && f.char === flagName)
                );
                if (flag && flag[1].description) {
                  description = flag[1].description;
                }
              }
            } catch {
              // Ignore errors
            }
          }
        }
      
      items.push({ name: match, description });
    }
    
    // Calculate max width for alignment
    const maxNameWidth = Math.max(...items.map(item => item.name.length));
    
    // Display in zsh-like format
    for (const item of items) {
      const paddedName = item.name.padEnd(maxNameWidth + 2);
      if (item.description) {
        console.log(`  ${chalk.cyan(paddedName)} -- ${chalk.gray(item.description)}`);
      } else {
        console.log(`  ${chalk.cyan(paddedName)}`);
      }
    }
    
    // Redraw the prompt with current input
    if (this.rl) {
      this.rl.prompt(true);
    }
  }

  private _commandCache?: string[];
  
  /**
   * Check if we're running in web CLI mode
   */
  private isWebCliMode(): boolean {
    return process.env.ABLY_WEB_CLI_MODE === 'true';
  }
  
  /**
   * Check if we're running in anonymous web CLI mode
   */
  private isAnonymousWebMode(): boolean {
    return this.isWebCliMode() && process.env.ABLY_ANONYMOUS_USER_MODE === 'true';
  }
  
  /**
   * Check if command matches a pattern (supports wildcards)
   */
  private matchesCommandPattern(commandId: string, pattern: string): boolean {
    // Handle wildcard patterns
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return commandId === prefix || commandId.startsWith(prefix);
    }
    
    // Handle exact matches
    return commandId === pattern;
  }
  
  /**
   * Check if a command should be filtered out based on restrictions
   */
  private isCommandRestricted(commandId: string): boolean {
    // Commands not suitable for interactive mode (exit is handled separately)
    if (INTERACTIVE_UNSUITABLE_COMMANDS.includes(commandId)) {
      return true;
    }
    
    // Check web CLI restrictions
    if (this.isWebCliMode()) {
      // Check base web CLI restrictions
      if (WEB_CLI_RESTRICTED_COMMANDS.some(pattern => 
        this.matchesCommandPattern(commandId, pattern)
      )) {
        return true;
      }
      
      // Check anonymous mode restrictions
      if (this.isAnonymousWebMode() && WEB_CLI_ANONYMOUS_RESTRICTED_COMMANDS.some(pattern => 
          this.matchesCommandPattern(commandId, pattern)
        )) {
          return true;
        }
    }
    
    return false;
  }
  
  private setupKeypressHandler() {
    // Enable keypress events on stdin
    readline.emitKeypressEvents(process.stdin);
    
    // Enable raw mode for keypress handling
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      // Note: We don't call setRawMode(true) here because readline manages it
      // The keypress event handler will still work
      process.stdin.on('keypress', (str, key) => {
        // Debug logging for all keypresses
        if (process.env.ABLY_DEBUG_KEYS === 'true') {
          const keyInfo = key ? {
            name: key.name,
            ctrl: key.ctrl,
            meta: key.meta,
            shift: key.shift,
            sequence: key.sequence ? [...key.sequence].map(c => 
              `\\x${(c as string).codePointAt(0)?.toString(16).padStart(2, '0') ?? '00'}`
            ).join('') : undefined
          } : null;
          console.error(`[DEBUG] Keypress event - str: "${str}", key:`, JSON.stringify(keyInfo));
        }
        
        if (!key) return;
        
        // Ctrl+R: Start or cycle through history search
        if (key.ctrl && key.name === 'r') {
          if (this.historySearch.active) {
            this.cycleHistorySearch();
          } else {
            this.startHistorySearch();
          }
          return;
        }
        
        // Handle keys during history search
        if (this.historySearch.active) {
          // Escape: Exit history search
          if (key.name === 'escape') {
            this.exitHistorySearch();
            return;
          }
          
          // Enter: Accept current match
          if (key.name === 'return') {
            this.acceptHistoryMatch();
            return;
          }
          
          // Backspace: Remove character from search
          if (key.name === 'backspace') {
            if (this.historySearch.searchTerm.length > 0) {
              this.historySearch.searchTerm = this.historySearch.searchTerm.slice(0, -1);
              this.updateHistorySearch();
            } else {
              // Exit search if no search term
              this.exitHistorySearch();
            }
            return;
          }
          
          // Regular character: Add to search term
          if (str && str.length === 1 && !key.ctrl && !key.meta) {
            this.historySearch.searchTerm += str;
            this.updateHistorySearch();
            return;
          }
        }
      });
    }
  }
  
  private startHistorySearch() {
    // Save current line state
    this.historySearch.originalLine = (this.rl as readline.Interface & {line?: string}).line || '';
    this.historySearch.originalCursorPos = (this.rl as readline.Interface & {cursor?: number}).cursor || 0;
    
    // Initialize search state
    this.historySearch.active = true;
    this.historySearch.searchTerm = '';
    this.historySearch.matches = [];
    this.historySearch.currentIndex = 0;
    
    // Update display
    this.updateHistorySearchDisplay();
  }
  
  private updateHistorySearch() {
    // Get history from readline
    const history = (this.rl as readline.Interface & {history?: string[]}).history || [];
    
    // Find matches (search from most recent to oldest)
    // Note: readline stores history in reverse order (most recent first)
    this.historySearch.matches = [];
    for (let i = 0; i < history.length; i++) {
      const command = history[i];
      if (command.toLowerCase().includes(this.historySearch.searchTerm.toLowerCase())) {
        this.historySearch.matches.push(command);
      }
    }
    
    // Reset index to show most recent match
    this.historySearch.currentIndex = 0;
    
    // Update display
    this.updateHistorySearchDisplay();
  }
  
  private cycleHistorySearch() {
    if (this.historySearch.matches.length === 0) return;
    
    // Cycle to next match
    this.historySearch.currentIndex = (this.historySearch.currentIndex + 1) % this.historySearch.matches.length;
    
    // Update display
    this.updateHistorySearchDisplay();
  }
  
  private updateHistorySearchDisplay() {
    // Clear current line
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    
    if (this.historySearch.matches.length > 0) {
      // Show current match
      const currentMatch = this.historySearch.matches[this.historySearch.currentIndex];
      const searchPrompt = `(reverse-i-search\`${this.historySearch.searchTerm}'): `;
      
      // Write the search prompt and matched command
      process.stdout.write(chalk.dim(searchPrompt) + currentMatch);
      
      // Update readline's internal state
      (this.rl as readline.Interface & {line?: string}).line = currentMatch;
      (this.rl as readline.Interface & {cursor?: number}).cursor = currentMatch.length;
    } else {
      // No matches found
      const searchPrompt = `(failed reverse-i-search\`${this.historySearch.searchTerm}'): `;
      process.stdout.write(chalk.dim(searchPrompt));
      
      // Clear readline's line
      (this.rl as readline.Interface & {line?: string}).line = '';
      (this.rl as readline.Interface & {cursor?: number}).cursor = 0;
    }
  }
  
  private acceptHistoryMatch() {
    if (this.historySearch.matches.length === 0) {
      this.exitHistorySearch();
      return;
    }
    
    // Get current match
    const currentMatch = this.historySearch.matches[this.historySearch.currentIndex];
    
    // Exit search mode
    this.historySearch.active = false;
    
    // Clear and redraw with normal prompt
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    
    // Set the line and display it
    (this.rl as readline.Interface & {line?: string}).line = currentMatch;
    (this.rl as readline.Interface & {cursor?: number}).cursor = currentMatch.length;
    this.rl.prompt(true);
    
    // Write the command after the prompt
    process.stdout.write(currentMatch);
  }
  
  private exitHistorySearch() {
    // Exit search mode
    this.historySearch.active = false;
    
    // Clear current line
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    
    // Restore original line
    (this.rl as readline.Interface & {line?: string}).line = this.historySearch.originalLine;
    (this.rl as readline.Interface & {cursor?: number}).cursor = this.historySearch.originalCursorPos;
    
    // Redraw prompt with original content
    this.rl.prompt(true);
    process.stdout.write(this.historySearch.originalLine);
    readline.cursorTo(process.stdout, (this.rl as readline.Interface & {_prompt: {length: number}})._prompt.length + this.historySearch.originalCursorPos);
  }

}