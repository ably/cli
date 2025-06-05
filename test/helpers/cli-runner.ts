import { spawn, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { trackProcess } from '../setup.js';
import { trackRunner } from './cli-runner-store.js';

export interface RunnerOpts {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs?: number;
  ready?: {
    matcher: RegExp | string;
    jsonPath?: string;
  };
  logLabel?: string;
}

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

// Type for current test context
interface TestContext {
  fullTitle(): string;
  state?: string;
  err?: Error;
}

export class CliRunner extends EventTarget {
  private process: ChildProcess | null = null;
  private outputStream: fs.WriteStream | null = null;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private combinedBuffer = '';
  private processExitCode: number | null = null;
  private killed = false;
  private readyPromise: Promise<void> | null = null;
  private timeoutHandle: NodeJS.Timeout | null = null;

  constructor(
    private cmd: string,
    private outfile: string,
    private opts: RunnerOpts = {}
  ) {
    super();
    this.opts = {
      timeoutMs: 30000,
      cwd: process.cwd(),
      logLabel: 'CLI',
      ...opts
    };

    // Auto-track this runner if we're in a test context
    const currentTest = (globalThis as Record<string, unknown>).currentTest;
    if (typeof globalThis !== 'undefined' && currentTest) {
      trackRunner(currentTest as TestContext, this);
    }
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Process already started');
    }

    // Ensure output file exists before spawning
    await this.ensureOutputFile();
    
    // Start the process
    await this.spawnProcess();
    
    // Set up ready detection if requested
    if (this.opts.ready) {
      this.readyPromise = this.waitForReady();
    }
  }

  async waitUntilReady(): Promise<void> {
    if (!this.readyPromise) {
      throw new Error('No ready configuration provided');
    }
    return this.readyPromise;
  }

  async kill(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    if (this.killed || !this.process) {
      return;
    }

    this.killed = true;
    
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }

    return new Promise<void>((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      const cleanup = () => {
        if (this.outputStream && !this.outputStream.destroyed) {
          this.outputStream.end();
        }
        resolve();
      };

      this.process.once('exit', cleanup);
      
      // Give the process a chance to exit gracefully
      this.process.kill(signal);
      
      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
        cleanup();
      }, 5000);
    });
  }

  stdout(): string {
    return this.stdoutBuffer;
  }

  stderr(): string {
    return this.stderrBuffer;
  }

  combined(): string {
    return this.combinedBuffer;
  }

  exitCode(): number | null {
    return this.processExitCode;
  }

  isRunning(): boolean {
    return this.process !== null && this.processExitCode === null && !this.killed;
  }

  getCommand(): string {
    return this.cmd;
  }

  private emitEvent(type: string): void {
    this.dispatchEvent(new Event(type));
  }

  private async ensureOutputFile(): Promise<void> {
    const dir = path.dirname(this.outfile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Create empty file
    fs.writeFileSync(this.outfile, '');
  }

  private async spawnProcess(): Promise<void> {
    const env = { ...process.env, ...this.opts.env };
    
    // Determine if this is a CLI command or shell command
    const isCli = this.cmd.startsWith('ably ') || this.cmd.startsWith('bin/run.js');
    
    let spawnCmd: string;
    let spawnArgs: string[];
    
    if (isCli) {
      // Parse CLI command
      const parts = this.cmd.split(' ');
      if (parts[0] === 'ably') {
        spawnCmd = 'node';
        spawnArgs = ['bin/run.js', ...parts.slice(1)];
      } else if (parts[0] === 'bin/run.js') {
        spawnCmd = 'node';
        spawnArgs = parts;
      } else {
        throw new Error(`Unrecognized CLI command format: ${this.cmd}`);
      }
    } else {
      spawnCmd = 'sh';
      spawnArgs = ['-c', this.cmd];
    }

    console.log(`[${this.opts.logLabel}] Starting process: ${spawnCmd} ${spawnArgs.join(' ')}`);

    this.process = spawn(spawnCmd, spawnArgs, {
      stdio: 'pipe',
      env,
      cwd: this.opts.cwd,
      detached: false
    });

    if (!this.process.pid) {
      throw new Error('Failed to start process: no PID assigned');
    }

    // Track for global cleanup
    trackProcess(this.process.pid);

    // Set up output capture
    this.setupOutputCapture();
    
    // Set up timeout
    if (this.opts.timeoutMs && this.opts.timeoutMs > 0) {
      this.timeoutHandle = setTimeout(() => {
        console.warn(`[${this.opts.logLabel}] Process timed out after ${this.opts.timeoutMs}ms, killing`);
        this.kill('SIGKILL');
      }, this.opts.timeoutMs);
    }

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      console.log(`[${this.opts.logLabel}] Process exited with code=${code}, signal=${signal}`);
      this.processExitCode = code;
      
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
      }
      
      // Flush final output
      this.flushOutput();
      
      this.emitEvent('exit');
    });

    this.process.on('error', (error) => {
      console.error(`[${this.opts.logLabel}] Process error:`, error);
      this.emitEvent('error');
    });
  }

  private setupOutputCapture(): void {
    if (!this.process) return;

    // Create output stream
    this.outputStream = fs.createWriteStream(this.outfile, { flags: 'a' });
    
    // Capture stdout
    this.process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.stdoutBuffer += text;
      this.combinedBuffer += text;
      this.outputStream?.write(data);
      this.emitEvent('data');
    });

    // Capture stderr  
    this.process.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.stderrBuffer += text;
      this.combinedBuffer += text;
      this.outputStream?.write(data);
      this.emitEvent('data');
    });

    // Periodic flush in CI environments
    if (process.env.CI) {
      const flushInterval = setInterval(() => {
        if (this.outputStream && !this.outputStream.destroyed) {
          // Force sync for reliable file reads
          try {
            if ('fd' in this.outputStream) {
              fs.fsyncSync((this.outputStream as { fd: number }).fd);
            }
          } catch {
            // Ignore sync errors
          }
        }
      }, 200);

      this.process.on('exit', () => {
        clearInterval(flushInterval);
      });
    }
  }

  private flushOutput(): void {
    if (this.outputStream && !this.outputStream.destroyed) {
      this.outputStream.end();
    }
  }

  private async waitForReady(): Promise<void> {
    if (!this.opts.ready) {
      throw new Error('No ready configuration');
    }

    const { matcher, jsonPath } = this.opts.ready;
    const timeoutMs = this.opts.timeoutMs || 30000;

    return new Promise<void>((resolve, reject) => {
      const startTime = Date.now();
      
      const checkReady = () => {
        if (this.killed || this.processExitCode !== null) {
          reject(new Error(`Process exited before ready signal detected. Exit code: ${this.processExitCode}`));
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Timeout waiting for ready signal "${matcher}". Output:\n${this.combinedBuffer.slice(-1000)}`));
          return;
        }

        const output = this.combinedBuffer;
        let signalFound = false;

        if (matcher instanceof RegExp) {
          signalFound = matcher.test(output);
        } else if (typeof matcher === 'string') {
          if (jsonPath) {
            // Look for JSON and check path
            try {
              const lines = output.split('\n');
              for (const line of lines) {
                if (line.includes(matcher)) {
                  const json = JSON.parse(line);
                  const value = this.getJsonPath(json, jsonPath);
                  if (value) {
                    signalFound = true;
                    break;
                  }
                }
              }
            } catch {
              // Not valid JSON, fall back to string matching
              signalFound = output.includes(matcher);
            }
          } else {
            signalFound = output.includes(matcher);
          }
        }

        if (signalFound) {
          console.log(`[${this.opts.logLabel}] Ready signal detected: "${matcher}"`);
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };

      // Start checking
      checkReady();
    });
  }

  private getJsonPath(obj: unknown, path: string): unknown {
    const pathParts = path.split('.');
    let current = obj;
    
    for (const prop of pathParts) {
      if (current && typeof current === 'object' && prop in current) {
        current = (current as Record<string, unknown>)[prop];
      } else {
        return undefined;
      }
    }
    
    return current;
  }
}

// Utility functions for common patterns
export async function startCli(
  argv: string[],
  outfile: string, 
  opts: RunnerOpts = {}
): Promise<CliRunner> {
  const cmd = `ably ${argv.join(' ')}`;
  const runner = new CliRunner(cmd, outfile, opts);
  await runner.start();
  
  if (opts.ready) {
    await runner.waitUntilReady();
  }
  
  return runner;
}

export async function runCliOnce(
  argv: string[],
  opts: RunnerOpts = {}
): Promise<ProcessResult> {
  const tempFile = `/tmp/cli-runner-${Date.now()}-${Math.random().toString(36).slice(2)}.log`;
  const runner = new CliRunner(`ably ${argv.join(' ')}`, tempFile, opts);
  
  try {
    await runner.start();
    
    // Wait for process to complete
    return new Promise<ProcessResult>((resolve, reject) => {
      runner.addEventListener('exit', () => {
        resolve({
          exitCode: runner.exitCode(),
          stdout: runner.stdout(),
          stderr: runner.stderr()
        });
      });
      
      runner.addEventListener('error', () => {
        reject(new Error('Process failed'));
      });
    });
  } finally {
    // Cleanup temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
} 