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
  return new Promise<ExitReason>((resolve) => {
    const handleExit = (reason: ExitReason): void => {
      if (timeoutId) clearTimeout(timeoutId);
      process.removeListener("SIGINT", sigintHandler);
      process.removeListener("SIGTERM", sigtermHandler);
      
      // For timeout cases in CLI commands, exit immediately to prevent hanging
      // This is especially important for E2E tests and automated scenarios
      if (reason === "timeout") {
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

    const sigintHandler = (): void => handleExit("signal");
    const sigtermHandler = (): void => handleExit("signal");

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