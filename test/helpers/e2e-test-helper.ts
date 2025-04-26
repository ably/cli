import * as Ably from "ably";
import { randomUUID } from "node:crypto";
import { spawn, ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Mocha from "mocha";
import { trackAblyClient } from "../setup.js";
const { beforeEach, before, after, afterEach } = Mocha;

// Constants
export const E2E_API_KEY = process.env.E2E_ABLY_API_KEY;
export const SHOULD_SKIP_E2E = !E2E_API_KEY || process.env.SKIP_E2E_TESTS === 'true';

// Store active background processes and temp files for cleanup
const activeProcesses: Map<string, ChildProcess> = new Map();
const tempFiles: Set<string> = new Set();

/**
 * Generate a unique channel name to avoid collisions in tests
 */
export function getUniqueChannelName(prefix: string): string {
  return `${prefix}-test-${randomUUID()}`;
}

/**
 * Create a unique client ID for testing
 */
export function getUniqueClientId(prefix = "cli-e2e-test"): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * Create an Ably REST client for testing AND TRACK IT
 */
export function createAblyClient(): Ably.Rest {
  if (!E2E_API_KEY) {
    throw new Error("E2E_ABLY_API_KEY environment variable is required for E2E tests");
  }

  // Validate API Key structure
  if (!E2E_API_KEY.includes('.') || !E2E_API_KEY.includes(':')) {
      console.warn(`[Client Lifecycle] Potential Issue: E2E_ABLY_API_KEY "${E2E_API_KEY.slice(0, 10)}..." appears structurally invalid (missing '.' or ':'). Proceeding anyway.`);
      // Decide whether to throw an error or just warn based on strictness needed
      // throw new Error('Structurally invalid E2E_ABLY_API_KEY detected');
  }

  const clientId = getUniqueClientId();
  const keyPrefix = E2E_API_KEY.split(':')[0]?.split('.')[0] || 'unknown-app';
  const keyId = E2E_API_KEY.split(':')[0]?.split('.')[1]?.slice(0, 4) || 'unknown-key';
  console.log(`[Client Lifecycle] Creating Ably REST client (App: ${keyPrefix}, Key Prefix: ${keyId}, ClientID: ${clientId}) at ${new Date().toISOString()}`);

  const client = new Ably.Rest({
    key: E2E_API_KEY,
    clientId: clientId
  });

  // Track the created client
  trackAblyClient(client);
  return client;
}

/**
 * Create an Ably Realtime client for testing AND TRACK IT
 */
export function createAblyRealtimeClient(): Ably.Realtime {
  if (!E2E_API_KEY) {
    throw new Error("E2E_ABLY_API_KEY environment variable is required for E2E tests");
  }

  // Validate API Key structure
  if (!E2E_API_KEY.includes('.') || !E2E_API_KEY.includes(':')) {
      console.warn(`[Client Lifecycle] Potential Issue: E2E_ABLY_API_KEY "${E2E_API_KEY.slice(0, 10)}..." appears structurally invalid (missing '.' or ':'). Proceeding anyway.`);
      // Decide whether to throw an error or just warn based on strictness needed
      // throw new Error('Structurally invalid E2E_ABLY_API_KEY detected');
  }

  const clientId = getUniqueClientId();
  const keyPrefix = E2E_API_KEY.split(':')[0]?.split('.')[0] || 'unknown-app';
  const keyId = E2E_API_KEY.split(':')[0]?.split('.')[1]?.slice(0, 4) || 'unknown-key';
  console.log(`[Client Lifecycle] Creating Ably Realtime client (App: ${keyPrefix}, Key Prefix: ${keyId}, ClientID: ${clientId}) at ${new Date().toISOString()}`);

  const client = new Ably.Realtime({
    key: E2E_API_KEY,
    clientId: clientId
  });

  // Track the created client
  trackAblyClient(client);
  return client;
}

/**
 * Helper to publish a test message to a channel
 */
export async function publishTestMessage(channelName: string, messageData: Record<string, unknown>): Promise<void> {
  const client = createAblyClient(); // Client is tracked by createAblyClient
  const channel = client.channels.get(channelName);
  await channel.publish("test-event", messageData);
}

/**
 * Create a temporary file for capturing output AND TRACK IT
 */
export async function createTempOutputFile(): Promise<string> {
  const tempDir = os.tmpdir();
  const uniqueSuffix = randomUUID();
  const outputPath = path.join(tempDir, `ably-cli-test-${uniqueSuffix}.log`);
  await fs.writeFile(outputPath, '');
  // Track the file for cleanup
  tempFiles.add(outputPath);
  return outputPath;
}

/**
 * Run a CLI command in the background, wait for it to exit, and return its full output.
 */
export async function runBackgroundProcessAndGetOutput(
  command: string
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  // Construct environment for child process
  const childEnv = { ...process.env };
  childEnv.ABLY_API_KEY = E2E_API_KEY;
  delete childEnv.ABLY_CLI_TEST_MODE;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const childProcess = spawn('sh', ['-c', command], {
      env: childEnv,
      detached: false, // Keep attached to wait for exit
      stdio: ['ignore', 'pipe', 'pipe'] // Still pipe stdio
    });

    const processId = `sync-process-${randomUUID()}`;
    console.log(`Started sync process (ID: ${processId}, PID: ${childProcess.pid}) for command: ${command}`);

    childProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    childProcess.on('error', (error) => {
      console.error(`Error spawning process ${processId} (PID: ${childProcess.pid}):`, error);
      reject(error);
    });

    childProcess.on('close', (code) => {
      console.log(`Process ${processId} (PID: ${childProcess.pid}) exited with code ${code}`);
      // Wait a very short time for stdio streams to flush before resolving
      setTimeout(() => {
          resolve({ stdout, stderr, exitCode: code });
      }, 50); // 50ms delay
    });
  });
}

/**
 * Run a CLI command as a long-running background process, capture output to a file,
 * wait for a readiness signal, AND TRACK IT.
 */
export async function runLongRunningBackgroundProcess(
  command: string,
  outputPath: string,
  options?: { readySignal?: string; timeoutMs?: number }
): Promise<{ process: ChildProcess; processId: string }> {
  const readySignal = options?.readySignal;
  const timeoutMs = options?.timeoutMs || 10000;

  const childEnv = { ...process.env };
  childEnv.ABLY_API_KEY = E2E_API_KEY;
  delete childEnv.ABLY_CLI_TEST_MODE;

  let processId: string | null = null;
  let childProcess: ChildProcess | null = null;

  // Use a separate promise for readiness detection
  const readinessPromise = new Promise<void>((resolveReady, rejectReady) => {
    const controller = new AbortController();
    const signal = controller.signal;
    const overallTimeout = setTimeout(() => {
        controller.abort(`Timeout: Process did not emit ready signal "${readySignal}" within ${timeoutMs}ms.`);
    }, timeoutMs);

    signal.addEventListener('abort', () => {
        // We only reject the readiness promise on abort
        rejectReady(new Error(signal.reason || "Readiness check aborted"));
    });

    // Start polling immediately *after* spawn is initiated
    const startPolling = () => {
        if (!readySignal) {
            clearTimeout(overallTimeout);
            resolveReady(); // Resolve immediately if no signal needed
            return;
        }

        console.log(`Polling for ready signal "${readySignal}" for process ${processId}...`);
        const pollInterval = 150;
        const pollTimer = setInterval(async () => {
            if (signal.aborted) {
                clearInterval(pollTimer);
                return;
            }
            try {
                const output = await readProcessOutput(outputPath);
                if (output.includes(readySignal)) {
                    console.log(`Ready signal found for process ${processId}.`);
                    clearInterval(pollTimer);
                    clearTimeout(overallTimeout);
                    resolveReady();
                }
            } catch (readError) {
                if ((readError as NodeJS.ErrnoException).code !== 'ENOENT') {
                    console.warn(`Error reading output file during polling for ${processId}:`, readError);
                }
            }
        }, pollInterval);

        // Ensure timer is cleared if promise resolves/rejects early
        signal.addEventListener('abort', () => clearInterval(pollTimer));
    };

    // Spawn the process
    childProcess = spawn('sh', ['-c', command], {
      env: childEnv,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    processId = `bg-process-${randomUUID()}`;
    activeProcesses.set(processId, childProcess); // Track immediately
    console.log(`Started background process (ID: ${processId}, PID: ${childProcess.pid})`);

    childProcess.on('error', (err) => {
        console.error(`Background process ${processId} failed to spawn:`, err);
        clearTimeout(overallTimeout);
        controller.abort('Spawn error'); // Abort readiness check
        activeProcesses.delete(processId!); // Untrack
        // Rejecting readiness is handled by the abort listener
    });

    childProcess.on('exit', (code, signal) => {
        const exitReason = `Background process ${processId} exited prematurely (code ${code}, signal ${signal})`;
        console.warn(exitReason);
        clearTimeout(overallTimeout);
        controller.abort(exitReason); // Abort readiness check
        activeProcesses.delete(processId!); // Untrack
        // Rejecting readiness is handled by the abort listener
    });

    // Pipe output (using async IIFE to handle await within non-async scope)
    (async () => {
        try {
            const outputStream = await fs.open(outputPath, 'a');
            childProcess?.stdout?.pipe(outputStream.createWriteStream());
            childProcess?.stderr?.pipe(outputStream.createWriteStream());
            childProcess?.stdout?.on('error', (err) => console.error(`Error piping stdout for ${processId}:`, err));
            childProcess?.stderr?.on('error', (err) => console.error(`Error piping stderr for ${processId}:`, err));
            // Start polling *after* pipes are set up
            startPolling();
        } catch (error) {
            console.error(`Failed to open output file ${outputPath} or pipe streams for process ${processId}:`, error);
            clearTimeout(overallTimeout);
            controller.abort('Output stream error'); // Abort if file opening fails
            rejectReady(error); // Reject readiness directly here
        }
    })();

    childProcess.unref();
  });

  // Wait for readiness signal (or immediate resolution if no signal)
  await readinessPromise;

  // Return the process details only after readiness is confirmed (or immediately if no signal)
  if (!childProcess || !processId) {
      throw new Error('Background process failed to initialize correctly.');
  }
  return { process: childProcess, processId };
}

/**
 * Read the contents of a process output file
 */
export async function readProcessOutput(outputPath: string): Promise<string> {
  try {
    return await fs.readFile(outputPath, 'utf8');
  } catch (error) {
    // Log less verbosely if file just doesn't exist yet
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    console.error(`Error reading output file ${outputPath}:`, error);
    }
    return '';
  }
}

/**
 * Force exit function to prevent tests from hanging
 */
export function forceExit(): void {
  console.warn("Force exiting test process...");
  process.exit(1); // Exit with non-zero code
}

/**
 * Clean up tracked background processes and temporary files.
 * This should be called in an afterEach hook.
 */
export async function cleanupTrackedResources(): Promise<void> {
  // Kill tracked background processes
  for (const [processId, childProcess] of activeProcesses.entries()) {
    console.log(`Cleaning up background process (ID: ${processId}, PID: ${childProcess.pid})...`);
    killProcess(childProcess); // Use the existing killProcess utility
    activeProcesses.delete(processId);
  }

  // Delete tracked temporary files
  for (const filePath of tempFiles) {
    try {
      console.log(`Deleting temporary file: ${filePath}`);
      await fs.unlink(filePath);
      tempFiles.delete(filePath);
  } catch (error) {
       // Log minor error if file already gone
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
         console.warn(`Warning: Error deleting temp file ${filePath}:`, error);
      }
      // Still remove from set even if deletion failed
      tempFiles.delete(filePath);
    }
  }
}

/**
 * Utility to kill a background process safely
 */
export function killProcess(childProcess: ChildProcess | null): void {
  if (!childProcess || childProcess.killed || !childProcess.pid) {
      console.log(`Process (PID: ${childProcess?.pid || 'N/A'}) already killed or has no PID.`);
      return;
  }

  const pid = childProcess.pid;
  console.log(`Attempting to kill process (PID: ${pid}) with SIGTERM...`);
  try {
    // Try killing the process group first (more reliable for detached processes)
    process.kill(-pid, 'SIGTERM');
    console.log(`Sent SIGTERM to process group ${-pid}.`);

    // Wait briefly before potentially sending SIGKILL
    setTimeout(() => {
        try {
            // Check if it exited before sending SIGKILL
            process.kill(-pid, 0); // Sending signal 0 checks existence
            console.warn(`Process group ${-pid} still exists after SIGTERM, sending SIGKILL...`);
            process.kill(-pid, 'SIGKILL');
            console.log(`Sent SIGKILL to process group ${-pid}.`);
        } catch (error) {
            // Process group likely exited, which is good.
             if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
                 console.log(`Process group ${-pid} exited after SIGTERM.`);
             } else {
                 console.warn(`Error checking/killing process group ${-pid} after SIGTERM:`, error);
             }
        }
    }, 200); // 200ms delay

  } catch (error) {
    console.warn(`Failed to kill process group ${-pid} with SIGTERM, attempting direct kill...`, (error as Error).message);
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Sent SIGTERM to process ${pid}.`);

      // Wait briefly before potentially sending SIGKILL
      setTimeout(() => {
          try {
              process.kill(pid, 0); // Check existence
              console.warn(`Process ${pid} still exists after SIGTERM, sending SIGKILL...`);
              process.kill(pid, 'SIGKILL');
              console.log(`Sent SIGKILL to process ${pid}.`);
          } catch (error) {
             if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
                 console.log(`Process ${pid} exited after SIGTERM.`);
             } else {
                 console.warn(`Error checking/killing process ${pid} after SIGTERM:`, error);
             }
          }
      }, 200); // 200ms delay

    } catch (error) {
      console.warn(`Failed to send SIGTERM to process ${pid}, attempting SIGKILL directly...`, (error as Error).message);
      try {
        process.kill(pid, 'SIGKILL');
        console.log(`Sent SIGKILL to process ${pid}.`);
      } catch (error) {
        console.error(`Failed to kill process ${pid} even with SIGKILL:`, (error as Error).message);
      }
    }
  }
}

/**
 * Skip tests if E2E API key is not available or tests are explicitly skipped
 */
export function skipTestsIfNeeded(suiteDescription: string): void {
  if (SHOULD_SKIP_E2E) {
    // Use mocha's describe.skip to skip all tests
    Mocha.describe.skip(suiteDescription, () => {
      // Empty function for skipped tests
      Mocha.it('skipped tests', () => {
        // Tests are skipped
      });
    });
  }
}

/**
 * Apply standard E2E test setup
 * This method should be called inside the describe block
 */
export function applyE2ETestSetup(): void {
  // Set test timeout
  beforeEach(function() {
    this.timeout(30000);
  });

  // Setup signal handler
  before(async function() {
    process.on('SIGINT', forceExit);
  });

  // Teardown signal handler
  after(function() {
    process.removeListener('SIGINT', forceExit);
  });

  // Clean up TRACKED resources after each test
  afterEach(async function() {
    await cleanupTrackedResources();
  });
}
