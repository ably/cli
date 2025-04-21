// Load environment variables from .env file for tests
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

try {
  // Force exit after 3 minutes maximum to prevent hanging
  const MAX_TEST_RUNTIME = 3 * 60 * 1000; // 3 minutes
  const exitTimer = setTimeout(() => {
    console.error('Tests exceeded maximum runtime of 3 minutes. Force exiting.');
    process.exit(1);
  }, MAX_TEST_RUNTIME);

  // Ensure timer doesn't keep the process alive
  exitTimer.unref();

  // Handle termination signals for clean exit
  ['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
      console.log(`\nReceived ${signal}, exiting tests...`);
      process.exit(0);
    });
  });

  // Handle uncaught errors to ensure tests don't hang
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    // Don't exit here to avoid false positives, but log the error
  });

  // Register a global cleanup function that can be used in tests
  (globalThis as { forceTestExit?: (code?: number) => void }).forceTestExit = (code = 0) => {
    process.exit(code);
  };

  // Load environment variables from .env
  const envPath = resolve(process.cwd(), '.env');

  // Only load .env file if it exists
  if (existsSync(envPath)) {
    const result = config({ path: envPath });

    if (result.error) {
      console.warn(`Warning: Error loading .env file: ${result.error.message}`);
    } else if (result.parsed) {
      console.info(`Loaded environment variables from .env file for tests`);
    }
  } else {
    console.info('No .env file found. Using environment variables from current environment.');
  }

} catch (error) {
  console.error('Error in test setup:', error);
  // Don't exit here, let the tests run anyway
}
