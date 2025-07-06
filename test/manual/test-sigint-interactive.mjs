import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing SIGINT handling in interactive mode...\n');

const proc = spawn('node', [path.join(__dirname, '../../bin/development.js'), 'interactive'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
});

let output = '';

proc.stdout.on('data', (data) => {
  output += data.toString();
  process.stdout.write(data);
});

proc.stderr.on('data', (data) => {
  output += data.toString();
  process.stderr.write(data);
});

proc.on('exit', (code, signal) => {
  console.log(`\nProcess exited with code: ${code}, signal: ${signal}`);
  if (code === 130) {
    console.log('✓ SUCCESS: Process exited with code 130 as expected');
  } else {
    console.log('✗ FAIL: Expected exit code 130');
  }
  process.exit(code === 130 ? 0 : 1);
});

// Wait for prompt
setTimeout(() => {
  if (output.includes('$ ')) {
    console.log('\nSending test:wait command...');
    proc.stdin.write('test:wait --duration 10\n');
    
    // Wait for command to start
    setTimeout(() => {
      if (output.includes('Waiting for')) {
        console.log('Command started. Sending Ctrl+C...');
        proc.stdin.write('\u0003');
        
        // Also send SIGINT after a delay
        setTimeout(() => {
          if (!proc.killed) {
            console.log('Also sending SIGINT...');
            proc.kill('SIGINT');
          }
        }, 500);
      } else {
        console.log('Command did not start properly');
        console.log('Output:', output);
        proc.kill('SIGTERM');
      }
    }, 1000);
  } else {
    console.log('No prompt found');
    console.log('Output:', output);
    proc.kill('SIGTERM');
  }
}, 1000);