import { CliRunner, startCli, runCliOnce, RunnerOpts } from './cli-runner.js';
import { trackTestCommand } from './e2e-test-helper.js';
import * as path from 'node:path';

// Type for current test context
interface TestContext {
  fullTitle(): string;
}

// Generate unique output file for this test
export function getOutputFile(suffix = ''): string {
  const currentTest = (globalThis as Record<string, unknown>).currentTest;
  const testName = (currentTest as TestContext | undefined)?.fullTitle() || 'unknown-test';
  const cleanTestName = testName
    .replaceAll(/[^a-zA-Z0-9-]/g, '-')
    .replaceAll(/-+/g, '-')
    .slice(0, 50);
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2);
  
  const filename = `e2e-${cleanTestName}-${timestamp}-${random}${suffix}.log`;
  return path.join(process.cwd(), 'tmp', filename);
}

// Start a subscribe command and wait for it to be ready
export async function startSubscribeCommand(
  argv: string[],
  readyMatcher: RegExp | string = /Connected to Ably and subscribed/,
  opts: Partial<RunnerOpts> = {}
): Promise<CliRunner> {
  const outfile = getOutputFile('-subscribe');
  const command = `bin/run.js ${argv.join(' ')}`;
  
  // Track this command execution
  trackTestCommand(command, outfile);
  
  return startCli(argv, outfile, {
    timeoutMs: 30000,
    ready: { matcher: readyMatcher },
    logLabel: 'SUBSCRIBE',
    ...opts
  });
}

// Start a presence enter command and wait for ready
export async function startPresenceCommand(
  argv: string[],
  readyMatcher: RegExp | string = /Entered presence on/,
  opts: Partial<RunnerOpts> = {}
): Promise<CliRunner> {
  const outfile = getOutputFile('-presence');
  const command = `bin/run.js ${argv.join(' ')}`;
  
  // Track this command execution
  trackTestCommand(command, outfile);
  
  return startCli(argv, outfile, {
    timeoutMs: 30000,
    ready: { matcher: readyMatcher },
    logLabel: 'PRESENCE',
    ...opts
  });
}

// Run a one-off command like publish, get, etc.
export async function runCommand(
  argv: string[],
  opts: Partial<RunnerOpts> = {}
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const command = `bin/run.js ${argv.join(' ')}`;
  
  const result = await runCliOnce(argv, {
    timeoutMs: 15000,
    logLabel: 'COMMAND',
    ...opts
  });
  
  // Track this command execution with result
  trackTestCommand(command, undefined, result);
  
  return result;
}

// Wait for a specific output pattern in a running command
export async function waitForOutput(
  runner: CliRunner,
  matcher: RegExp | string,
  timeoutMs = 10000
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const startTime = Date.now();
    
    const checkOutput = () => {
      if (!runner.isRunning()) {
        reject(new Error(`Process exited before pattern "${matcher}" was found. Exit code: ${runner.exitCode()}`));
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Timeout waiting for pattern "${matcher}". Recent output:\n${runner.combined().slice(-500)}`));
        return;
      }

      const output = runner.combined();
      const found = matcher instanceof RegExp ? matcher.test(output) : output.includes(matcher);
      
      if (found) {
        resolve();
      } else {
        setTimeout(checkOutput, 100);
      }
    };

    checkOutput();
  });
}

// Count occurrences of a pattern in output
export function countMatches(output: string, pattern: RegExp | string): number {
  if (pattern instanceof RegExp) {
    const matches = output.match(new RegExp(pattern.source, pattern.flags + 'g'));
    return matches ? matches.length : 0;
  } else {
    return (output.split(pattern).length - 1);
  }
}

// Extract JSON objects from output lines
export function extractJsonLines(output: string): unknown[] {
  const lines = output.split('\n');
  const jsonObjects: unknown[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        jsonObjects.push(JSON.parse(trimmed));
      } catch {
        // Skip invalid JSON
      }
    }
  }
  
  return jsonObjects;
}

// Wait for a specific number of JSON events
export async function waitForJsonEvents(
  runner: CliRunner,
  expectedCount: number,
  filter?: (json: unknown) => boolean,
  timeoutMs = 10000
): Promise<unknown[]> {
  return new Promise<unknown[]>((resolve, reject) => {
    const startTime = Date.now();
    
    const checkEvents = () => {
      if (!runner.isRunning()) {
        reject(new Error(`Process exited before ${expectedCount} events were received. Exit code: ${runner.exitCode()}`));
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        const events = extractJsonLines(runner.combined());
        const filtered = filter ? events.filter((event) => filter(event)) : events;
        reject(new Error(`Timeout waiting for ${expectedCount} JSON events. Found ${filtered.length}. Recent output:\n${runner.combined().slice(-1000)}`));
        return;
      }

      const events = extractJsonLines(runner.combined());
      const filtered = filter ? events.filter((event) => filter(event)) : events;
      
      if (filtered.length >= expectedCount) {
        resolve(filtered.slice(0, expectedCount));
      } else {
        setTimeout(checkEvents, 100);
      }
    };

    checkEvents();
  });
}

// Cleanup function to kill all runners in a test
export async function cleanupRunners(runners: CliRunner[]): Promise<void> {
  await Promise.all(runners.map(runner => runner.kill()));
} 