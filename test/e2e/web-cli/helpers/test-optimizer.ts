/**
 * Test optimizer for managing test execution order based on connection requirements
 * 
 * This module analyzes test patterns and optimizes execution to minimize rate limit delays
 */

export interface TestConnectionProfile {
  testName: string;
  estimatedConnections: number;
  requiresReload: boolean;
  priority: 'high' | 'medium' | 'low';
}

// Map of known test patterns and their connection requirements
export const TEST_PROFILES: TestConnectionProfile[] = [
  // Single connection tests (run first)
  {
    testName: 'web-cli.test.ts',
    estimatedConnections: 1,
    requiresReload: false,
    priority: 'high'
  },
  {
    testName: 'authentication.test.ts',
    estimatedConnections: 1,
    requiresReload: false,
    priority: 'high'
  },
  
  // Multiple connection tests (run with spacing)
  {
    testName: 'session-resume.test.ts',
    estimatedConnections: 2,
    requiresReload: true,
    priority: 'medium'
  },
  {
    testName: 'prompt-integrity.test.ts',
    estimatedConnections: 3,
    requiresReload: true,
    priority: 'medium'
  },
  {
    testName: 'reconnection.test.ts',
    estimatedConnections: 2,
    requiresReload: false,
    priority: 'medium'
  },
  {
    testName: 'reconnection-diagnostic.test.ts',
    estimatedConnections: 2,
    requiresReload: false,
    priority: 'low'
  },
  
  // Rate limit trigger test (run last)
  {
    testName: 'z-rate-limit-trigger.test.ts',
    estimatedConnections: 10,
    requiresReload: false,
    priority: 'low'
  }
];

/**
 * Calculate optimal test execution order
 */
export function getOptimalTestOrder(_maxConnectionsPerMinute: number): string[] {
  // Sort tests by priority and connection count
  const sorted = [...TEST_PROFILES].sort((a, b) => {
    // Priority first
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    // Then by connection count (ascending)
    return a.estimatedConnections - b.estimatedConnections;
  });
  
  return sorted.map(profile => profile.testName);
}

/**
 * Calculate estimated batch groups for parallel execution
 */
export function calculateTestBatches(maxConnectionsPerMinute: number): string[][] {
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentBatchConnections = 0;
  
  const sorted = [...TEST_PROFILES].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
  
  for (const profile of sorted) {
    // Check if adding this test would exceed the limit
    if (currentBatchConnections + profile.estimatedConnections > maxConnectionsPerMinute - 1) {
      // Start a new batch
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }
      currentBatch = [profile.testName];
      currentBatchConnections = profile.estimatedConnections;
    } else {
      // Add to current batch
      currentBatch.push(profile.testName);
      currentBatchConnections += profile.estimatedConnections;
    }
  }
  
  // Add the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }
  
  return batches;
}

/**
 * Get test connection profile by name
 */
export function getTestProfile(testName: string): TestConnectionProfile | undefined {
  return TEST_PROFILES.find(profile => 
    profile.testName === testName || testName.includes(profile.testName)
  );
}

/**
 * Estimate total execution time based on connection profiles and rate limits
 */
export function estimateExecutionTime(
  testFiles: string[], 
  maxConnectionsPerMinute: number,
  retryDelayMs: number
): number {
  let totalConnections = 0;
  let totalTime = 0;
  
  for (const testFile of testFiles) {
    const profile = getTestProfile(testFile);
    if (profile) {
      totalConnections += profile.estimatedConnections;
    } else {
      // Assume 1 connection for unknown tests
      totalConnections += 1;
    }
  }
  
  // Calculate number of rate limit windows needed
  const windowsNeeded = Math.ceil(totalConnections / maxConnectionsPerMinute);
  
  // Base time: 30 seconds per test (rough average)
  totalTime = testFiles.length * 30000;
  
  // Add rate limit delays between windows
  if (windowsNeeded > 1) {
    totalTime += (windowsNeeded - 1) * 60000; // 1 minute between windows
  }
  
  // Add retry delays (assume 10% of connections need retry)
  const estimatedRetries = Math.ceil(totalConnections * 0.1);
  totalTime += estimatedRetries * retryDelayMs;
  
  return totalTime;
}

/**
 * Generate Playwright test pattern for optimized execution
 */
export function generateTestPattern(batch: string[]): string {
  return batch.map(test => test.replace('.ts', '')).join('|');
}