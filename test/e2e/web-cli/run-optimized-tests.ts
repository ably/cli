#!/usr/bin/env tsx
/**
 * Optimized test runner for web-cli E2E tests
 * 
 * This script runs tests in an optimized order to minimize rate limit delays
 * and provides better progress reporting.
 */

import { execSync } from 'child_process';
import { calculateTestBatches, estimateExecutionTime, getTestProfile } from './helpers/test-optimizer';
import { setupRateLimiter, configs } from './rate-limit-config';

// Determine which config to use
const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
const configName = isCI ? 'ci' : 'local';
const config = configs[configName];

console.log(`\n🚀 Running optimized web-cli E2E tests`);
console.log(`📋 Environment: ${configName}`);
console.log(`⚡ Max connections/minute: ${config.maxConnectionsPerMinute}`);
console.log(`⏱️  Retry delay: ${config.retryDelayMs}ms`);

// Setup rate limiter
setupRateLimiter();

// Get all test files
const testFiles = [
  'authentication.test.ts',
  'web-cli.test.ts',
  'session-resume.test.ts',
  'prompt-integrity.test.ts',
  'reconnection.test.ts',
  'reconnection-diagnostic.test.ts',
  // 'z-rate-limit-trigger.test.ts' // Skip by default as it's a stress test
];

// Calculate optimal batches
const batches = calculateTestBatches(config.maxConnectionsPerMinute);

// Estimate total time
const estimatedTime = estimateExecutionTime(testFiles, config.maxConnectionsPerMinute, config.retryDelayMs);
console.log(`⏰ Estimated execution time: ${Math.ceil(estimatedTime / 60000)} minutes\n`);

// Run tests in batches
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  console.log(`\n📦 Batch ${i + 1}/${batches.length}:`);
  
  // Show batch details
  for (const test of batch) {
    const profile = getTestProfile(test);
    console.log(`  - ${test} (${profile?.estimatedConnections || 1} connections)`);
  }
  
  // Calculate batch connection count
  const batchConnections = batch.reduce((sum, test) => {
    const profile = getTestProfile(test);
    return sum + (profile?.estimatedConnections || 1);
  }, 0);
  
  console.log(`  Total connections: ${batchConnections}/${config.maxConnectionsPerMinute}`);
  console.log(`\n  Running batch...`);
  
  // Run the batch
  const testPattern = batch.join(' ');
  const command = `npx playwright test ${testPattern} --project=chromium`;
  
  try {
    const startTime = Date.now();
    execSync(command, { 
      stdio: 'inherit',
      cwd: __dirname,
      env: {
        ...process.env,
        // Ensure rate limiter is configured
        MANUAL_RATE_LIMIT_SETUP: 'false'
      }
    });
    
    const duration = Date.now() - startTime;
    console.log(`\n✅ Batch ${i + 1} completed in ${Math.ceil(duration / 1000)}s`);
    passedTests += batch.length;
  } catch (error) {
    console.log(`\n❌ Batch ${i + 1} failed`);
    failedTests += batch.length;
    
    // Continue with next batch unless CI
    if (isCI) {
      process.exit(1);
    }
  }
  
  totalTests += batch.length;
  
  // Wait between batches if needed
  if (i < batches.length - 1 && batchConnections >= config.maxConnectionsPerMinute - 2) {
    const waitTime = Math.max(60000 - (Date.now() % 60000), 10000);
    console.log(`\n⏳ Waiting ${Math.ceil(waitTime / 1000)}s for rate limit window...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

// Summary
console.log(`\n📊 Test Summary:`);
console.log(`  Total tests: ${totalTests}`);
console.log(`  Passed: ${passedTests}`);
console.log(`  Failed: ${failedTests}`);
console.log(`  Success rate: ${Math.round((passedTests / totalTests) * 100)}%`);

if (failedTests > 0) {
  process.exit(1);
}