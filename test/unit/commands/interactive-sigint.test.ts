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

  it('should handle Ctrl+C during command execution gracefully', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let _output = '';
    let errorOutput = '';
    let commandStarted = false;
    
    child.stdout.on('data', (data) => {
      _output += data.toString();
      
      // Check if subscribe command started
      if (data.toString().includes('Subscribed to channel') || data.toString().includes('Successfully attached')) {
        commandStarted = true;
        // Send SIGINT after a short delay
        setTimeout(() => {
          child.kill('SIGINT');
        }, 100);
      }
      
      // Check if we're back at the prompt after SIGINT
      if (commandStarted && data.toString().includes('$')) {
        // Successfully returned to prompt - exit cleanly
        child.stdin.write('exit\n');
      }
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Start a subscribe command
    setTimeout(() => {
      child.stdin.write('channels subscribe test-channel\n');
    }, 500);
    
    child.on('exit', (code) => {
      // Should exit with code 42 (user exit) or 0
      expect(code).to.be.oneOf([0, 42]);
      // Should not have EIO errors
      expect(errorOutput).to.not.include('Error: read EIO');
      expect(errorOutput).to.not.include('setRawMode EIO');
      done();
    });
    
    // Timeout fallback
    setTimeout(() => {
      child.kill('SIGTERM');
    }, timeout - 1000);
  });

  it('should handle Ctrl+C on empty prompt', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let _output = '';
    let sigintSent = false;
    
    child.stdout.on('data', (data) => {
      _output += data.toString();
      
      // Wait for initial prompt
      if (!sigintSent && data.toString().includes('$')) {
        sigintSent = true;
        // Send SIGINT on empty prompt
        setTimeout(() => {
          child.kill('SIGINT');
        }, 100);
      }
      
      // Check for ^C and new prompt
      if (sigintSent && data.toString().includes('^C')) {
        // Should show ^C and return to prompt
        setTimeout(() => {
          child.stdin.write('exit\n');
        }, 100);
      }
    });
    
    child.on('exit', (code) => {
      expect(code).to.be.oneOf([0, 42]);
      expect(_output).to.include('^C');
      done();
    });
  });

  it('should handle Ctrl+C with partial command input', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let _output = '';
    let commandTyped = false;
    
    child.stdout.on('data', (data) => {
      _output += data.toString();
      
      if (!commandTyped && data.toString().includes('$')) {
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
      expect(_output).to.include('^C');
      done();
    });
  });
});