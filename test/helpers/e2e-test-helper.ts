import * as Ably from "ably";
import { randomUUID } from "node:crypto";
import { spawn, ChildProcess, exec } from "node:child_process";
import { promises as fs } from "node:fs";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Mocha from "mocha";
import { trackAblyClient, trackProcess, cleanupGlobalProcesses } from "../setup.js";
import stripAnsi from "strip-ansi";
const { beforeEach, before, after, afterEach } = Mocha;

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
  obfuscated = obfuscated.replaceAll(/([a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+:)[^\s'"]+/g, '$1[REDACTED_API_KEY_SECRET]');
  obfuscated = obfuscated.replaceAll(/([a-zA-Z0-9\-_]+:)(?![a-zA-Z0-9\-_]*\.)[^\s'"]+/g, '$1[REDACTED_API_KEY_SECRET]'); // keyId:keySecret (no app id part)

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
  const keyPrefix = E2E_API_KEY.split(':')[0]?.split('.')[0] || 'unknown-app';
  const keyId = E2E_API_KEY.split(':')[0]?.split('.')[1]?.slice(0, 4) || 'unknown-key';

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
  const obfuscatedCommand = obfuscateSensitiveData(command);
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

    const processId = `sync-process-${randomUUID()}`;
    
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
        reject(new Error(`Process ${obfuscatedCommand} timed out after ${timeoutMs}ms. STDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
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
                // For non-zero exit codes, reject with more info
                reject(new Error(`Command failed: ${obfuscatedCommand}\nExit Code: ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
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

async function attemptProcessStart(
  command: string,
  outputPath: string,
  readySignal: string | undefined,
  timeoutMs: number,
  childEnv: NodeJS.ProcessEnv
): Promise<{ process: ChildProcess; processId: string }> {
  const obfuscatedCommand = obfuscateSensitiveData(command);
  let processId: string | null = null;
  let childProcess: ChildProcess | null = null;
  const controller = new AbortController();
  const signal = controller.signal;

  // Debug logging for command analysis

  // Use a separate promise for readiness detection with better error handling
  const readinessPromise = new Promise<void>((resolveReady, rejectReady) => {
    const overallTimeout = setTimeout(async () => {
        // Ensure controller.abort is called only once
        if (!signal.aborted) {
            const finalOutput = await readProcessOutput(outputPath);
            controller.abort(`Timeout for ${obfuscatedCommand}: Process did not emit ready signal "${readySignal}" within ${timeoutMs}ms. Output was: ${finalOutput.slice(-1000)}`);
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
                    controller.abort(`Process ${obfuscatedCommand} exited prematurely (code ${childProcess.exitCode}) before emitting ready signal "${readySignal}". Full Output:\n${prematureExitOutput}`);
                    return; // Exit poll loop
                }
                
                // Log first few polls and every 10th poll
                if (pollCount <= 5 || pollCount % 10 === 0) {
                }
                
                // Check if output has changed
                if (output.length === lastOutputLength) {
                    consecutiveNoChangeCount++;
                    if (consecutiveNoChangeCount >= maxConsecutiveNoChange && output.length === 0) {
                    }
                } else {
                    consecutiveNoChangeCount = 0;
                    const newOutput = output.slice(lastOutputLength);
                    lastOutputLength = output.length;
                }

                // Check for ready signal with more flexible matching
                if (readySignal && output.length > 0) {
                    const normalizedOutput = output.toLowerCase();
                    const normalizedSignal = readySignal.toLowerCase();
                    
                    // Debug what we're comparing (less verbose)
                    if (pollCount === 1 || (pollCount === 5)) {
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
                    rejectReady(new Error(`Process ${obfuscatedCommand} failed with error pattern in output. Full Output:\n${errorOutput}`));
                    return;
                }
                
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            } catch (readError) {
                // If we can't read the output file yet, that's okay - process might still be starting
                if (pollCount > 20) { // Give it some time before logging
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
      outputStream.on('open', (fd) => {
      });
      outputStream.on('finish', () => {
      });
      outputStream.on('close', () => {
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
    childProcess.on('exit', (code, signal) => {
      if (outputStream && !outputStream.destroyed) {
        outputStream.end(() => {
        });
      } else {
      }
      if (code !== null && code !== 0 && code !== 130) { // 130 is SIGINT
      }
    });

    // Log initial stderr output for debugging
    let stderrBuffer = '';
    childProcess.stderr?.on('data', (data) => {
      const errorText = data.toString();
      stderrBuffer += errorText;
      if (stderrBuffer.length < 1000) { // Only log first 1KB of stderr
      }
    });
    
    // Log if process fails to start
    childProcess.on('spawn', () => {
    });

    // Handle process errors more explicitly
    childProcess.on('error', (error) => {
      if (outputStream && !outputStream.destroyed) {
        outputStream.end();
      }
      // Explicitly reject readinessPromise if process errors out
      if (!signal.aborted) {
        controller.abort(`Process error for ${obfuscatedCommand}: ${error.message}`);
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
    // Log when file read fails, this is important for debugging
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

  } catch (error) {
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
