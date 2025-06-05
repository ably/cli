import { CliRunner } from './cli-runner.js';

// Type for Mocha test context
interface MochaTest {
  fullTitle(): string;
  state?: string;
  err?: Error;
}

// WeakMap to associate test contexts with their CLI runners
const testRunners = new WeakMap<MochaTest, CliRunner[]>();

export function trackRunner(test: MochaTest, runner: CliRunner): void {
  if (!testRunners.has(test)) {
    testRunners.set(test, []);
  }
  testRunners.get(test)!.push(runner);
}

export function getTrackedRunners(test: MochaTest): CliRunner[] {
  return testRunners.get(test) || [];
}

export function clearTrackingForTest(test: MochaTest): void {
  testRunners.delete(test);
} 