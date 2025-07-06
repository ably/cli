// Ensure process exits with code 130 when killed by SIGINT
// This is important for shell scripts and wrappers to detect Ctrl+C

import { showInterruptFeedback } from './interrupt-feedback.js';

let sigintReceived = false;
let lastSigintTime = 0;

// Export a flag that other modules can check
export const isCleaningUp = () => sigintReceived;

// In interactive mode, we want to handle double Ctrl+C for force quit
// Single Ctrl+C is handled by readline and commands
if (process.env.ABLY_INTERACTIVE_MODE === 'true') {
  // Track SIGINT timing for double Ctrl+C detection
  process.on('SIGINT', () => {
    const now = Date.now();
    const timeSinceLastSigint = now - lastSigintTime;
    lastSigintTime = now;
    
    // If two SIGINTs within 500ms, force quit
    if (timeSinceLastSigint < 500) {
      console.error('\n⚠ Force quit');
      process.exit(130);
    }
    
    // Show feedback for first SIGINT during command execution
    // This will only show if a command is running (readline won't emit SIGINT at prompt)
    if (!sigintReceived) {
      sigintReceived = true;
      showInterruptFeedback();
      
      // Reset flag after a short delay
      setTimeout(() => {
        sigintReceived = false;
      }, 1000);
    }
  });
} else {
  // Non-interactive mode - keep original behavior
  setImmediate(() => {
    process.on('SIGINT', () => {
      // Set exit code to 130 (standard for SIGINT)
      process.exitCode = 130;
      
      // For non-interactive commands or if something goes wrong,
      // ensure we exit after a timeout
      setTimeout(() => {
        process.exit(130);
      }, 1000).unref();
    });
  });
}

export {};