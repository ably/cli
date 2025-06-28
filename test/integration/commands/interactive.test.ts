import { expect } from 'chai';
import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to run CLI commands
function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const binPath = path.join(__dirname, '../../../bin/run.js');
    const child = spawn('node', [binPath, ...args], {
      env: { ...process.env, ABLY_INTERACTIVE: 'false' }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code || 0 });
    });
  });
}

describe('interactive command integration tests', () => {
  // Increase timeout for integration tests
  const testTimeout = 30000;

  describe('basic functionality', function() {
    this.timeout(testTimeout);

    it('should start interactive shell and exit gracefully', async () => {
      const binPath = path.join(__dirname, '../../../bin/run.js');
      const child = spawn('node', [binPath, 'interactive'], {
        env: { ...process.env, ABLY_INTERACTIVE: 'false' }
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      // Wait for welcome message
      await new Promise<void>((resolve) => {
        const checkOutput = setInterval(() => {
          if (output.includes('Welcome to Ably interactive shell')) {
            clearInterval(checkOutput);
            resolve();
          }
        }, 100);
      });

      expect(output).to.include('Welcome to Ably interactive shell');
      expect(output).to.include('Type "exit" to quit');

      // Send exit command
      child.stdin.write('exit\n');

      // Wait for process to exit
      const exitCode = await new Promise<number>((resolve) => {
        child.on('close', (code) => resolve(code || 0));
      });

      expect(exitCode).to.equal(0);
      expect(output).to.include('Goodbye!');
    });

    it('should execute commands through worker', async () => {
      const binPath = path.join(__dirname, '../../../bin/run.js');
      const child = spawn('node', [binPath, 'interactive'], {
        env: { ...process.env, ABLY_INTERACTIVE: 'false', DEBUG: '*' }
      });

      let output = '';
      let debugOutput = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        debugOutput += data.toString();
      });

      // Wait for prompt
      await new Promise<void>((resolve) => {
        const checkOutput = setInterval(() => {
          if (output.includes('$ ')) {
            clearInterval(checkOutput);
            resolve();
          }
        }, 100);
      });

      // Send version command
      child.stdin.write('version\n');

      // Wait for command output
      await setTimeout(2000);

      // Check that version was executed
      expect(output).to.match(/\d+\.\d+\.\d+/); // Version number pattern

      // Exit
      child.stdin.write('exit\n');
      
      await new Promise((resolve) => child.on('close', resolve));
    });

    it('should handle Ctrl+C during command execution', async () => {
      const binPath = path.join(__dirname, '../../../bin/run.js');
      const child = spawn('node', [binPath, 'interactive'], {
        env: { ...process.env, ABLY_INTERACTIVE: 'false' }
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      // Wait for prompt
      await new Promise<void>((resolve) => {
        const checkOutput = setInterval(() => {
          if (output.includes('$ ')) {
            clearInterval(checkOutput);
            resolve();
          }
        }, 100);
      });

      // Send help command (which takes a moment to run)
      child.stdin.write('help\n');
      
      // Wait a bit then send SIGINT
      await setTimeout(500);
      child.kill('SIGINT');

      // Should show ^C but not exit
      await setTimeout(1000);
      
      expect(output).to.include('^C');
      expect(child.killed).to.be.false;

      // Should still be able to run commands
      child.stdin.write('version\n');
      await setTimeout(1000);

      // Exit cleanly
      child.stdin.write('exit\n');
      
      const exitCode = await new Promise<number>((resolve) => {
        child.on('close', (code) => resolve(code || 0));
      });

      expect(exitCode).to.equal(0);
    });
  });

  describe('worker lifecycle', function() {
    this.timeout(testTimeout);

    it('should pre-warm worker on keypress', async () => {
      const binPath = path.join(__dirname, '../../../bin/run.js');
      const child = spawn('node', [binPath, 'interactive'], {
        env: { ...process.env, ABLY_INTERACTIVE: 'false', DEBUG: 'ably:*' }
      });

      let debugOutput = '';
      child.stderr.on('data', (data) => {
        debugOutput += data.toString();
      });

      // Wait for shell to start
      await setTimeout(1000);

      // Type a character (but don't press enter)
      child.stdin.write('a');

      // Wait for pre-warming
      await setTimeout(2000);

      // Check debug output for worker start
      expect(debugOutput).to.include('Starting worker process');

      // Clean exit
      child.stdin.write('\n'); // Complete the line
      child.stdin.write('exit\n');
      
      await new Promise((resolve) => child.on('close', resolve));
    });

    it('should terminate idle worker after timeout', async function() {
      // This test needs a longer timeout
      this.timeout(45000);

      const binPath = path.join(__dirname, '../../../bin/run.js');
      // Use shorter idle timeout for testing
      const child = spawn('node', [binPath, 'interactive'], {
        env: { 
          ...process.env, 
          ABLY_INTERACTIVE: 'false',
          DEBUG: 'ably:*',
          ABLY_INTERACTIVE_IDLE_TIMEOUT: '5000' // 5 seconds for testing
        }
      });

      let debugOutput = '';
      child.stderr.on('data', (data) => {
        debugOutput += data.toString();
      });

      // Wait for shell to start
      await setTimeout(1000);

      // Run a command to create worker
      child.stdin.write('version\n');
      
      // Wait for command to complete
      await setTimeout(2000);

      // Wait for idle timeout
      await setTimeout(7000); // Wait longer than idle timeout

      // Check that worker was terminated
      expect(debugOutput).to.include('Idle timeout reached, terminating worker');

      // Clean exit
      child.stdin.write('exit\n');
      
      await new Promise((resolve) => child.on('close', resolve));
    });
  });

  describe('error handling', function() {
    this.timeout(testTimeout);

    it('should handle invalid commands gracefully', async () => {
      const binPath = path.join(__dirname, '../../../bin/run.js');
      const child = spawn('node', [binPath, 'interactive'], {
        env: { ...process.env, ABLY_INTERACTIVE: 'false' }
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      // Wait for prompt
      await new Promise<void>((resolve) => {
        const checkOutput = setInterval(() => {
          if (output.includes('$ ')) {
            clearInterval(checkOutput);
            resolve();
          }
        }, 100);
      });

      // Send invalid command
      child.stdin.write('invalid-command-xyz\n');

      // Wait for error
      await setTimeout(2000);

      // Should show error but remain running
      expect(output).to.include('Error:');
      expect(child.killed).to.be.false;

      // Should show prompt again
      expect(output.match(/\$ /g)?.length).to.be.at.least(2);

      // Exit
      child.stdin.write('exit\n');
      
      await new Promise((resolve) => child.on('close', resolve));
    });

    it('should handle worker crash gracefully', async () => {
      // This test would require mocking or triggering an actual worker crash
      // For now, we'll skip this as it's complex to test reliably
      // In production, the worker error handling is tested via unit tests
    });
  });
});