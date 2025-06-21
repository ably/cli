// Load environment variables from .env file for tests
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import * as Ably from 'ably';

// Global type declarations for test mocks
declare global {
  var __TEST_MOCKS__: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ablyRestMock: any; // Keep simple 'any' type to match base-command.ts expectations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ablyChatMock?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ablySpacesMock?: any; 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ablyRealtimeMock?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  } | undefined;
}

// Ensure we're in test mode for all tests
process.env.ABLY_CLI_TEST_MODE = 'true';

// Track active resources for cleanup
const activeClients: (Ably.Rest | Ably.Realtime)[] = [];
const activeTimers: NodeJS.Timeout[] = [];
const globalProcessRegistry = new Set<number>();

// Global process tracking function
export function trackProcess(pid: number): void {
  globalProcessRegistry.add(pid);
  if (process.env.E2E_DEBUG === 'true' || process.env.TEST_DEBUG === 'true') {
    console.log(`Tracking process PID: ${pid}`);
  }
}

// Global process cleanup function
export async function cleanupGlobalProcesses(): Promise<void> {
  if (globalProcessRegistry.size > 0) {
    if (process.env.E2E_DEBUG === 'true' || process.env.TEST_DEBUG === 'true') {
      console.log(`Cleaning up ${globalProcessRegistry.size} tracked processes...`);
    }
    
    for (const pid of globalProcessRegistry) {
      try {
        // Check if process exists before trying to kill
        process.kill(pid, 0);
        if (process.env.E2E_DEBUG === 'true' || process.env.TEST_DEBUG === 'true') {
          console.log(`Killing tracked process PID: ${pid}`);
        }
        
        // Try graceful kill first
        process.kill(pid, 'SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Check if still alive and force kill
        try {
          process.kill(pid, 0);
          process.kill(pid, 'SIGKILL');
          if (process.env.E2E_DEBUG === 'true' || process.env.TEST_DEBUG === 'true') {
            console.log(`Force killed PID: ${pid}`);
          }
        } catch {
          // Ignore errors
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
          // Process already dead
        } else {
          console.warn(`Error killing process ${pid}:`, error);
        }
      }
    }
    
    globalProcessRegistry.clear();
  }

  // Also kill any processes matching our patterns
  try {
    await new Promise<void>((resolve) => {
      exec('pkill -f "bin/run.js.*subscribe"', () => {
        resolve();
      });
    });
    await new Promise<void>((resolve) => {
      exec('pkill -f "ably.*subscribe"', () => {
        resolve();
      });
    });
  } catch {
    // Ignore errors
  }
}

// Set Ably log level to only show errors
if (process.env.ABLY_CLI_TEST_SHOW_OUTPUT) {
    (Ably.Realtime as unknown as { logLevel: number }).logLevel = 3;
} else {
  // Set Ably log level to suppress non-error messages
  (Ably.Realtime as unknown as { logLevel: number }).logLevel = 3; // 3 corresponds to Ably.LogLevel.Error
}

// Suppress console output unless ABLY_CLI_TEST_SHOW_OUTPUT is set
if (!process.env.ABLY_CLI_TEST_SHOW_OUTPUT) {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  };

  // Override console methods to filter output
  console.log = (..._args) => {
    // Only show output for test failures or if the message contains critical keywords
    if (_args.some(arg => typeof arg === 'string' &&
        (arg.includes('failing') || arg.includes('Error:') || arg.includes('FAIL')))) {
      originalConsole.log(..._args);
    }
  };

  console.info = (..._args) => {
    // Suppress info messages completely during tests
    if (_args.some(arg => typeof arg === 'string' &&
        (arg.includes('Error:') || arg.includes('FAIL')))) {
      originalConsole.info(..._args);
    }
  };

  console.warn = (..._args) => {
    // Show warnings only if they're critical
    if (_args.some(arg => typeof arg === 'string' &&
        (arg.includes('Error:') || arg.includes('Warning:') || arg.includes('FAIL')))) {
      originalConsole.warn(..._args);
    }
  };

  console.error = (..._args) => {
    // Always show errors
    originalConsole.error(..._args);
  };

  console.debug = (..._args) => {
    // Suppress debug messages completely
  };

  // Store original methods for potential restoration
  (globalThis as unknown as { __originalConsole: typeof originalConsole }).__originalConsole = originalConsole;
}

/**
 * Utility to track an Ably client for cleanup
 */
export function trackAblyClient(client: Ably.Rest | Ably.Realtime): void {
  if (!activeClients.includes(client)) {
    activeClients.push(client);
  }
}

// Simplified global cleanup function
async function globalCleanup() {
  const clientCount = activeClients.length;
  if (clientCount > 0 && (process.env.E2E_DEBUG === 'true' || process.env.TEST_DEBUG === 'true')) {
    console.log(`Cleaning up ${clientCount} active Ably clients...`);
  }

  // Clean up processes first
  await cleanupGlobalProcesses();

  // Close all clients with timeout
  const cleanup = activeClients.map(async (client) => {
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(); // Force resolve after timeout
      }, 2000); // 2 second timeout per client

      try {
        if (client instanceof Ably.Realtime && client.connection) {
          if (client.connection.state === 'closed' || client.connection.state === 'failed') {
            clearTimeout(timeout);
            resolve();
          } else {
            client.connection.once('closed', () => {
              clearTimeout(timeout);
              resolve();
            });
            client.connection.once('failed', () => {
              clearTimeout(timeout);
              resolve();
            });
            client.close();
          }
        } else {
          clearTimeout(timeout);
          resolve();
        }
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  // Wait for all cleanups with overall timeout
  try {
    await Promise.race([
      Promise.all(cleanup),
      new Promise(resolve => setTimeout(resolve, 5000)) // 5 second overall timeout
    ]);
  } catch {
    // Ignore cleanup errors
  }

  // Clear arrays
  activeClients.length = 0;
  
  // Clear all active timers
  for (const timer of activeTimers) {
    clearTimeout(timer);
  }
  activeTimers.length = 0;

  // Force garbage collection if available
  if (globalThis.gc) {
    globalThis.gc();
  }
}

try {
  // Force exit after maximum runtime to prevent hanging
  const MAX_TEST_RUNTIME = 600 * 1000; // 600 seconds (10 minutes) - sufficient for full test suite
  const exitTimer = setTimeout(() => {
    console.error('Tests exceeded maximum runtime. Force exiting.');
    process.exit(1);
  }, MAX_TEST_RUNTIME);

  // Track timer for cleanup
  activeTimers.push(exitTimer);

  // Ensure timer doesn't keep the process alive
  exitTimer.unref();

  // Handle termination signals for clean exit
  ['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
      console.log(`\nReceived ${signal}, cleaning up and exiting tests...`);
      globalCleanup().finally(() => {
        process.exit(0);
      });
    });
  });

  // Handle uncaught exceptions to ensure cleanup
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    globalCleanup().finally(() => {
      process.exit(1);
    });
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection at:', promise, 'reason:', reason);
    globalCleanup().finally(() => {
      process.exit(1);
    });
  });

  // Add cleanup on process exit
  process.on('exit', () => {
    // Note: Can't use async here, so do synchronous cleanup
    if (process.env.E2E_DEBUG === 'true' || process.env.TEST_DEBUG === 'true') {
      console.log('Process exiting, attempting final cleanup...');
    }
    try {
      for (const pid of globalProcessRegistry) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Ignore errors
        }
      }
    } catch {
      // Ignore errors
    }
  });

  // Register a global cleanup function that can be used in tests
  (globalThis as { forceTestExit?: (code?: number) => void }).forceTestExit = (code = 0) => {
    globalCleanup().finally(() => {
      process.exit(code);
    });
  };

  // Load environment variables from .env
  const envPath = resolve(process.cwd(), '.env');

  // Only load .env file if it exists
  if (existsSync(envPath)) {
    const result = config({ path: envPath });

    if (result.error) {
      console.warn(`Warning: Error loading .env file: ${result.error.message}`);
    } else if (result.parsed) {
      if (process.env.E2E_DEBUG === 'true' || process.env.TEST_DEBUG === 'true') {
        console.log(`Loaded environment variables from .env file for tests`);
      }
    }
  } else {
    if (process.env.E2E_DEBUG === 'true' || process.env.TEST_DEBUG === 'true') {
      console.log('No .env file found. Using environment variables from current environment.');
    }
  }

} catch (error) {
  console.error('Error in test setup:', error);
  // Don't exit here, let the tests run anyway
}

// Expose the cleanup function for use in tests
export { globalCleanup };
