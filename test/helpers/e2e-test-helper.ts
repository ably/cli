import * as Ably from "ably";
import { randomUUID } from "node:crypto";
import { spawn, ChildProcess, exec } from "node:child_process";
import { promises as fs } from "node:fs";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { trackAblyClient, trackProcess, cleanupGlobalProcesses } from "../setup.js";
import stripAnsi from "strip-ansi";
import type * as Mocha from "mocha";

// Declare Mocha global functions
declare const beforeEach: (fn: () => void | Promise<void>) => void;
declare const before: (fn: () => void | Promise<void>) => void;
declare const afterEach: (fn: () => void | Promise<void>) => void;
declare const after: (fn: () => void | Promise<void>) => void;
declare const describe: {
  skip: (title: string, fn: () => void) => void;
};
declare const it: (title: string, fn: () => void) => void;

// Constants
export const E2E_API_KEY = process.env.E2E_ABLY_API_KEY;
export const SHOULD_SKIP_E2E = !E2E_API_KEY || process.env.SKIP_E2E_TESTS === 'true';

// Store active background processes and temp files for cleanup
const activeProcesses: Map<string, ChildProcess> = new Map();
const tempFiles: Set<string> = new Set();

/**
 * Obfuscates sensitive data like API keys and tokens in a command string.
 */
export function obfuscateSensitiveData(commandString: string): string {
  let obfuscated = commandString;
  // Obfuscate Ably API Keys (appId.keyId:keySecret or keyId:keySecret)
  // eslint-disable-next-line unicorn/prefer-string-replace-all
  obfuscated = obfuscated.replace(/([a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+:)[^\s'"]+/g, '$1[REDACTED_API_KEY_SECRET]');
  // eslint-disable-next-line unicorn/prefer-string-replace-all
  obfuscated = obfuscated.replace(/([a-zA-Z0-9\-_]+:)(?![a-zA-Z0-9\-_]*\.)[^\s'"]+/g, '$1[REDACTED_API_KEY_SECRET]'); // keyId:keySecret (no app id part)

  // Obfuscate tokens provided via specific flags (covers general tokens and access tokens)
  const tokenFlags = ["--token", "--api-key", "--access-token"];
  for (const flag of tokenFlags) {
    const regex = new RegExp(`(${flag}(?:=|[ ]+))([^\\s'"]+)`, 'g');
    obfuscated = obfuscated.replace(regex, '$1[REDACTED_TOKEN]');
  }
  return obfuscated;
}

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
  const _keyPrefix = E2E_API_KEY.split(':')[0]?.split('.')[0] || 'unknown-app';
  const _keyId = E2E_API_KEY.split(':')[0]?.split('.')[1]?.slice(0, 4) || 'unknown-key';

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
  const _keyPrefix = E2E_API_KEY.split(':')[0]?.split('.')[0] || 'unknown-app';
  const _keyId = E2E_API_KEY.split(':')[0]?.split('.')[1]?.slice(0, 4) || 'unknown-key';

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
 * Get process environment with E2E test settings
 */
function getProcessEnv(): NodeJS.ProcessEnv {
  const childEnv = { ...process.env };
  childEnv.ABLY_API_KEY = E2E_API_KEY;
  delete childEnv.ABLY_CLI_TEST_MODE;
  return childEnv;
}

/**
 * Run a CLI command in the background, wait for it to exit, and return its full output.
 */
export async function runBackgroundProcessAndGetOutput(
  command: string,
  timeoutMs: number = 30000 // 30 second default timeout
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const _obfuscatedCommand = obfuscateSensitiveData(command);
  // Construct environment for child process
  const childEnv = { ...process.env };
  childEnv.ABLY_API_KEY = E2E_API_KEY;
  delete childEnv.ABLY_CLI_TEST_MODE;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;

    const childProcess = spawn('sh', ['-c', command], {
      env: childEnv,
      detached: false, // Keep attached to wait for exit
      stdio: ['ignore', 'pipe', 'pipe'] // Still pipe stdio
    });

    const _processId = `sync-process-${randomUUID()}`;
    
    // Track the process globally if it has a PID
    if (childProcess.pid) {
      trackProcess(childProcess.pid);
    }

    // Add timeout mechanism
    const timeoutHandle = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          if (childProcess.pid) {
            process.kill(childProcess.pid, 'SIGKILL');
          }
        } catch {
          // Ignore errors when killing
        }
        reject(new Error(`Process ${_obfuscatedCommand} timed out after ${timeoutMs}ms. STDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
      }
    }, timeoutMs);

    childProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    childProcess.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });

    childProcess.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutHandle);
        // Wait a very short time for stdio streams to flush before resolving
        setTimeout(() => {
            if (code === 0) {
                resolve({ stdout, stderr, exitCode: code });
            } else {
                // For non-zero exit codes, provide comprehensive error information
                const errorMessage = `Command failed: ${_obfuscatedCommand}\nExit Code: ${code}\nSTDOUT (${stdout.length} chars):\n${stdout}\nSTDERR (${stderr.length} chars):\n${stderr}`;
                reject(new Error(errorMessage));
            }
        }, 50); // 50ms delay
      }
    });
  });
}

/**
 * Start a long-running background process and wait for it to emit a ready signal
 */
export async function runLongRunningBackgroundProcess(
  command: string,
  outputPath: string,
  options: {
    readySignal?: string;
    timeoutMs?: number;
    retryCount?: number;
  } = {}
): Promise<{ process: ChildProcess; processId: string }> {
  const { 
    readySignal = "ready", 
    timeoutMs = process.env.CI ? 25000 : 15000, // Increased default timeout for CI
    retryCount = 1 
  } = options;

  // Track this command execution
  trackTestCommand(command, outputPath);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      
      const result = await attemptProcessStart(
        command,
        outputPath,
        readySignal,
        timeoutMs,
        getProcessEnv()
      );
      
      return result;
      
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < retryCount) {
        const retryDelay = Math.min(2000 * (attempt + 1), 5000); // Progressive backoff, max 5s
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new Error(`Failed to start process after ${retryCount + 1} attempts. Last error: ${lastError?.message}`);
}

// Ensure every background process output file is automatically tracked so that, even if
// an individual test forgets to call `trackTestOutputFile()`, we will still have access
// to its stdout/stderr when a failure occurs.

async function attemptProcessStart(
  command: string,
  outputPath: string,
  readySignal: string | undefined,
  timeoutMs: number,
  childEnv: NodeJS.ProcessEnv
): Promise<{ process: ChildProcess; processId: string }> {
  // Automatically register the output file for failure-time diagnostics.  This is idempotent
  // and adds negligible overhead because the underlying `Set` will ignore duplicates.
  trackTestOutputFile(outputPath);

  let processId: string | null = null;
  let childProcess: ChildProcess | null = null;
  const controller = new AbortController();
  const signal = controller.signal;

  const _obfuscatedCommand = obfuscateSensitiveData(command);

  // Debug logging for command analysis

  // Use a separate promise for readiness detection with better error handling
  const readinessPromise = new Promise<void>((resolveReady, rejectReady) => {
    const overallTimeout = setTimeout(async () => {
        // Ensure controller.abort is called only once
        if (!signal.aborted) {
            const finalOutput = await readProcessOutput(outputPath);
            controller.abort(`Timeout for ${command}: Process did not emit ready signal "${readySignal}" within ${timeoutMs}ms. Output was: ${finalOutput.slice(-1000)}`);
        }
    }, timeoutMs);

    signal.addEventListener('abort', () => {
        clearTimeout(overallTimeout);
        if (signal.reason) {
            rejectReady(new Error(signal.reason as string));
        } else {
            rejectReady(new Error(`Process startup aborted: signal without reason`));
        }
    });

    const pollForSignal = async () => {
        let lastOutputLength = 0;
        let pollCount = 0;
        const pollInterval = process.env.CI ? 200 : 100; 
        let consecutiveNoChangeCount = 0;
        const maxConsecutiveNoChange = process.env.CI ? 100 : 50; 
        
        while (!signal.aborted) {
            pollCount++;
            try {
                const output = await readProcessOutput(outputPath);

                // Check if the child process has exited prematurely
                if (childProcess && childProcess.exitCode !== null && !signal.aborted) {
                    const prematureExitOutput = await readProcessOutput(outputPath);
                    controller.abort(`Process ${command} exited prematurely (code ${childProcess.exitCode}) before emitting ready signal "${readySignal}". Full Output:\n${prematureExitOutput}`);
                    return; // Exit poll loop
                }
                
                // Log first few polls and every 10th poll
                if (pollCount <= 5 || pollCount % 10 === 0) {
                    // Log polling status for debugging (first few polls and every 10th poll)
                }
                
                // Check if output has changed
                if (output.length === lastOutputLength) {
                    consecutiveNoChangeCount++;
                    if (consecutiveNoChangeCount >= maxConsecutiveNoChange && output.length === 0) {
                        // Output hasn't changed for a while and is still empty
                    }
                } else {
                    consecutiveNoChangeCount = 0;
                    const _newOutput = output.slice(lastOutputLength);
                    lastOutputLength = output.length;
                }

                // Check for ready signal with more flexible matching
                if (readySignal && output.length > 0) {
                    const normalizedOutput = output.toLowerCase();
                    const normalizedSignal = readySignal.toLowerCase();
                    
                    // Debug what we're comparing (less verbose)
                    if (pollCount === 1 || (pollCount === 5)) {
                        // Debug signal matching on early polls
                    }
                    
                    // Try multiple matching strategies
                    const signalFound = 
                        output.includes(readySignal) ||
                        normalizedOutput.includes(normalizedSignal) ||
                        // Handle partial matches for common patterns
                        (readySignal.includes("ready") && normalizedOutput.includes("ready")) ||
                        (readySignal.includes("listening") && normalizedOutput.includes("listening")) ||
                        (readySignal.includes("subscribing") && normalizedOutput.includes("subscribing")) ||
                        (readySignal.includes("entered") && (normalizedOutput.includes("entered") || normalizedOutput.includes("✓"))) ||
                        // Special handling for presence/member signals
                        (readySignal.toLowerCase().includes("member") && normalizedOutput.includes("member")) ||
                        (readySignal.toLowerCase().includes("presence") && normalizedOutput.includes("presence"));
                    
                    if (signalFound) {
                        clearTimeout(overallTimeout);
                        resolveReady();
                        return;
                    }
                }

                // Also check for common error patterns that indicate immediate failure
                if (output.includes("authentication failed") || 
                    output.includes("401") || 
                    output.includes("403") ||
                    output.includes("Command failed") ||
                    output.includes("ENOENT") ||
                    output.includes("Error:") ||
                    output.includes("error:") ||
                    output.includes("Cannot find module") ||
                    output.includes("SyntaxError")) {
                    clearTimeout(overallTimeout);
                    const errorOutput = await readProcessOutput(outputPath);
                    rejectReady(new Error(`Process ${command} failed with error pattern in output. Full Output:\n${errorOutput}`));
                    return;
                }
                
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            } catch {
                // If we can't read the output file yet, that's okay - process might still be starting
                if (pollCount > 20) { // Give it some time before logging
                    // Log read errors after sufficient attempts
                }
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        }
    };

    pollForSignal().catch(error => {
        clearTimeout(overallTimeout);
        rejectReady(error);
    });
  });

  try {
    // Use a shell invocation so that complex arguments with spaces or quotes are preserved
    childProcess = spawn('sh', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe'], // Changed from 'inherit' to ensure we capture all output
      env: childEnv,
      cwd: process.cwd(),
      detached: false, // Keep attached for better cleanup
    });

    processId = `${childProcess.pid}`;
    
    if (!childProcess.pid) {
      throw new Error(`Failed to start process: no PID assigned`);
    }

    // Track the process globally for cleanup
    trackProcess(childProcess.pid);

    // Set up output redirection to file with immediate flushing
    let outputStream: fsSync.WriteStream;
    try {
      // Ensure directory exists (though os.tmpdir() should exist)
      const outputDir = path.dirname(outputPath);
      if (!fsSync.existsSync(outputDir)) {
        fsSync.mkdirSync(outputDir, { recursive: true });
      }
      outputStream = fsSync.createWriteStream(outputPath, { flags: 'a' });
      outputStream.on('error', (err) => {
        // If stream errors, it might be a reason for ENOENT later if file not properly handled
        if (!controller.signal.aborted) {
            controller.abort(`OutputStream error for ${outputPath}: ${err.message}`);
        }
      });
      outputStream.on('open', (_fd) => {
          // Output stream opened successfully
      });
      outputStream.on('finish', () => {
          // Output stream finished writing
      });
      outputStream.on('close', () => {
          // Output stream closed
      });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // If we can't create the stream, the process output won't be captured.
        // This will likely lead to readiness timeout or ENOENT later.
        throw new Error(`Failed to create output stream for ${outputPath}: ${errorMessage}`);
    }
    
    const flushOutput = (data: Buffer) => {
      outputStream.write(data);
      if (process.env.CI) {
        outputStream.write(''); // Trigger flush
      }
    };
    
    childProcess.stdout?.on('data', flushOutput);
    childProcess.stderr?.on('data', flushOutput);
    
    // Handle process exit early
    childProcess.on('exit', (code, _signal) => {
      if (outputStream && !outputStream.destroyed) {
        outputStream.end(() => {
            // Output stream ended after process exit
        });
      } else {
          // Output stream was already destroyed
      }
      if (code !== null && code !== 0 && code !== 130) { // 130 is SIGINT
          // Process exited with non-zero code
      }
    });

    // Log initial stderr output for debugging
    let stderrBuffer = '';
    childProcess.stderr?.on('data', (data) => {
      const errorText = data.toString();
      stderrBuffer += errorText;
      if (stderrBuffer.length < 1000) { // Only log first 1KB of stderr
          // Log stderr output for debugging
      }
    });
    
    // Log if process fails to start
    childProcess.on('spawn', () => {
        // Process spawned successfully
    });

    // Handle process errors more explicitly
    childProcess.on('error', (error) => {
      if (outputStream && !outputStream.destroyed) {
        outputStream.end();
      }
      // Explicitly reject readinessPromise if process errors out
      if (!signal.aborted) {
        controller.abort(`Process error for ${command}: ${error.message}`);
      }
    });

    // Wait for the ready signal or timeout
    if (readySignal) {
      await readinessPromise;
    } else {
      // If no ready signal specified, just wait a bit for process to start
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return { process: childProcess, processId };

  } catch (error) {
    // Clean up on failure
    if (childProcess && !childProcess.killed) {
      childProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!childProcess.killed) {
        childProcess.kill('SIGKILL');
      }
    }
    throw error;
  }
}

/**
 * Read the contents of a process output file
 */
export async function readProcessOutput(outputPath: string): Promise<string> {
  try {
    const raw = await fs.readFile(outputPath, 'utf8');
    return stripAnsi(raw);
  } catch (error) {
    // Only log unexpected errors, not ENOENT (file not found) which is expected during polling
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Log unexpected file read errors
    }
    return '';
  }
}

/**
 * Force exit function to prevent tests from hanging
 */
export function forceExit(): void {
  process.exit(1); // Exit with non-zero code
}

/**
 * Clean up tracked background processes and temporary files.
 * This should be called in an afterEach hook.
 */
export async function cleanupTrackedResources(): Promise<void> {
  // Kill tracked background processes
  for (const [processId, childProcess] of activeProcesses.entries()) {
    await killProcess(childProcess); // Use the existing killProcess utility
    activeProcesses.delete(processId);
  }

  // Also run global process cleanup as a safety net
  await cleanupGlobalProcesses();

  // Delete tracked temporary files
  for (const filePath of tempFiles) {
    try {
      await fs.unlink(filePath);
      tempFiles.delete(filePath);
  } catch (error) {
       // Log minor error if file already gone
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          // Log unexpected file deletion errors
      }
      // Still remove from set even if deletion failed
      tempFiles.delete(filePath);
    }
  }
}

/**
 * Utility to kill a background process safely and gracefully
 */
export async function killProcess(childProcess: ChildProcess | null): Promise<void> {
  if (!childProcess || childProcess.killed || !childProcess.pid) {
    return;
  }

  const pid = childProcess.pid;

  try {
    // First, try to kill all child processes using system commands
    // This prevents orphaned processes
    await new Promise<void>((resolve) => {
      exec(`pkill -TERM -P ${pid}`, (error) => {
        // Don't worry about errors - process might not have children
        if (error && process.env.E2E_DEBUG) {
            // Debug: log pkill errors if debugging is enabled
        }
        resolve();
      });
    });

    // Give child processes a moment to exit gracefully
    await new Promise(resolve => setTimeout(resolve, 300));

    // Try graceful termination first with SIGTERM
    try {
      process.kill(pid, 'SIGTERM');
      
      // Wait for graceful exit with a reasonable timeout
      let exited = false;
      const checkInterval = 100;
      const maxChecks = 20; // 2 seconds total
      
      for (let i = 0; i < maxChecks; i++) {
        try {
          process.kill(pid, 0); // Check if process exists
          await new Promise(resolve => setTimeout(resolve, checkInterval));
        } catch {
          // Process no longer exists
          exited = true;
          break;
        }
      }
      
      if (exited) {
        return;
      } else {
          // Process did not exit gracefully, proceeding to force kill
      }
    } catch {
      // Process might already be dead
      return;
    }

    // Force kill with SIGKILL as last resort
    try {
      process.kill(pid, 'SIGKILL');
      
      // Wait a moment for the kill to take effect
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch {
      // Process was probably already dead
    }

  } catch {
      // Error during process cleanup - process likely already terminated
  }
}

/**
 * Skip tests if E2E API key is not available or tests are explicitly skipped
 */
export function skipTestsIfNeeded(suiteDescription: string): void {
  if (SHOULD_SKIP_E2E) {
    // Use mocha's describe.skip to skip all tests
    describe.skip(suiteDescription, () => {
      // Empty function for skipped tests
      it('skipped tests', () => {
        // Tests are skipped
      });
    });
  }
}

// Global tracking for test output files to display on failure
export const testOutputFiles = new Set<string>();

// Global tracking for commands executed during tests
export const testCommands: Array<{
  command: string;
  outputPath?: string;
  timestamp: string;
  result?: { exitCode: number | null; stdout?: string; stderr?: string; };
}> = [];

/**
 * Register an output file to be displayed if the current test fails
 */
export function trackTestOutputFile(outputPath: string): void {
  testOutputFiles.add(outputPath);
}

/**
 * Register a command that was executed during the test
 */
export function trackTestCommand(command: string, outputPath?: string, result?: { exitCode: number | null; stdout?: string; stderr?: string; }): void {
  testCommands.push({
    // eslint-disable-next-line unicorn/prefer-string-replace-all
    command: command.replace(/--api-key=[^\s]+/g, '--api-key=***'), // Obfuscate API keys
    outputPath,
    timestamp: new Date().toISOString(),
    result
  });
}

/**
 * Apply standard E2E test setup
 * This method should be called inside the describe block
 */
export function applyE2ETestSetup(): void {
  // Set test timeout - increased for complex E2E tests
  beforeEach(function(this: Mocha.Context) {
    this.timeout(120000); // 2 minutes per individual test
    // Clear tracked output files and commands for this test
    testOutputFiles.clear();
    testCommands.length = 0;
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
  afterEach(async function(this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      
      // Ensure any background processes are fully terminated so that their stdio
      // streams are flushed to disk before we read the corresponding files.
      await killActiveProcessesForDebug();

      // Ensure that any buffered writes from background processes have been flushed to the
      // tracked output files before we read them.  We poll each file until the size is
      // stable (or until a short timeout is reached) so that late writes that occur right
      // after a child-process exit are not missed in the diagnostic output.
      const waitForFileStability = async (filePath: string, timeoutMs = 750): Promise<void> => {
        const start = Date.now();
        let previousSize = -1;
        for (;;) {
          try {
            const { size } = fsSync.statSync(filePath);
            if (size === previousSize) {
              return; // size is stable – we assume all data has been flushed
            }
            previousSize = size;
          } catch {
            // ignore – file may not exist yet
          }
          if (Date.now() - start > timeoutMs) return; // give up after timeout
          await new Promise(r => setTimeout(r, 50));
        }
      };

      // Wait for stability on all files in parallel – this only adds a very small
      // delay (sub-second) but dramatically increases the chance that we capture
      // the full stdout/stderr from background commands when a test fails.
      await Promise.all([...testOutputFiles].map(p => waitForFileStability(p)));

      try {
        console.error(`\n=== TEST FAILURE DEBUG OUTPUT FOR: ${this.currentTest?.title} ===`);
        console.error(`Commands tracked: ${testCommands.length}, Output files tracked: ${testOutputFiles.size}`);
        
        // Display commands that were executed
        if (testCommands.length > 0) {
          console.error(`\n--- COMMANDS EXECUTED (${testCommands.length}) ---`);
          testCommands.forEach((cmd, index) => {
            console.error(`[${index + 1}] ${cmd.timestamp}: ${cmd.command}`);
            if (cmd.outputPath) {
              console.error(`    Output file: ${cmd.outputPath}`);
            }
            if (cmd.result) {
              console.error(`    Exit code: ${cmd.result.exitCode}`);
              if (cmd.result.stdout) console.error(`    Stdout: ${cmd.result.stdout.slice(0, 200)}${cmd.result.stdout.length > 200 ? '...' : ''}`);
              if (cmd.result.stderr) console.error(`    Stderr: ${cmd.result.stderr.slice(0, 200)}${cmd.result.stderr.length > 200 ? '...' : ''}`);
            }
          });
        } else {
          console.error('\n--- NO COMMANDS TRACKED ---');
        }

        if (testOutputFiles.size === 0) {
          console.error('\n--- NO OUTPUT FILES TRACKED ---');
        } else {
          console.error(`\n--- OUTPUT FILES (${testOutputFiles.size}) ---`);
          
          for (const filePath of testOutputFiles) {
            try {
              // Check if file exists and get stats
              const fileExists = fsSync.existsSync(filePath);
              
              if (!fileExists) {
                console.error(`\n--- ${filePath} ---`);
                console.error('FILE DOES NOT EXIST');
                continue;
              }
              
              const stats = fsSync.statSync(filePath);
              console.error(`\n--- ${filePath} ---`);
              console.error(`File size: ${stats.size} bytes`);
              console.error(`Modified: ${stats.mtime.toISOString()}`);
              console.error(`Created: ${stats.birthtime.toISOString()}`);
              
              if (stats.size === 0) {
                console.error('FILE IS EMPTY');
                continue;
              }
              
              const content = await readProcessOutput(filePath);
              if (content.trim()) {
                console.error('File contents:');
                console.error(content);
              } else {
                console.error('FILE CONTENT IS EMPTY (after processing)');
              }
            } catch (error) {
              console.error(`\n--- ${filePath} (error reading) ---`);
              console.error(`Error: ${error}`);
            }
          }
          
          console.error(`=== END TEST FAILURE DEBUG OUTPUT ===`);
        }
      } catch (debugError) {
        console.error(`\n=== DEBUG OUTPUT ERROR ===`);
        console.error(`Error in debug output: ${debugError}`);
        console.error(`testCommands.length: ${testCommands.length}`);
        console.error(`testOutputFiles.size: ${testOutputFiles.size}`);
        console.error(`=== END DEBUG OUTPUT ERROR ===`);
      }
      
    }
    
    // Clear tracked files for next test
    testOutputFiles.clear();
    
    // Perform normal cleanup
    await cleanupTrackedResources();
  });
}

// Kill all tracked child-processes *without* touching temporary output files.  This is
// useful in the failure-diagnostics path because we must ensure every stdout/stderr
// writer has exited (and flushed) before we attempt to read the captured files.
async function killActiveProcessesForDebug(): Promise<void> {
  for (const [processId, childProcess] of activeProcesses.entries()) {
    try {
      await killProcess(childProcess);
    } catch {
      /* ignore – best-effort */
    }
    activeProcesses.delete(processId);
  }
}

/**
 * Display debug output when a test fails
 * This should be called in afterEach hooks when test state is 'failed'
 */
export async function displayTestFailureDebugOutput(testTitle: string | undefined): Promise<void> {
  // Ensure any background processes are fully terminated so that their stdio
  // streams are flushed to disk before we read the corresponding files.
  await killActiveProcessesForDebug();

  // Ensure that any buffered writes from background processes have been flushed to the
  // tracked output files before we read them.  We poll each file until the size is
  // stable (or until a short timeout is reached) so that late writes that occur right
  // after a child-process exit are not missed in the diagnostic output.
  const waitForFileStability = async (filePath: string, timeoutMs = 750): Promise<void> => {
    const start = Date.now();
    let previousSize = -1;
    for (;;) {
      try {
        const { size } = fsSync.statSync(filePath);
        if (size === previousSize) {
          return; // size is stable – we assume all data has been flushed
        }
        previousSize = size;
      } catch {
        // ignore – file may not exist yet
      }
      if (Date.now() - start > timeoutMs) return; // give up after timeout
      await new Promise(r => setTimeout(r, 50));
    }
  };

  // Wait for stability on all files in parallel – this only adds a very small
  // delay (sub-second) but dramatically increases the chance that we capture
  // the full stdout/stderr from background commands when a test fails.
  await Promise.all([...testOutputFiles].map(p => waitForFileStability(p)));

  try {
    console.error(`\n=== TEST FAILURE DEBUG OUTPUT FOR: ${testTitle} ===`);
    console.error(`Commands tracked: ${testCommands.length}, Output files tracked: ${testOutputFiles.size}`);
    
    // Display commands that were executed
    if (testCommands.length > 0) {
      console.error(`\n--- COMMANDS EXECUTED (${testCommands.length}) ---`);
      testCommands.forEach((cmd, index) => {
        console.error(`[${index + 1}] ${cmd.timestamp}: ${cmd.command}`);
        if (cmd.outputPath) {
          console.error(`    Output file: ${cmd.outputPath}`);
        }
        if (cmd.result) {
          console.error(`    Exit code: ${cmd.result.exitCode}`);
          if (cmd.result.stdout) console.error(`    Stdout: ${cmd.result.stdout.slice(0, 200)}${cmd.result.stdout.length > 200 ? '...' : ''}`);
          if (cmd.result.stderr) console.error(`    Stderr: ${cmd.result.stderr.slice(0, 200)}${cmd.result.stderr.length > 200 ? '...' : ''}`);
        }
      });
    } else {
      console.error('\n--- NO COMMANDS TRACKED ---');
    }

    if (testOutputFiles.size === 0) {
      console.error('\n--- NO OUTPUT FILES TRACKED ---');
    } else {
      console.error(`\n--- OUTPUT FILES (${testOutputFiles.size}) ---`);
      
      for (const filePath of testOutputFiles) {
        try {
          // Check if file exists and get stats
          const fileExists = fsSync.existsSync(filePath);
          
          if (!fileExists) {
            console.error(`\n--- ${filePath} ---`);
            console.error('FILE DOES NOT EXIST');
            continue;
          }
          
          const stats = fsSync.statSync(filePath);
          console.error(`\n--- ${filePath} ---`);
          console.error(`File size: ${stats.size} bytes`);
          console.error(`Modified: ${stats.mtime.toISOString()}`);
          console.error(`Created: ${stats.birthtime.toISOString()}`);
          
          if (stats.size === 0) {
            console.error('FILE IS EMPTY');
            continue;
          }
          
          const content = await readProcessOutput(filePath);
          if (content.trim()) {
            console.error('File contents:');
            console.error(content);
          } else {
            console.error('FILE CONTENT IS EMPTY (after processing)');
          }
        } catch (error) {
          console.error(`\n--- ${filePath} (error reading) ---`);
          console.error(`Error: ${error}`);
        }
      }
      
      console.error(`=== END TEST FAILURE DEBUG OUTPUT ===`);
    }
  } catch (debugError) {
    console.error(`\n=== DEBUG OUTPUT ERROR ===`);
    console.error(`Error in debug output: ${debugError}`);
    console.error(`testCommands.length: ${testCommands.length}`);
    console.error(`testOutputFiles.size: ${testOutputFiles.size}`);
    console.error(`=== END DEBUG OUTPUT ERROR ===`);
  }
}
