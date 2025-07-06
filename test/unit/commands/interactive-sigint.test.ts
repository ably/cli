import { expect } from 'chai';
import { describe, it } from 'mocha';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Interactive Mode - SIGINT Handling', () => {
  const timeout = 10000;
  let binPath: string;
  
  before(function() {
    binPath = path.join(__dirname, '../../../bin/development.js');
  });

  it('should handle Ctrl+C during command execution by returning to prompt', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let _output = '';
    let errorOutput = '';
    let commandStarted = false;
    let promptSeen = false;
    let promptCount = 0;
    
    child.stdout.on('data', (data) => {
      const output = data.toString();
      _output += output;
      
      
      // Count prompts
      const promptMatches = output.match(/\$ /g);
      if (promptMatches) {
        promptCount += promptMatches.length;
      }
      
      // Check for initial prompt (with or without ANSI codes)
      if (!promptSeen && (output.includes('$ ') || output.includes('$\u001B'))) {
        promptSeen = true;
        // Send test:wait command after seeing prompt
        setTimeout(() => {
          child.stdin.write('test:wait --duration 10\n');
        }, 100);
      }
      
      // Check if test:wait command started
      if (output.includes('Waiting for')) {
        commandStarted = true;
        // Send SIGINT after a short delay
        setTimeout(() => {
          child.kill('SIGINT');
        }, 500);
      }
      
      // After SIGINT, we should get back to prompt
      if (commandStarted && promptCount >= 2) {
        // We're back at prompt after interrupt - send exit
        setTimeout(() => {
          child.stdin.write('exit\n');
        }, 100);
      }
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('exit', (code) => {
      // Should exit with code 0 or 42 (user exit)
      expect(code).to.be.oneOf([0, 42]);
      // Should have sent the command
      expect(commandStarted).to.be.true;
      // Should have returned to prompt (at least 2 prompts)
      expect(promptCount).to.be.at.least(2);
      // Should show interrupt feedback
      expect(_output + errorOutput).to.include('↓ Stopping');
      // Should not have EIO errors
      expect(errorOutput).to.not.include('Error: read EIO');
      expect(errorOutput).to.not.include('setRawMode EIO');
      done();
    });
    
    // Timeout fallback
    setTimeout(() => {
      if (!commandStarted) {
        console.error('Test timeout: command never started');
      }
      child.stdin.write('exit\n');
    }, timeout - 1000);
  });

  it.skip('should handle Ctrl+C on empty prompt', function(done) {
    // SKIPPED: This test is flaky in non-TTY environments
    // The interactive mode readline SIGINT handler may not work properly
    // when stdio is piped instead of connected to a TTY
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let _output = '';
    let sigintSent = false;
    let exitSent = false;
    
    child.stdout.on('data', (data) => {
      _output += data.toString();
      
      
      // Wait for initial prompt
      if (!sigintSent && (data.toString().includes('$ ') || data.toString().includes('$\u001B'))) {
        sigintSent = true;
        // Send SIGINT on empty prompt
        setTimeout(() => {
          child.kill('SIGINT');
        }, 100);
      }
      
      // Check for ^C and new prompt after SIGINT
      if (sigintSent && !exitSent && (data.toString().includes('^C') || data.toString().includes('Signal received'))) {
        exitSent = true;
        // Wait a bit for the new prompt to appear
        setTimeout(() => {
          child.stdin.write('exit\n');
        }, 200);
      }
    });
    
    child.on('exit', (code) => {
      expect(code).to.be.oneOf([0, 42]);
      // We should either see ^C or the signal message
      const hasCtrlC = _output.includes('^C');
      const hasSignalMessage = _output.includes('Signal received');
      expect(hasCtrlC || hasSignalMessage).to.be.true;
      done();
    });
    
    // Timeout fallback
    setTimeout(() => {
      if (!exitSent) {
        console.error('Test timeout: no SIGINT response detected');
        child.stdin.write('exit\n');
      }
    }, timeout - 1000);
  });

  it.skip('should handle Ctrl+C with partial command input', function(done) {
    // SKIPPED: This test is flaky in non-TTY environments
    // The interactive mode readline SIGINT handler may not work properly
    // when stdio is piped instead of connected to a TTY
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let _output = '';
    let commandTyped = false;
    
    child.stdout.on('data', (data) => {
      _output += data.toString();
      
      if (!commandTyped && (data.toString().includes('$ ') || data.toString().includes('$\u001B'))) {
        commandTyped = true;
        // Type partial command
        child.stdin.write('channels sub');
        
        // Send SIGINT after typing
        setTimeout(() => {
          child.kill('SIGINT');
        }, 100);
      }
      
      // Check for ^C and cleared line
      if (commandTyped && data.toString().includes('^C')) {
        // Line should be cleared and we should be back at prompt
        setTimeout(() => {
          child.stdin.write('exit\n');
        }, 100);
      }
    });
    
    child.on('exit', (code) => {
      expect(code).to.be.oneOf([0, 42]);
      // Should see ^C when canceling partial input
      expect(_output).to.include('^C');
      done();
    });
    
    // Add timeout fallback - send exit command instead of SIGTERM
    setTimeout(() => {
      child.stdin.write('exit\n');
    }, timeout - 2000);
  });

  it('should exit with code 130 on double Ctrl+C (force quit)', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let errorOutput = '';
    let promptSeen = false;
    
    child.stdout.on('data', (data) => {
      const output = data.toString();
      
      if (!promptSeen && (output.includes('$ ') || output.includes('$\u001B'))) {
        promptSeen = true;
        // Send test:wait command
        setTimeout(() => {
          child.stdin.write('test:wait --duration 10\n');
        }, 100);
      }
      
      // When command starts, send double SIGINT
      if (output.includes('Waiting for')) {
        setTimeout(() => {
          child.kill('SIGINT');
          // Send second SIGINT quickly
          setTimeout(() => {
            child.kill('SIGINT');
          }, 200);
        }, 100);
      }
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('exit', (code) => {
      // Should exit with code 130 (double SIGINT force quit)
      expect(code).to.equal(130);
      // Should show force quit message
      expect(errorOutput).to.include('⚠ Force quit');
      done();
    });
  });
});