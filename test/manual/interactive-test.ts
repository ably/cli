#!/usr/bin/env node

/**
 * Manual test script for the interactive command
 * 
 * Run this script to test:
 * 1. Basic REPL functionality
 * 2. Command execution through fork
 * 3. Ctrl+C handling
 * 4. Worker lifecycle (pre-warming, idle timeout)
 * 
 * Usage: npm run build && node test/manual/interactive-test.js
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

console.log(`${YELLOW}Manual Test: Interactive REPL${RESET}\n`);

async function test() {
  console.log('Starting interactive shell...');
  
  const binPath = path.join(__dirname, '../../bin/run.js');
  const child = spawn('node', [binPath, 'interactive'], {
    env: { 
      ...process.env, 
      DEBUG: 'ably:*', // Enable debug logging
      ABLY_INTERACTIVE_IDLE_TIMEOUT: '10000' // 10 seconds for testing
    },
    stdio: 'pipe'
  });

  let output = '';
  let debugOutput = '';

  child.stdout.on('data', (data) => {
    const str = data.toString();
    output += str;
    process.stdout.write(`${GREEN}[STDOUT]${RESET} ${str}`);
  });

  child.stderr.on('data', (data) => {
    const str = data.toString();
    debugOutput += str;
    process.stdout.write(`${YELLOW}[DEBUG]${RESET} ${str}`);
  });

  child.on('error', (err) => {
    console.error(`${RED}[ERROR]${RESET} Process error:`, err);
  });

  // Test sequence
  console.log('\n--- Test 1: Basic functionality ---');
  await setTimeout(1000);

  console.log('Sending "version" command...');
  child.stdin.write('version\n');
  await setTimeout(2000);

  console.log('\n--- Test 2: Invalid command ---');
  child.stdin.write('invalid-command\n');
  await setTimeout(2000);

  console.log('\n--- Test 3: Help command ---');
  child.stdin.write('help\n');
  await setTimeout(3000);

  console.log('\n--- Test 4: Ctrl+C during execution ---');
  child.stdin.write('logs app subscribe\n');
  await setTimeout(1000);
  console.log('Sending SIGINT...');
  child.kill('SIGINT');
  await setTimeout(2000);

  console.log('\n--- Test 5: Worker idle timeout ---');
  console.log('Waiting for idle timeout (10 seconds)...');
  await setTimeout(12000);

  console.log('\n--- Test 6: Command after idle ---');
  child.stdin.write('version\n');
  await setTimeout(2000);

  console.log('\n--- Test complete, exiting ---');
  child.stdin.write('exit\n');

  await new Promise((resolve) => {
    child.on('close', (code) => {
      console.log(`\n${code === 0 ? GREEN : RED}Process exited with code: ${code}${RESET}`);
      resolve(null);
    });
  });

  // Summary
  console.log('\n--- Test Summary ---');
  if (output.includes('Welcome to Ably interactive shell')) {
    console.log(`${GREEN}✓ Shell started successfully${RESET}`);
  } else {
    console.log(`${RED}✗ Shell failed to start${RESET}`);
  }

  if (output.match(/\d+\.\d+\.\d+/)) {
    console.log(`${GREEN}✓ Version command executed${RESET}`);
  } else {
    console.log(`${RED}✗ Version command failed${RESET}`);
  }

  if (output.includes('Error:') && output.includes('invalid-command')) {
    console.log(`${GREEN}✓ Invalid command handled gracefully${RESET}`);
  } else {
    console.log(`${RED}✗ Invalid command handling failed${RESET}`);
  }

  if (debugOutput.includes('Starting worker process')) {
    console.log(`${GREEN}✓ Worker process started${RESET}`);
  } else {
    console.log(`${RED}✗ Worker process failed to start${RESET}`);
  }

  if (debugOutput.includes('Idle timeout reached')) {
    console.log(`${GREEN}✓ Idle timeout working${RESET}`);
  } else {
    console.log(`${YELLOW}⚠ Idle timeout not triggered (may need longer wait)${RESET}`);
  }

  if (output.includes('Goodbye!')) {
    console.log(`${GREEN}✓ Clean exit${RESET}`);
  } else {
    console.log(`${RED}✗ Exit failed${RESET}`);
  }
}

// Run the test
test().catch((err) => {
  console.error(`${RED}Test failed:${RESET}`, err);
  process.exit(1);
});