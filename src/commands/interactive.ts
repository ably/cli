import { Command } from '@oclif/core';
import * as readline from 'readline';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default class Interactive extends Command {
  static description = 'Launch interactive Ably shell (experimental)';
  static hidden = true; // Hide from help until stable

  private rl!: readline.Interface;
  private currentProcess?: ChildProcess;
  private commandRunning = false;
  
  // Commands known to be long-running that benefit from Ctrl+C
  private longRunningCommands = [
    'channels subscribe',
    'channels publish',
    'apps stats',
    'apps status',
  ];
  
  // Commands known to need interactive prompts
  private interactiveCommands = [
    'apps create',
    'apps delete',
    'keys create',
    'configure',
  ];

  async run() {
    this.setupReadline();
    console.log('Welcome to Ably interactive shell. Type "exit" to quit.');
    console.log('Ctrl+C handling: Enabled for long-running commands, delayed for interactive prompts.\n');
    this.rl.prompt();
  }

  private setupReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '$ ',
      terminal: true
    });

    this.rl.on('line', async (input) => {
      await this.handleCommand(input.trim());
    });

    // Handle SIGINT when readline is active (at prompt)
    this.rl.on('SIGINT', () => {
      if (!this.commandRunning) {
        console.log('^C');
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      this.cleanup();
      process.exit(0);
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

    const args = this.parseCommand(input);
    const commandType = this.detectCommandType(args);
    
    this.commandRunning = true;
    this.rl.pause();

    try {
      if (commandType === 'long-running') {
        await this.executeLongRunningCommand(args);
      } else {
        await this.executeStandardCommand(args);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
    } finally {
      this.commandRunning = false;
      this.rl.resume();
      this.rl.prompt();
    }
  }

  private detectCommandType(args: string[]): 'long-running' | 'interactive' | 'standard' {
    const commandStr = args.slice(0, 2).join(' ').toLowerCase();
    
    if (this.longRunningCommands.some(cmd => commandStr.startsWith(cmd))) {
      return 'long-running';
    }
    
    if (this.interactiveCommands.some(cmd => commandStr.startsWith(cmd))) {
      return 'interactive';
    }
    
    // Check for flags that indicate long-running behavior
    if (args.includes('--duration') || args.includes('--follow') || args.includes('--watch')) {
      return 'long-running';
    }
    
    return 'standard';
  }
  
  private async executeLongRunningCommand(args: string[]) {
    // Set up raw mode handler for Ctrl+C detection
    let dataHandler: ((chunk: Buffer) => void) | undefined;
    const wasRaw = process.stdin.isRaw;
    
    if (process.stdin.isTTY) {
      // Enable raw mode to catch Ctrl+C
      process.stdin.setRawMode(true);
      
      dataHandler = (chunk: Buffer) => {
        // Check for Ctrl+C (ASCII 3)
        for (let i = 0; i < chunk.length; i++) {
          if (chunk[i] === 3) {
            console.log('\n^C');
            if (this.currentProcess) {
              this.currentProcess.kill('SIGINT');
            }
            return;
          }
        }
        // For long-running commands, we don't forward other input
        // as they typically don't need interactive input
      };
      
      process.stdin.on('data', dataHandler);
    }
    
    try {
      await this.spawnCommand(args);
    } finally {
      // Restore terminal state
      if (dataHandler) {
        process.stdin.removeListener('data', dataHandler);
      }
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasRaw);
      }
    }
  }
  
  private async executeStandardCommand(args: string[]) {
    // For interactive commands, we accept the limitation that Ctrl+C won't work immediately
    // This ensures that prompts work correctly
    await this.spawnCommand(args);
  }
  
  private async spawnCommand(args: string[]): Promise<void> {
    const binPath = path.join(__dirname, '..', '..', '..', 'bin', 'run.js');
    
    this.currentProcess = spawn(process.execPath, [binPath, ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        ABLY_INTERACTIVE_MODE: 'true'
      },
      cwd: process.cwd()
    });
    
    return new Promise<void>((resolve) => {
      this.currentProcess!.on('exit', (code, signal) => {
        this.currentProcess = undefined;
        resolve();
      });
      
      this.currentProcess!.on('error', (err) => {
        console.error('Error:', err.message);
        this.currentProcess = undefined;
        resolve();
      });
    });
  }

  private parseCommand(input: string): string[] {
    // Handle quoted strings properly
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const args: string[] = [];
    let match;
    
    while ((match = regex.exec(input))) {
      args.push(match[1] || match[2] || match[0]);
    }
    
    return args;
  }

  private cleanup() {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
    }
    console.log('\nGoodbye!');
  }
}