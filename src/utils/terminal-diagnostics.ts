import * as fs from 'fs';
import * as tty from 'tty';

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
        fd: process.stdin.isTTY ? (process.stdin as any).fd : undefined,
        readable: process.stdin.readable,
        destroyed: process.stdin.destroyed,
      },
      stdout: {
        isTTY: process.stdout.isTTY,
        fd: process.stdout.isTTY ? (process.stdout as any).fd : undefined,
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
      state.error = `${error.name}: ${error.message} (code: ${(error as any).code}, errno: ${(error as any).errno})`;
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
    } catch (err) {
      console.error(`[TERMINAL_DIAG] Failed to save diagnostics:`, err);
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
      const originalSetRawMode = (process.stdin as any).setRawMode;
      if (originalSetRawMode) {
        (process.stdin as any).setRawMode = function(mode: boolean) {
          TerminalDiagnostics.log(`setRawMode(${mode}) called`);
          try {
            const result = originalSetRawMode.call(this, mode);
            TerminalDiagnostics.log(`setRawMode(${mode}) succeeded`);
            return result;
          } catch (err) {
            TerminalDiagnostics.log(`setRawMode(${mode}) failed`, err as Error);
            throw err;
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