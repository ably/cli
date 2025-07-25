// Utility functions for commands that need to stay alive until
// the user presses Ctrl+C *or* a timeout elapses.  A timeout can be
// supplied explicitly via the `--duration` flag or implicitly via the
// `ABLY_CLI_DEFAULT_DURATION` environment variable.
//
// The logic is intentionally tiny so that commands can just
// `await waitUntilInterruptedOrTimeout(durationSeconds)`.

export type ExitReason = "signal" | "timeout";

export async function waitUntilInterruptedOrTimeout(
  durationSeconds?: number,
): Promise<ExitReason> {
  // In test mode, we may have many instances running concurrently
  // Increase the max listeners to avoid warnings
  if (process.env.ABLY_CLI_TEST_MODE === "true") {
    const currentMax = process.getMaxListeners();
    if (currentMax < 50) {
      process.setMaxListeners(50);
    }
  }
  
  return new Promise<ExitReason>((resolve) => {
    let sigintHandler: (() => void) | undefined;
    let sigtermHandler: (() => void) | undefined;
    let resolved = false;
    
    const handleExit = (reason: ExitReason): void => {
      if (resolved) {
        return;
      }
      resolved = true;
      
      if (timeoutId) clearTimeout(timeoutId);
      
      // Remove signal handlers if they were installed
      if (sigintHandler) process.removeListener("SIGINT", sigintHandler);
      if (sigtermHandler) process.removeListener("SIGTERM", sigtermHandler);
      
      // For timeout cases in CLI commands, exit immediately to prevent hanging
      // This is especially important for E2E tests and automated scenarios
      if (reason === "timeout" && process.env.ABLY_CLI_TEST_MODE !== "true") {
        console.log("Duration elapsed – command finished cleanly.");
        // Small delay to ensure output is written to files/streams
        setTimeout(() => process.exit(0), 200);
        return;
      }
      
      resolve(reason);
    };

    // Optional duration based timeout. 0 / undefined => run forever.
    // Check explicit duration first, then environment variable
    let timeoutId: NodeJS.Timeout | undefined;
    const effectiveDuration =
      typeof durationSeconds === "number" && durationSeconds > 0
        ? durationSeconds
        : process.env.ABLY_CLI_DEFAULT_DURATION
        ? Number(process.env.ABLY_CLI_DEFAULT_DURATION) > 0
          ? Number(process.env.ABLY_CLI_DEFAULT_DURATION)
          : undefined
        : undefined;

    if (effectiveDuration) {
      timeoutId = setTimeout(() => {
        handleExit("timeout");
      }, effectiveDuration * 1000);
    }

    // Install signal handlers
    sigintHandler = (): void => handleExit("signal");
    sigtermHandler = (): void => handleExit("signal");

    process.once("SIGINT", sigintHandler);
    process.once("SIGTERM", sigtermHandler);
  });
}

// Helper function to ensure process exits cleanly after cleanup (now unused for timeout cases)
export function ensureProcessExit(exitReason: ExitReason, delayMs: number = 100): void {
  // Give a small delay for any final cleanup/logging, then force exit
  setTimeout(() => {
    process.exit(0);
  }, delayMs);
} 