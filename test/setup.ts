// Load environment variables from .env file for tests
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import * as Ably from 'ably';

// Ensure we're in test mode for all tests
process.env.ABLY_CLI_TEST_MODE = 'true';

// // Suppress known Ably errors that are expected in tests - REMOVED as handlers are commented out
// const KNOWN_ABLY_ERRORS = [
//   'unable to handle request; no application id found in request',
//   'Socket connection timed out',
//   'Unable to establish a socket connection',
//   'Connection failed'
// ];

// Track active resources for cleanup
const activeClients: (Ably.Rest | Ably.Realtime)[] = [];
const activeTimers: NodeJS.Timeout[] = [];

// We can't modify the Ably.Realtime constructor directly as it's readonly
// Instead, we'll use explicit tracking in our helper functions

// Set Ably log level to only show errors
if (process.env.ABLY_CLI_TEST_SHOW_OUTPUT) {
    // If output is shown, also make it verbose for debugging
    // console.warn('ABLY_CLI_TEST_SHOW_OUTPUT is set, enabling Ably verbose logging...');
    // (Ably.Realtime as unknown as { logLevel: number }).logLevel = 4;
    // Keep default error level if showing output
    (Ably.Realtime as unknown as { logLevel: number }).logLevel = 3;
} else {
  // Set Ably log level to suppress non-error messages
  (Ably.Realtime as unknown as { logLevel: number }).logLevel = 3; // 3 corresponds to Ably.LogLevel.Error
  // TEMPORARILY ENABLE VERBOSE LOGGING FOR DEBUGGING
  // console.warn('TEMPORARILY enabling Ably verbose logging for debugging...');
  // (Ably.Realtime as unknown as { logLevel: number }).logLevel = 4; // 4 corresponds to Ably.LogLevel.Verbose
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
    const clientType = client instanceof Ably.Realtime ? 'Realtime' : 'REST';
    let clientId = 'N/A';
    if (client instanceof Ably.Realtime && client.auth?.clientId) {
        clientId = client.auth.clientId;
    } else {
        const clientWithOptions = client as Ably.Rest & { options?: { clientId?: string } };
        if (clientWithOptions.options?.clientId) {
             clientId = clientWithOptions.options.clientId;
        }
    }
    console.log(`[Client Lifecycle] Tracking Ably ${clientType} client (ID: ${clientId}) at ${new Date().toISOString()}`);
    activeClients.push(client);
  }
}

// Global cleanup function to ensure all resources are released
async function globalCleanup() {
  const cleanupPromises: Promise<void>[] = [];
  const clientCount = activeClients.length;
  console.log(`Cleaning up ${clientCount} active Ably clients and resources...`);

  while (activeClients.length > 0) {
    const client = activeClients.shift();
    if (!client) continue;

    let clientId = 'N/A';
    if (client instanceof Ably.Realtime && client.auth?.clientId) {
        clientId = client.auth.clientId;
    } else {
        const clientWithOptions = client as Ably.Rest & { options?: { clientId?: string } };
        if (clientWithOptions.options?.clientId) {
             clientId = clientWithOptions.options.clientId;
        }
    }

    const cleanupPromise = new Promise<void>((resolve, reject) => {
        // Introduce a timeout for the entire close operation
        const timeoutId = setTimeout(() => {
            console.warn(`[Cleanup] Timeout closing client (ID: ${clientId}), forcing resolve.`);
            reject(new Error(`Timeout closing client (ID: ${clientId})`));
        }, 5000); // 5-second timeout

        try {
            if (client instanceof Ably.Realtime && client.connection) {
                const currentState = client.connection.state;
                console.log(`[Cleanup] Processing Realtime client (ID: ${clientId}, State: ${currentState})`);

                if (currentState === 'closed' || currentState === 'failed' || currentState === 'suspended') {
                    console.log(`[Cleanup] Client (ID: ${clientId}) already in final state, skipping close.`);
                    clearTimeout(timeoutId);
                    resolve();
                } else {
                    // Add listeners for close and failed events
                    const closeListener = () => {
                        console.log(`[Cleanup] Client (ID: ${clientId}) closed successfully.`);
                        clearTimeout(timeoutId);
                        // Remove listeners to prevent memory leaks
                        client.connection.off('closed', closeListener);
                        client.connection.off('failed', failedListener);
                        resolve();
                    };

                    const failedListener = (stateChange: Ably.ConnectionStateChange) => {
                        const errorInfo = stateChange.reason || new Ably.ErrorInfo('Unknown error during close', 50000, 500); // Provide a default if reason is missing
                        console.warn(`[Cleanup] Client (ID: ${clientId}) connection failed during close:`, errorInfo);
                        clearTimeout(timeoutId);
                         // Remove listeners to prevent memory leaks
                        client.connection.off('closed', closeListener);
                        client.connection.off('failed', failedListener);
                        // Resolve anyway, as we attempted cleanup
                        resolve();
                    };

                    client.connection.once('closed', closeListener);
                    client.connection.once('failed', failedListener);

                    // Initiate close
                    client.close();
                    console.log(`[Cleanup] Initiated close for client (ID: ${clientId})`);
                }
            } else if (client instanceof Ably.Rest) {
                console.log(`[Cleanup] Tracking REST client (ID: ${clientId}) - no action needed.`);
                clearTimeout(timeoutId);
                resolve();
            } else {
                console.warn(`[Cleanup] Unknown client type encountered.`);
                clearTimeout(timeoutId);
                resolve();
            }
        } catch (error) {
            clearTimeout(timeoutId);
            const clientIdOnError = clientId; // Already determined above
            console.error(`[Client Lifecycle] Error during client processing (ID: ${clientIdOnError}):`, error);
            resolve();
        }
    });

    cleanupPromises.push(cleanupPromise.catch(error => {
        // Catch potential promise rejections (e.g., from timeout)
        // Log the error but don't prevent Promise.all from settling
        // Use the clientId captured in the outer scope for logging
        console.error(`[Client Lifecycle] Promise rejection during cleanup for client (ID: ${clientId}):`, error);
    }));
  }

  // Use Promise.allSettled to wait for all cleanup attempts
  const results = await Promise.allSettled(cleanupPromises);
  console.log(`[Client Lifecycle] Finished processing ${clientCount} client cleanup attempts at ${new Date().toISOString()}.`);
  results.forEach((result, index) => {
      if (result.status === 'rejected') {
          // Errors are already logged within the promise/catch block
          console.warn(`[Client Lifecycle] Cleanup attempt ${index + 1} failed (see previous logs).`);
      }
  });

  // activeClients array should be empty now due to shift()

  // Clear all active timers
  for (const timer of activeTimers) {
    clearTimeout(timer);
  }

  // Clear the active timers array
  activeTimers.length = 0;

  // Attempt to force garbage collection if available
  if (globalThis.gc) {
    console.log('Forcing garbage collection...');
    globalThis.gc();
  }
}

try {
  // Force exit after 2 minutes maximum to prevent hanging
  const MAX_TEST_RUNTIME = 2 * 60 * 1000; // 2 minutes
  const exitTimer = setTimeout(() => {
    console.error('Tests exceeded maximum runtime of 2 minutes. Force exiting.');
    // Run global cleanup before exiting
    globalCleanup().then(() => {
      process.exit(1);
    }).catch(() => {
      process.exit(1);
    });
  }, MAX_TEST_RUNTIME);

  // Track timer for cleanup
  activeTimers.push(exitTimer);

  // Ensure timer doesn't keep the process alive
  exitTimer.unref();

  // Handle termination signals for clean exit
  ['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
      console.log(`\nReceived ${signal}, cleaning up and exiting tests...`);
      globalCleanup().then(() => {
        process.exit(0);
      }).catch(() => {
        process.exit(0);
      });
    });
  });

  // Handle unhandled promise rejections
  /* // Temporarily disable for debugging _ErrorInfo
  process.on('unhandledRejection', (reason) => {
    // Only log unhandled rejections if not a known test-related issue
    if (reason instanceof Error) {
      // Don't log known Ably errors
      const isKnownAblyError = KNOWN_ABLY_ERRORS.some(errMsg =>
        reason.message.includes(errMsg)
      );

      if (!isKnownAblyError && process.exitCode !== 0) {
    console.error('Unhandled rejection:', reason);
      }
    } else if (process.exitCode !== 0) {
      console.error('Unhandled rejection (non-Error):', reason);
    }
    // Don't exit, but log for debugging purposes
  });
  */

  // Handle uncaught errors to ensure tests don't hang
  /* // Temporarily disable for debugging _ErrorInfo
  process.on('uncaughtException', (err) => {
    // Only log uncaught exceptions if not a known test-related issue
    const isKnownAblyError = KNOWN_ABLY_ERRORS.some(errMsg =>
      err.message.includes(errMsg)
    );

    if (!isKnownAblyError && process.exitCode !== 0) {
    console.error('Uncaught exception:', err);
    }
    // Don't exit, but log for debugging purposes
  });
  */

  // Handle Node.js process errors
  process.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Process exited with code ${code}`);
    }
  });

  // Handle Node.js process warnings
  process.on('warning', (warning) => {
    console.warn('Process warning:', warning);
  });

  // Register a global cleanup function that can be used in tests
  (globalThis as { forceTestExit?: (code?: number) => void }).forceTestExit = (code = 0) => {
    globalCleanup().then(() => {
      process.exit(code);
    }).catch(() => {
      process.exit(code);
    });
  };

  // Run cleanup when tests finish
  /* // Relying on Mocha root hook instead
  process.on('beforeExit', () => {
    globalCleanup().catch(error => {
      console.error('Error during global cleanup:', error);
    });
    // Explicit GC call at the very end too
    if (globalThis.gc) {
      globalThis.gc();
    }
  });
  */

  // Load environment variables from .env
  const envPath = resolve(process.cwd(), '.env');

  // Only load .env file if it exists
  if (existsSync(envPath)) {
    const result = config({ path: envPath });

    if (result.error) {
      console.warn(`Warning: Error loading .env file: ${result.error.message}`);
    } else if (result.parsed) {
      console.log(`Loaded environment variables from .env file for tests`);
    }
  } else {
    console.log('No .env file found. Using environment variables from current environment.');
  }

} catch (error) {
  console.error('Error in test setup:', error);
  // Don't exit here, let the tests run anyway
}

// Expose the cleanup function for use in tests
export { globalCleanup };
