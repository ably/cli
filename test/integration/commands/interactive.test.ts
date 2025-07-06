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

describe('Interactive Command Integration', function() {
  this.timeout(15000); // Increase timeout for CI environments
  
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
  
  it('should start interactive mode and respond to commands', async function() {
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
    expect(output).to.include('interactive CLI'); // Part of the tagline
    expect(output).to.include('$ '); // Prompt
    expect(output).to.include('Goodbye!');
  });
  
  it('should handle exit command with special exit code in wrapper mode', async function() {
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
  
  it('should save command history', async function() {
    const proc = spawn('node', [binPath, 'interactive'], {
      env: {
        ...process.env,
        ABLY_HISTORY_FILE: testHistoryFile,
        ABLY_SUPPRESS_WELCOME: '1', // Suppress welcome for cleaner output
      },
    });
    
    let _output = '';
    let promptCount = 0;
    
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      _output += text;
      // Count prompts to know when commands have completed
      const prompts = text.match(/\$ /g);
      if (prompts) {
        promptCount += prompts.length;
      }
    });
    
    // Wait for initial prompt
    await new Promise<void>((resolve) => {
      const checkPrompt = setInterval(() => {
        if (promptCount >= 1) {
          clearInterval(checkPrompt);
          resolve();
        }
      }, 100);
    });
    
    // Send help command and wait for it to complete
    proc.stdin.write('help\n');
    await new Promise<void>((resolve) => {
      const startPrompts = promptCount;
      const timeout = setTimeout(() => resolve(), 3000); // Timeout after 3s
      const checkPrompt = setInterval(() => {
        if (promptCount > startPrompts) {
          clearInterval(checkPrompt);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
    
    // Send version command and wait for it to complete
    proc.stdin.write('version\n');
    await new Promise<void>((resolve) => {
      const startPrompts = promptCount;
      const timeout = setTimeout(() => resolve(), 3000); // Timeout after 3s
      const checkPrompt = setInterval(() => {
        if (promptCount > startPrompts) {
          clearInterval(checkPrompt);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });
    
    // Exit
    proc.stdin.write('exit\n');
    
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
    });
    
    // Check history file
    expect(fs.existsSync(testHistoryFile)).to.be.true;
    const history = fs.readFileSync(testHistoryFile, 'utf8').trim();
    const historyLines = history.split('\n').filter(line => line.trim());
    
    // Both commands should be in history
    expect(historyLines).to.include('help');
    expect(historyLines).to.include('version');
  });
  
  it('should handle SIGINT without exiting', async function() {
    const proc = spawn('node', [binPath, 'interactive'], {
      env: {
        ...process.env,
        ABLY_HISTORY_FILE: testHistoryFile,
        ABLY_SUPPRESS_WELCOME: '1',
      },
    });
    
    let output = '';
    let exitCode: number | null = null;
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('exit', (code) => {
      exitCode = code;
    });
    
    // Wait for prompt
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Send Ctrl+C as stdin input (this is how it would come from terminal)
    proc.stdin.write('\u0003'); // Ctrl+C character
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Process should still be running
    expect(exitCode).to.be.null;
    
    // Should see Ctrl+C feedback
    expect(output).to.include('^C');
    
    // Send exit command
    proc.stdin.write('exit\n');
    
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
    });
    
    // Should have exited normally
    expect(exitCode).to.equal(0);
  });
});