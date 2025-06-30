import { Command, Config, execute } from '@oclif/core';
import * as readline from 'readline';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { HistoryManager } from '../services/history-manager.js';
import { displayLogo } from '../utils/logo.js';
import CustomHelp from '../help.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class Interactive extends Command {
  static description = 'Launch interactive Ably shell (experimental)';
  static hidden = true; // Hide from help until stable
  static EXIT_CODE_USER_EXIT = 42; // Special code for 'exit' command

  private rl!: readline.Interface;
  private historyManager!: HistoryManager;
  private isWrapperMode = process.env.ABLY_WRAPPER_MODE === '1';
  private oclifConfig!: Config;

  async run() {
    // Set environment variable to indicate we're in interactive mode
    process.env.ABLY_INTERACTIVE_MODE = 'true';
    
    // Store readline instance globally for hooks to access
    (global as any).__ablyInteractiveReadline = null;
    
    // Initialize oclif config for command execution
    this.oclifConfig = await Config.load({
      root: path.join(__dirname, '..', '..', '..')
    });

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
  }

  private setupReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '$ ',
      terminal: true
    });
    
    // Store readline instance globally for hooks to access
    (global as any).__ablyInteractiveReadline = this.rl;

    this.rl.on('line', async (input) => {
      await this.handleCommand(input.trim());
    });

    this.rl.on('SIGINT', () => {
      // Show yellow warning message
      console.log('\n\x1b[33mSignal received. To exit this shell, type \'exit\' and press Enter.\x1b[0m');
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

    try {
      const args = this.parseCommand(input);
      
      // Execute command inline (no spawning)
      await execute({
        args,
        dir: this.oclifConfig.root
      });
      
    } catch (error: any) {
      if (error.code === 'EEXIT') {
        // Normal oclif exit - don't treat as error
        return;
      }
      console.error('Error:', error.message);
    } finally {
      this.rl.prompt();
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
      } else if (match[2] !== undefined) {
        args.push(match[2]);
      } else {
        args.push(match[0]);
      }
    }
    
    return args;
  }

  private cleanup() {
    console.log('\nGoodbye!');
  }
}