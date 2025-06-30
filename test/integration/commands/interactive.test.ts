import { expect } from 'chai';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Interactive Command Integration', () => {
  const binPath = path.join(__dirname, '..', '..', '..', 'bin', 'run.js');
  const testHistoryDir = path.join(os.tmpdir(), 'ably-test-' + Date.now());
  const testHistoryFile = path.join(testHistoryDir, 'history');
  
  beforeEach(() => {
    // Create test history directory
    fs.mkdirSync(testHistoryDir, { recursive: true });
  });
  
  afterEach(() => {
    // Clean up test history directory
    try {
      fs.rmSync(testHistoryDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });
  
  it('should start interactive mode and respond to commands', async () => {
    const proc = spawn('node', [binPath, 'interactive'], {
      env: {
        ...process.env,
        ABLY_HISTORY_FILE: testHistoryFile,
      },
    });
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    // Wait for prompt
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send version command
    proc.stdin.write('version\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send exit command
    proc.stdin.write('exit\n');
    
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
    });
    
    // Verify output
    expect(output).to.include('Welcome to Ably interactive shell');
    expect(output).to.include('$ '); // Prompt
    expect(output).to.include('Goodbye!');
  });
  
  it('should handle exit command with special exit code in wrapper mode', async () => {
    const proc = spawn('node', [binPath, 'interactive'], {
      env: {
        ...process.env,
        ABLY_WRAPPER_MODE: '1',
        ABLY_HISTORY_FILE: testHistoryFile,
      },
    });
    
    // Wait for prompt
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send exit command
    proc.stdin.write('exit\n');
    
    // Wait for process to exit
    const exitCode = await new Promise<number>((resolve) => {
      proc.on('exit', (code) => resolve(code || 0));
    });
    
    expect(exitCode).to.equal(42); // Special exit code
  });
  
  it('should save command history', async () => {
    const proc = spawn('node', [binPath, 'interactive'], {
      env: {
        ...process.env,
        ABLY_HISTORY_FILE: testHistoryFile,
      },
    });
    
    // Wait for prompt
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send commands
    proc.stdin.write('help\n');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    proc.stdin.write('version\n');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Exit
    proc.stdin.write('exit\n');
    
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
    });
    
    // Check history file
    expect(fs.existsSync(testHistoryFile)).to.be.true;
    const history = fs.readFileSync(testHistoryFile, 'utf-8');
    expect(history).to.include('help\n');
    expect(history).to.include('version\n');
  });
  
  it('should handle SIGINT without exiting', async () => {
    const proc = spawn('node', [binPath, 'interactive'], {
      env: {
        ...process.env,
        ABLY_HISTORY_FILE: testHistoryFile,
      },
    });
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    // Wait for prompt
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send SIGINT
    proc.kill('SIGINT');
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Process should still be running, send exit
    proc.stdin.write('exit\n');
    
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
    });
    
    // Should see warning message
    expect(output).to.include('Signal received');
  });
});