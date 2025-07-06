import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing SIGINT with development.js...\n');

const proc = spawn('node', [path.join(__dirname, '../../bin/development.js'), 'interactive'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
});

proc.stdout.on('data', (data) => {
  process.stdout.write(data);
});

proc.stderr.on('data', (data) => {
  process.stderr.write(data);
});

proc.on('exit', (code, signal) => {
  console.log(`\nProcess exited with code: ${code}, signal: ${signal}`);
  console.log('Exit code 130?', code === 130);
  process.exit(code === 130 ? 0 : 1);
});

// Wait a bit for startup
setTimeout(() => {
  console.log('\nSending test:wait command...');
  proc.stdin.write('test:wait --duration 10\n');
  
  // Wait for command to start
  setTimeout(() => {
    console.log('Sending Ctrl+C (\\u0003)...');
    proc.stdin.write('\u0003');
    
    // Also send SIGINT
    setTimeout(() => {
      if (!proc.killed) {
        console.log('Sending SIGINT...');
        proc.kill('SIGINT');
      }
    }, 500);
  }, 2000);
}, 2000);