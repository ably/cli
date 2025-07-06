import { expect } from 'chai';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const binPath = path.join(__dirname, '..', '..', '..', 'bin', 'run.js');
const testHistoryDir = path.join(os.tmpdir(), 'ably-test-' + Date.now());
const testHistoryFile = path.join(testHistoryDir, 'history');

describe('Interactive Mode - "ably" command feedback', function() {
  this.timeout(10000); // Increase timeout for CI environments
  
  beforeEach(function() {
    // Create test history directory
    fs.mkdirSync(testHistoryDir, { recursive: true });
  });
  
  afterEach(function() {
    // Clean up test history directory
    try {
      fs.rmSync(testHistoryDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
  
  it('should show helpful message when user types "ably" in interactive mode', async function() {
    const proc = spawn('node', [binPath, 'interactive'], {
      env: {
        ...process.env,
        ABLY_HISTORY_FILE: testHistoryFile,
        ABLY_SUPPRESS_WELCOME: '1', // Suppress welcome for cleaner output
      },
    });
    
    let output = '';
    let errorOutput = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Wait for prompt
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send "ably" command
    proc.stdin.write('ably\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send exit command
    proc.stdin.write('exit\n');
    
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
    });
    
    // Verify the helpful message was displayed
    expect(output).to.include("You're already in interactive mode. Type 'help' or press TAB to see available commands.");
    
    // Verify no errors
    expect(errorOutput).to.be.empty;
  });
  
  it('should not trigger for commands containing "ably" as substring', async function() {
    const proc = spawn('node', [binPath, 'interactive'], {
      env: {
        ...process.env,
        ABLY_HISTORY_FILE: testHistoryFile,
        ABLY_SUPPRESS_WELCOME: '1',
      },
    });
    
    let output = '';
    let errorOutput = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Wait for prompt
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send a command that contains "ably" but isn't just "ably"
    proc.stdin.write('probably-not-a-command\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send exit command
    proc.stdin.write('exit\n');
    
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
    });
    
    // Verify the helpful message was NOT displayed
    expect(output).not.to.include("You're already in interactive mode");
    
    // Should see command not found error (might be in stdout or stderr)
    const combinedOutput = output + errorOutput;
    expect(combinedOutput).to.match(/not found|unknown command/i);
  });
  
  it('should save "ably" command to history', async function() {
    const proc = spawn('node', [binPath, 'interactive'], {
      env: {
        ...process.env,
        ABLY_HISTORY_FILE: testHistoryFile,
        ABLY_SUPPRESS_WELCOME: '1',
      },
    });
    
    // Wait for prompt
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send "ably" command
    proc.stdin.write('ably\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send exit command
    proc.stdin.write('exit\n');
    
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
    });
    
    // Check history file
    const historyContent = fs.readFileSync(testHistoryFile, 'utf8');
    expect(historyContent).to.include('ably');
  });
});