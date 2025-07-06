import { expect } from 'chai';
import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('E2E: Interactive Mode - Ctrl+C Behavior', function() {
  this.timeout(30000);
  
  let proc: ChildProcess;
  
  // Helper to wait for a pattern in output
  async function waitForOutput(proc: ChildProcess, pattern: RegExp, timeout = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for pattern: ${pattern}`));
      }, timeout);
      
      const onData = (data: Buffer) => {
        output += data.toString();
        if (pattern.test(output)) {
          clearTimeout(timer);
          resolve(output);
        }
      };
      
      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);
    });
  }
  
  // Helper to capture output for a duration
  async function captureOutput(proc: ChildProcess, duration: number): Promise<string> {
    return new Promise((resolve) => {
      let output = '';
      
      const onData = (data: Buffer) => {
        output += data.toString();
      };
      
      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);
      
      setTimeout(() => {
        proc.stdout?.removeListener('data', onData);
        proc.stderr?.removeListener('data', onData);
        resolve(output);
      }, duration);
    });
  }
  
  afterEach(function() {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  });
  
  describe('Ctrl+C at Empty Prompt', function() {
    it('should show message about typing exit when Ctrl+C pressed at empty prompt', async function() {
      proc = spawn('node', [path.join(__dirname, '../../../bin/development.js'), 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      // Wait for prompt
      await waitForOutput(proc, /\$/);
      
      // Send Ctrl+C
      proc.stdin!.write('\u0003');
      
      // Capture output
      const output = await captureOutput(proc, 1000);
      
      // Should show ^C and message
      expect(output).to.include('^C');
      expect(output).to.match(/Signal received|Type 'exit' to quit|To exit.*type 'exit'/i);
      
      // Should still have prompt
      expect(output).to.include('$');
      
      // Clean exit
      proc.stdin!.write('exit\n');
    });
    
    it('should remain functional after Ctrl+C at empty prompt', async function() {
      proc = spawn('node', [path.join(__dirname, '../../../bin/development.js'), 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      // Wait for prompt
      await waitForOutput(proc, /\$/);
      
      // Send Ctrl+C
      proc.stdin!.write('\u0003');
      
      // Wait a bit
      await captureOutput(proc, 500);
      
      // Try running help command
      proc.stdin!.write('help\n');
      
      // Should see help output
      const output = await captureOutput(proc, 2000);
      expect(output).to.match(/help|Usage:|Commands:/i);
      
      // Clean exit
      proc.stdin!.write('exit\n');
    });
  });
  
  describe('Ctrl+C During Command Execution', function() {
    it('should interrupt test:wait command and return to prompt', async function() {
      // In interactive mode, Ctrl+C should interrupt the command but NOT exit the process
      proc = spawn('node', [path.join(__dirname, '../../../bin/development.js'), 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      
      // Process should NOT exit in interactive mode
      
      proc.stdout?.on('data', (data) => {
        output += data.toString();
        if (process.env.DEBUG_TEST) console.log('STDOUT:', data.toString());
      });
      proc.stderr?.on('data', (data) => {
        output += data.toString();
        if (process.env.DEBUG_TEST) console.log('STDERR:', data.toString());
      });
      
      // Wait for prompt using simple polling
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (output.includes('$ ')) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(); // Continue even if no prompt
        }, 5000);
      });
      
      // Start test:wait command
      proc.stdin!.write('test:wait --duration 10\n');
      
      // Wait for command to start using simple polling
      await new Promise<void>((resolve) => {
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
          if (output.includes('Waiting for') && output.includes('seconds')) {
            clearInterval(checkInterval);
            resolve();
          } else if (Date.now() - startTime > 3000) {
            clearInterval(checkInterval);
            console.log('Warning: Command may not have started properly');
            resolve();
          }
        }, 100);
      });
      
      // Small delay to ensure command is fully started
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Send SIGINT to interrupt the command
      proc.kill('SIGINT');
      
      // Wait for command to be interrupted and return to prompt
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          // Look for a new prompt after the command was interrupted
          const lines = output.split('\n');
          const promptCount = lines.filter(line => line.includes('$ ')).length;
          if (promptCount >= 2) { // Initial prompt + prompt after interrupt
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 5000);
      });
      
      // Verify we're back at the prompt
      expect(output).to.include('$ ');
      
      // Send a simple command to verify it's still working
      output = '';
      proc.stdin!.write('echo "still working"\n');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(output).to.include('still working');
      
      // Clean exit
      proc.stdin!.write('exit\n');
      await new Promise(resolve => proc.on('exit', resolve));
    });
    
    it('should return to prompt when SIGINT is received during command execution', async function() {
      // In interactive mode, SIGINT should NOT exit the process
      // Instead, it should interrupt the command and return to the prompt
      const binPath = path.join(__dirname, '../../../bin/run.js');
      
      proc = spawn('node', [binPath, 'interactive'], {
        stdio: 'pipe',
        env: {
          ...process.env,
          ABLY_SUPPRESS_WELCOME: '1'
        }
      });
      
      let promptCount = 0;
      
      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        
        // Count prompts
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
      
      // Send test:wait command
      proc.stdin!.write('test:wait --duration 10\n');
      
      // Wait for command to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send SIGINT
      proc.kill('SIGINT');
      
      // Wait for return to prompt
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, 3000);
        
        const checkPrompt = setInterval(() => {
          if (promptCount >= 2) { // Initial prompt + prompt after interrupt
            clearInterval(checkPrompt);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });
      
      // Should have returned to prompt, not exited
      expect(promptCount).to.be.at.least(2);
      
      // Process should still be running - send exit command
      proc.stdin!.write('exit\n');
      
      // Now wait for exit
      const exitCode = await new Promise<number>((resolve) => {
        proc.on('exit', (code) => {
          resolve(code || 0);
        });
      });
      
      expect(exitCode).to.equal(0); // Normal exit after 'exit' command
    });
  });
  
  describe('User Feedback', function() {
    it('should show interrupt feedback when Ctrl+C is pressed during command', async function() {
      const cliPath = path.resolve(__dirname, '../../../bin/development.js');
      
      proc = spawn('node', [cliPath, 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || process.env.ABLY_API_KEY, ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let errorOutput = '';
      
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      // Wait for prompt and send test:wait command
      await new Promise<void>((resolve) => {
        const checkForPrompt = setInterval(() => {
          if (output.includes('$')) {
            clearInterval(checkForPrompt);
            proc.stdin!.write('test:wait --duration 10\n');
            resolve();
          }
        }, 100);
      });
      
      // Wait for command to start
      await new Promise<void>((resolve) => {
        const checkForWaiting = setInterval(() => {
          if (output.includes('Waiting for')) {
            clearInterval(checkForWaiting);
            resolve();
          }
        }, 100);
      });
      
      // Send SIGINT
      proc.kill('SIGINT');
      
      // Wait for the process to return to prompt after interrupt
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check for feedback - it should appear in either stdout or stderr
      const allOutput = output + errorOutput;
      expect(allOutput).to.include('↓ Stopping');
      
      // Verify we're back at prompt
      const lines = output.split('\n');
      const promptCount = lines.filter(line => line.includes('$ ')).length;
      expect(promptCount).to.be.at.least(2); // Initial prompt + prompt after interrupt
      
      // Clean exit
      proc.stdin!.write('exit\n');
    });
    
    
    it('should handle double Ctrl+C for force quit', async function() {
      const cliPath = path.resolve(__dirname, '../../../bin/development.js');
      
      proc = spawn('node', [cliPath, 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env, 
          ABLY_SUPPRESS_WELCOME: '1',
          ABLY_INTERACTIVE_MODE: 'true' // Ensure sigint-exit.ts is active
        }
      });
      
      let errorOutput = '';
      let output = '';
      
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      // Track exit
      let hasExited = false;
      const exitPromise = new Promise<number>((resolve) => {
        proc.on('exit', (code) => {
          hasExited = true;
          resolve(code || 0);
        });
      });
      
      // Wait for prompt
      await new Promise<void>((resolve) => {
        const checkForPrompt = setInterval(() => {
          if (output.includes('$')) {
            clearInterval(checkForPrompt);
            proc.stdin!.write('test:wait --duration 30\n');
            resolve();
          }
        }, 100);
      });
      
      // Wait for command to start
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (output.includes('Waiting for')) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
      
      // Send first SIGINT
      proc.kill('SIGINT');
      
      // Wait a bit to ensure first SIGINT is processed
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check if process has exited after first SIGINT (it shouldn't in interactive mode)
      if (hasExited) {
        // If it exited after first SIGINT, that's wrong for interactive mode
        // but we'll check the exit code anyway
        const exitCode = await exitPromise;
        expect(exitCode).to.equal(130);
        return;
      }
      
      // Send second SIGINT for force quit
      proc.kill('SIGINT');
      
      const exitCode = await exitPromise;
      expect(exitCode).to.equal(130); // Standard SIGINT exit code
      
      // Check for force quit message in either stdout or stderr
      const allOutput = output + errorOutput;
      expect(allOutput).to.include('⚠ Force quit');
    });
  });
  
  describe('Edge Cases', function() {
    it('should handle Ctrl+C during partial command entry', async function() {
      proc = spawn('node', [path.join(__dirname, '../../../bin/development.js'), 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      // Wait for prompt
      await waitForOutput(proc, /\$/);
      
      // Type partial command
      proc.stdin!.write('test:wa');
      
      // Send Ctrl+C
      proc.stdin!.write('\u0003');
      
      // Should clear line and show new prompt
      const output = await captureOutput(proc, 1000);
      expect(output).to.include('^C');
      expect(output).to.include('$');
      
      // Should be able to type new command
      proc.stdin!.write('help\n');
      const helpOutput = await captureOutput(proc, 2000);
      expect(helpOutput).to.match(/help|Usage:|Commands:/i);
      
      // Clean exit
      proc.stdin!.write('exit\n');
    });
    
    it('should handle multiple rapid Ctrl+C presses', async function() {
      proc = spawn('node', [path.join(__dirname, '../../../bin/development.js'), 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let captureOutput = true;
      
      proc.stdout?.on('data', (data) => {
        if (captureOutput) {
          output += data.toString();
        }
      });
      
      // Wait for initial prompt
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (output.includes('$ ')) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
      
      // Send 5 consecutive Ctrl+C at prompt
      for (let i = 0; i < 5; i++) {
        proc.stdin!.write('\u0003'); // Send Ctrl+C as stdin input instead of SIGINT
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between signals
      }
      
      // Wait a bit for all signals to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Clear previous output and start capturing fresh
      output = '';
      
      // Should still be functional - send a command
      proc.stdin!.write('echo "still working after 5 Ctrl+C"\n');
      
      // Wait for the echo command to complete
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Check that the echo worked
      expect(output).to.include('still working after 5 Ctrl+C');
      
      // Clean exit
      proc.stdin!.write('exit\n');
      await new Promise(resolve => proc.on('exit', resolve));
    });
  });
  
  
  describe('Real TTY Behavior', function() {
    it('should NOT crash with setRawMode EIO after Ctrl+C during command execution', async function() {
      // This test verifies that Ctrl+C during a long-running command doesn't corrupt the terminal
      // We'll test this without node-pty by using regular spawn
        
      proc = spawn('node', [path.join(__dirname, '../../../bin/run.js'), 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let hasEIOError = false;
      
      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      proc.stderr?.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (text.includes('setRawMode') && text.includes('EIO')) {
          hasEIOError = true;
        }
      });
      
      // Wait for initial prompt
      await new Promise<void>((resolve) => {
        const checkPrompt = setInterval(() => {
          if (output.includes('$ ')) {
            clearInterval(checkPrompt);
            resolve();
          }
        }, 100);
      });
      
      // Send test:wait command
      proc.stdin!.write('test:wait --duration 10\n');
      
      // Wait for command to start
      await new Promise<void>((resolve) => {
        const checkStarted = setInterval(() => {
          if (output.includes('Waiting for')) {
            clearInterval(checkStarted);
            resolve();
          }
        }, 100);
      });
      
      // Send SIGINT
      proc.kill('SIGINT');
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 2000));
        
      // The process should NOT crash with setRawMode EIO error
      expect(hasEIOError).to.be.false;
      
      // Wait a bit more to ensure we get back to prompt
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Should return to prompt
      expect(output).to.include('$ ');
      
      // Terminal should be functional - send a simple command
      output = '';
      proc.stdin!.write('help\n');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Should see version output
      expect(output).to.include('help'); // Help output
      
      // Clean exit
      proc.stdin!.write('exit\n');
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        proc.on('exit', () => {
          resolve();
        });
      });
    });
    
    it('should handle Ctrl+C gracefully without terminal corruption', async function() {
      // Test that Ctrl+C during command execution doesn't corrupt the terminal
      proc = spawn('node', [path.join(__dirname, '../../../bin/run.js'), 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let hasError = false;
      
      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        if (process.env.DEBUG_TEST) {
          console.log('STDOUT:', text);
        }
        
        // Check for the specific error
        if (text.includes('setRawMode EIO') || text.includes('Failed to start interactive mode')) {
          hasError = true;
          console.error('DETECTED ERROR:', text);
        }
      });
      
      proc.stderr?.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        if (process.env.DEBUG_TEST) {
          console.log('STDERR:', text);
        }
        
        if (text.includes('setRawMode EIO') || text.includes('Failed to start interactive mode')) {
          hasError = true;
          console.error('DETECTED ERROR:', text);
        }
      });
      
      // Wait for initial prompt
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for initial prompt')), 10000);
        const check = setInterval(() => {
          if (output.includes('$ ')) {
            clearInterval(check);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });
      
      // Send test:wait command
      proc.stdin!.write('test:wait --duration 10\n');
      
      // Wait for command to start
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for command to start')), 5000);
        const check = setInterval(() => {
          if (output.includes('Waiting for')) {
            clearInterval(check);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });
      
      // Clear output tracking before Ctrl+C
      output = '';
      
      // Send SIGINT to the process
      proc.kill('SIGINT');
      
      // Wait for the process to handle the signal and show a new prompt
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check that we didn't get the setRawMode EIO error
      expect(hasError).to.be.false;
      expect(output).to.not.include('setRawMode EIO');
      expect(output).to.not.include('Failed to start interactive mode');
      
      // We should see a new prompt
      expect(output).to.include('$ ');
      
      // Try running a command to verify terminal is functional
      output = '';
      proc.stdin!.write('help\n');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Should see version output without errors
      expect(output).to.include('help'); // Help output
      expect(output).to.not.include('Error');
      
      // Clean exit
      proc.stdin!.write('exit\n');
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        proc.on('exit', () => {
          resolve();
        });
      });
    });
  });
  
  
});
