import * as fs from 'node:fs';

export interface TerminalState {
  timestamp: string;
  event: string;
  stdin: {
    isTTY: boolean | undefined;
    fd?: number;
    readable?: boolean;
    destroyed?: boolean;
    rawMode?: boolean;
  };
  stdout: {
    isTTY: boolean | undefined;
    fd?: number;
    writable?: boolean;
    destroyed?: boolean;
  };
  process: {
    pid: number;
    ppid: number;
    exitCode?: number | null;
  };
  error?: string;
}

export class TerminalDiagnostics {
  private static logs: TerminalState[] = [];
  
  static log(event: string, error?: Error): void {
    if (!process.env.TERMINAL_DIAGNOSTICS) return;
    
    const state: TerminalState = {
      timestamp: new Date().toISOString(),
      event,
      stdin: {
        isTTY: process.stdin.isTTY,
        fd: process.stdin.isTTY ? (process.stdin as NodeJS.ReadStream & { fd?: number }).fd : undefined,
        readable: process.stdin.readable,
        destroyed: process.stdin.destroyed,
      },
      stdout: {
        isTTY: process.stdout.isTTY,
        fd: process.stdout.isTTY ? (process.stdout as NodeJS.WriteStream & { fd?: number }).fd : undefined,
        writable: process.stdout.writable,
        destroyed: process.stdout.destroyed,
      },
      process: {
        pid: process.pid,
        ppid: process.ppid,
        exitCode: process.exitCode as number | null | undefined,
      }
    };
    
    // Try to get raw mode state
    if (process.stdin.isTTY && process.stdin.isRaw !== undefined) {
      state.stdin.rawMode = process.stdin.isRaw;
    }
    
    if (error) {
      const err = error as Error & { code?: string; errno?: number };
      state.error = `${err.name}: ${err.message} (code: ${err.code}, errno: ${err.errno})`;
    }
    
    this.logs.push(state);
    
    // Also log to stderr for immediate visibility
    console.error(`[TERMINAL_DIAG] ${event}:`, JSON.stringify(state, null, 2));
  }
  
  static save(): void {
    if (!process.env.TERMINAL_DIAGNOSTICS) return;
    
    const logPath = `/tmp/ably-terminal-diag-${process.pid}.json`;
    try {
      fs.writeFileSync(logPath, JSON.stringify(this.logs, null, 2));
      console.error(`[TERMINAL_DIAG] Saved diagnostics to: ${logPath}`);
    } catch (error) {
      console.error(`[TERMINAL_DIAG] Failed to save diagnostics:`, error);
    }
  }
  
  static installHandlers(): void {
    if (!process.env.TERMINAL_DIAGNOSTICS) return;
    
    // Log process events
    process.on('SIGINT', () => this.log('SIGINT received'));
    process.on('SIGTERM', () => this.log('SIGTERM received'));
    process.on('exit', (code) => {
      this.log(`Process exiting with code ${code}`);
      this.save();
    });
    
    // Log uncaught errors
    process.on('uncaughtException', (err) => {
      this.log('Uncaught exception', err);
    });
    
    // Monitor stdin state changes
    if (process.stdin.isTTY) {
      const stdinWithRaw = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => NodeJS.ReadStream };
      const originalSetRawMode = stdinWithRaw.setRawMode;
      if (originalSetRawMode) {
        stdinWithRaw.setRawMode = function(mode: boolean): NodeJS.ReadStream {
          TerminalDiagnostics.log(`setRawMode(${mode}) called`);
          try {
            const result = originalSetRawMode.call(this, mode);
            TerminalDiagnostics.log(`setRawMode(${mode}) succeeded`);
            return result;
          } catch (error) {
            TerminalDiagnostics.log(`setRawMode(${mode}) failed`, error as Error);
            throw error;
          }
        };
      }
    }
  }
}

// Auto-install if diagnostics enabled
if (process.env.TERMINAL_DIAGNOSTICS) {
  TerminalDiagnostics.installHandlers();
  TerminalDiagnostics.log('Terminal diagnostics initialized');
}