import { Command } from '@oclif/core';

/**
 * Base command class that provides interactive-mode-safe error handling.
 * When running in interactive mode, this class converts process.exit calls
 * to thrown errors that can be caught and handled gracefully.
 */
export abstract class InteractiveBaseCommand extends Command {
  /**
   * Override error to throw instead of exit in interactive mode
   */
  error(input: string | Error, options?: any): never {
    const error = typeof input === 'string' ? new Error(input) : input;
    
    // Add oclif error metadata
    (error as any).oclif = {
      exit: options?.exit ?? 1,
      code: options?.code
    };
    
    // In interactive mode, throw the error to be caught
    if (process.env.ABLY_INTERACTIVE_MODE === 'true') {
      if (process.env.DEBUG) {
        console.error('[InteractiveBaseCommand] Throwing error instead of exiting:', error.message);
      }
      throw error;
    }
    
    // In normal mode, use default behavior
    super.error(input, options);
    // TypeScript needs this even though super.error never returns
    throw new Error('Unreachable');
  }
  
  /**
   * Override exit to throw instead of exit in interactive mode
   */
  exit(code = 0): never {
    if (process.env.ABLY_INTERACTIVE_MODE === 'true') {
      const error = new Error(`Command exited with code ${code}`);
      (error as any).exitCode = code;
      (error as any).code = 'EEXIT';
      throw error;
    }
    
    super.exit(code);
    // TypeScript needs this even though super.exit never returns
    throw new Error('Unreachable');
  }
  
  /**
   * Override log to ensure proper output in interactive mode
   */
  log(message?: string, ...args: any[]): void {
    // Ensure logs are displayed properly in interactive mode
    if (message === undefined) {
      console.log();
    } else {
      console.log(message, ...args);
    }
  }
}