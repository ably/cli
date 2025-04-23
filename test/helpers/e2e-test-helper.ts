import * as Ably from "ably";
import { randomUUID } from "node:crypto";
import { exec, spawn, ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Mocha from "mocha";
const { beforeEach, before, after, afterEach } = Mocha;

// Constants
export const E2E_API_KEY = process.env.E2E_ABLY_API_KEY;
export const SHOULD_SKIP_E2E = !E2E_API_KEY || process.env.SKIP_E2E_TESTS === 'true';

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
 * Create an Ably REST client for testing
 */
export function createAblyClient(): Ably.Rest {
  if (!E2E_API_KEY) {
    throw new Error("E2E_ABLY_API_KEY environment variable is required for E2E tests");
  }

  return new Ably.Rest({
    key: E2E_API_KEY,
    clientId: getUniqueClientId()
  });
}

/**
 * Create an Ably Realtime client for testing
 */
export function createAblyRealtimeClient(): Ably.Realtime {
  if (!E2E_API_KEY) {
    throw new Error("E2E_ABLY_API_KEY environment variable is required for E2E tests");
  }

  return new Ably.Realtime({
    key: E2E_API_KEY,
    clientId: getUniqueClientId()
  });
}

/**
 * Helper to publish a test message to a channel
 */
export async function publishTestMessage(channelName: string, messageData: Record<string, unknown>): Promise<void> {
  const client = createAblyClient();
  const channel = client.channels.get(channelName);
  await channel.publish("test-event", messageData);
  // No need to close - Rest client doesn't maintain connection
}

/**
 * Create a temporary file for capturing output from background processes
 */
export async function createTempOutputFile(): Promise<string> {
  const tempDir = os.tmpdir();
  const outputPath = path.join(tempDir, `ably-cli-test-${randomUUID()}.log`);
  await fs.writeFile(outputPath, '');
  return outputPath;
}

/**
 * Run a CLI command in the background and capture its output
 */
export async function runBackgroundProcess(
  command: string,
  outputPath: string
): Promise<ChildProcess> {
  const childProcess = spawn('sh', ['-c', command], {
    env: {
      ...process.env,
      ABLY_API_KEY: E2E_API_KEY
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Write stdout and stderr to the output file
  const outputStream = await fs.open(outputPath, 'a');
  childProcess.stdout.pipe(outputStream.createWriteStream());
  childProcess.stderr.pipe(outputStream.createWriteStream());

  // Ensure process doesn't keep the Node.js process running
  childProcess.unref();

  return childProcess;
}

/**
 * Read the contents of a process output file
 */
export async function readProcessOutput(outputPath: string): Promise<string> {
  try {
    return await fs.readFile(outputPath, 'utf8');
  } catch (error) {
    console.error(`Error reading output file ${outputPath}:`, error);
    return '';
  }
}

/**
 * Force exit function to prevent tests from hanging
 */
export function forceExit(): void {
  process.exit(0);
}

/**
 * Clean up any lingering background processes
 */
export async function cleanupBackgroundProcesses(): Promise<void> {
  try {
    // Force kill any lingering processes
    await new Promise<void>((resolve) => {
      exec('pkill -f "bin/run.js channels subscribe" || true', () => resolve());
    });
    await new Promise<void>((resolve) => {
      exec('pkill -f "bin/run.js channels presence" || true', () => resolve());
    });
    await new Promise<void>((resolve) => {
      exec('pkill -f "bin/run.js channels occupancy" || true', () => resolve());
    });
  } catch (error) {
    console.warn("Warning: Error cleaning up processes:", error);
  }
}

/**
 * Utility to kill a background process safely
 */
export function killProcess(childProcess: ChildProcess | null): void {
  if (!childProcess || childProcess.killed) return;

  try {
    if (childProcess.pid) {
      try {
        // Try to kill the process group first (for detached processes)
        process.kill(-childProcess.pid, 'SIGINT');
      } catch {
        // Fall back to killing just the process if process group kill fails
        childProcess.kill('SIGINT');
      }
    } else {
      childProcess.kill('SIGINT');
    }
  } catch (error) {
    console.warn(`Error killing process: ${error}`);
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
  // Set test timeout to accommodate background processes
  beforeEach(function() {
    this.timeout(30000);
  });

  // Set up before and after hooks
  before(async function() {
    // Add handler for interrupt signal
    process.on('SIGINT', forceExit);
  });

  after(function() {
    // Remove interrupt handler
    process.removeListener('SIGINT', forceExit);
  });

  // Clean up after each test
  afterEach(async function() {
    await cleanupBackgroundProcesses();
  });
}
