import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing SIGINT handling in interactive mode...\n');

const proc = spawn('node', [path.join(__dirname, '../../bin/development.js'), 'interactive'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1', DEBUG: '1' }
});

let output = '';
let errorOutput = '';

proc.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  console.log('[STDOUT]', text.trim());
});

proc.stderr.on('data', (data) => {
  const text = data.toString();
  errorOutput += text;
  console.error('[STDERR]', text.trim());
});

proc.on('error', (error) => {
  console.error('[SPAWN ERROR]', error);
});

proc.on('exit', (code, signal) => {
  console.log(`\n[EXIT] Process exited with code: ${code}, signal: ${signal}`);
  if (code === 130) {
    console.log('✓ SUCCESS: Process exited with code 130 as expected');
  } else {
    console.log('✗ FAIL: Expected exit code 130');
  }
  process.exit(code === 130 ? 0 : 1);
});

// Wait for prompt
let promptFound = false;
const checkForPrompt = setInterval(() => {
  if (output.includes('$ ') && !promptFound) {
    promptFound = true;
    clearInterval(checkForPrompt);
    
    console.log('\n[TEST] Prompt found! Sending test:wait command...');
    proc.stdin.write('test:wait --duration 10\n');
    
    // Wait for command to start
    let commandStarted = false;
    const checkForCommand = setInterval(() => {
      if (output.includes('Waiting for') && !commandStarted) {
        commandStarted = true;
        clearInterval(checkForCommand);
        
        console.log('[TEST] Command started. Sending Ctrl+C...');
        proc.stdin.write('\u0003');
        
        // Also send SIGINT after a delay
        setTimeout(() => {
          if (!proc.killed) {
            console.log('[TEST] Also sending SIGINT...');
            proc.kill('SIGINT');
          }
        }, 500);
      }
    }, 100);
    
    // Timeout for command start
    setTimeout(() => {
      if (!commandStarted) {
        clearInterval(checkForCommand);
        console.log('[TEST] Command did not start properly');
        console.log('[TEST] Full output:', output);
        proc.kill('SIGTERM');
      }
    }, 5000);
  }
}, 100);

// Overall timeout
setTimeout(() => {
  if (!promptFound) {
    clearInterval(checkForPrompt);
    console.log('[TEST] No prompt found after 10 seconds');
    console.log('[TEST] Full output:', output);
    console.log('[TEST] Full error output:', errorOutput);
    proc.kill('SIGTERM');
  }
}, 10_000);