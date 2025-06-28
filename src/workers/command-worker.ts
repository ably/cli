import { execute } from '@oclif/core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function initialize() {
  try {
    // Just send ready signal - no need to preload config
    // execute() will handle all initialization
    process.send!({ type: 'ready' });
  } catch (error: any) {
    console.error('Worker initialization failed:', error);
    process.send!({ type: 'error', error: error.message });
    process.exit(1);
  }
}

// Handle messages from parent
process.on('message', async (msg: any) => {
  if (msg.type === 'execute') {
    isExecuting = true;
    try {
      const { args } = msg;
      
      // Run the command using execute
      // This will handle nested commands properly
      const projectRoot = join(__dirname, '..', '..', '..');
      currentExecution = execute({ 
        args, 
        dir: projectRoot
      }) as Promise<void>;
      
      await currentExecution;
      
      // Send success result
      process.send!({ 
        type: 'result', 
        data: { exitCode: 0 } 
      });
    } catch (error: any) {
      // Check if error was due to SIGINT
      if (error.code === 'SIGINT' || error.signal === 'SIGINT') {
        // Don't send error for SIGINT, just exit
        process.exit(130);
      } else {
        // Debug: console.error(`Worker error: ${error.message}`);
        // Send error result
        process.send!({ 
          type: 'result', 
          data: { 
            exitCode: 1, 
            error: error.message 
          } 
        });
      }
    } finally {
      isExecuting = false;
      currentExecution = null;
    }
  }
});

// Track if we're currently executing a command
let isExecuting = false;
let currentExecution: Promise<void> | null = null;


// Handle process termination
process.on('SIGINT', async () => {
  // If we're executing a command, wait briefly for it to handle the signal
  if (isExecuting && currentExecution) {
    // Give the command a chance to clean up (max 1 second)
    const timeout = setTimeout(() => {
      process.exit(130);
    }, 1000);
    
    try {
      await currentExecution;
      clearTimeout(timeout);
    } catch (error) {
      clearTimeout(timeout);
    }
  }
  process.exit(130);
});

process.on('SIGTERM', () => {
  process.exit(143);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Worker uncaught exception:', error);
  process.send!({ 
    type: 'error', 
    error: `Uncaught exception: ${error.message}` 
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Worker unhandled rejection at:', promise, 'reason:', reason);
  process.send!({ 
    type: 'error', 
    error: `Unhandled rejection: ${reason}` 
  });
  process.exit(1);
});

// Initialize worker when started
initialize().catch(error => {
  console.error('Failed to initialize worker:', error);
  process.exit(1);
});