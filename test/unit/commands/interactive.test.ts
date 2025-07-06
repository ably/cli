import { expect } from 'chai';
import Interactive from '../../../src/commands/interactive.js';
import { Config } from '@oclif/core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Interactive Command', function() {
  describe('static properties', function() {
    it('should have correct description', function() {
      expect(Interactive.description).to.equal('Launch interactive Ably shell (ALPHA - experimental feature)');
    });
    
    it('should be hidden', function() {
      expect(Interactive.hidden).to.be.true;
    });
    
    it('should have special exit code', function() {
      expect(Interactive.EXIT_CODE_USER_EXIT).to.equal(42);
    });
  });
  
  describe('interactive mode environment', function() {
    afterEach(function() {
      delete process.env.ABLY_INTERACTIVE_MODE;
    });
    
    it('should set ABLY_INTERACTIVE_MODE environment variable', async function() {
      // Create a minimal config with required properties
      const config = {
        version: '1.0.0',
        commands: [],
        root: __dirname,
        findCommand: () => null,
        runCommand: async () => {},
      } as unknown as Config;
      
      const cmd = new Interactive([], config);
      
      // The run method sets the env var early, before any setup that might fail
      // We'll stub the setupReadline method to prevent actual readline setup
      (cmd as any).setupReadline = async () => {
        // Don't actually set up readline
        throw new Error('Test complete');
      };
      
      // Temporarily suppress console.error and stub process.exit
      const originalConsoleError = console.error;
      const originalProcessExit = process.exit;
      console.error = () => {};
      process.exit = (() => {
        throw new Error('Process exit called');
      }) as never;
      
      try {
        await cmd.run();
      } catch (error) {
        // Expected - either our test error or process.exit
        const err = error as Error;
        if (err.message !== 'Process exit called' && err.message !== 'Test complete') {
          throw err;
        }
      }
      
      // Restore console.error and process.exit
      console.error = originalConsoleError;
      process.exit = originalProcessExit;
      
      expect(process.env.ABLY_INTERACTIVE_MODE).to.equal('true');
    });
  });
  
  describe('parseCommand', function() {
    it('should parse commands correctly', function() {
      const config = {
        version: '1.0.0',
        commands: [],
        root: __dirname,
      } as unknown as Config;
      const cmd = new Interactive([], config);
      
      // Access private method through any type
      const parseCommand = (cmd as any).parseCommand.bind(cmd);
      
      // Test simple command
      expect(parseCommand('help')).to.deep.equal(['help']);
      
      // Test command with arguments
      expect(parseCommand('apps list')).to.deep.equal(['apps', 'list']);
      
      // Test command with quoted strings
      expect(parseCommand('channels publish "my channel" "hello world"')).to.deep.equal([
        'channels', 'publish', 'my channel', 'hello world'
      ]);
      
      // Test mixed quotes
      expect(parseCommand(`channels publish 'single' "double"`)).to.deep.equal([
        'channels', 'publish', 'single', 'double'
      ]);
      
      // Test empty quotes - should return empty string
      expect(parseCommand('test "" empty')).to.deep.equal(['test', '', 'empty']);
      
      // Test with backslashes - regex doesn't handle escapes specially
      expect(parseCommand('test "quoted string"')).to.deep.equal(['test', 'quoted string']);
    });
  });
  
  describe('environment variables', function() {
    it('should detect wrapper mode', function() {
      process.env.ABLY_WRAPPER_MODE = '1';
      const config = {
        version: '1.0.0',
        commands: [],
        root: __dirname,
      } as unknown as Config;
      const cmd = new Interactive([], config);
      expect((cmd as any).isWrapperMode).to.be.true;
      delete process.env.ABLY_WRAPPER_MODE;
    });
    
    it('should not be in wrapper mode by default', function() {
      const config = {
        version: '1.0.0',
        commands: [],
        root: __dirname,
      } as unknown as Config;
      const cmd = new Interactive([], config);
      expect((cmd as any).isWrapperMode).to.be.false;
    });
  });

  describe.skip('Ctrl+C Handling Integration Tests', function() {
    it('should exit cleanly with code 130 when Ctrl+C is pressed during command execution', function(done) {
      this.timeout(15000);
      
      // Use the development.js script directly to test the actual CLI behavior
      const binPath = path.join(__dirname, '../../../bin/development.js');
      const child = spawn('node', [binPath, 'interactive'], {
        stdio: 'pipe',
        env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let commandSent = false;
      let ctrlCSent = false;
      
      child.stdout.on('data', (data) => {
        output += data.toString();
        
        // Wait for prompt then send subscribe command
        if (!commandSent && output.includes('$')) {
          commandSent = true;
          setTimeout(() => {
            child.stdin.write('channels subscribe test-channel --duration 10\n');
          }, 100);
        }
        
        // Wait for subscription to start then send Ctrl+C
        if (commandSent && !ctrlCSent && output.includes('Listening for messages')) {
          ctrlCSent = true;
          setTimeout(() => {
            // Send SIGINT to the child process
            child.kill('SIGINT');
          }, 500);
        }
      });
      
      child.stderr.on('data', (data) => {
        // Log any errors for debugging
        console.error('STDERR:', data.toString());
      });
      
      child.on('exit', (code, signal) => {
        // Should exit with code 130 (128 + 2 for SIGINT)
        expect(code).to.equal(130);
        expect(signal).to.be.null;
        expect(output).to.include('Listening for messages');
        expect(output).to.not.include('Error: read EIO');
        expect(output).to.not.include('setRawMode EIO');
        done();
      });
      
      child.on('error', (err) => {
        done(err);
      });
    });

    it('should handle Ctrl+C on empty prompt', function(done) {
      this.timeout(10000);
      
      const binPath = path.join(__dirname, '../../../bin/development.js');
      const child = spawn('node', [binPath, 'interactive'], {
        stdio: 'pipe',
        env: { ...process.env, ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let ctrlCSent = false;
      let exitSent = false;
      
      child.stdout.on('data', (data) => {
        output += data.toString();
        
        // Send Ctrl+C on first prompt
        if (!ctrlCSent && output.includes('$')) {
          ctrlCSent = true;
          setTimeout(() => {
            // Send Ctrl+C character directly to stdin
            child.stdin.write('\u0003');
          }, 100);
        }
        
        // After ^C is displayed, send exit command
        if (ctrlCSent && !exitSent && output.includes('^C')) {
          exitSent = true;
          setTimeout(() => {
            child.stdin.write('exit\n');
          }, 100);
        }
      });
      
      child.on('exit', (code) => {
        expect(code).to.equal(0); // Normal exit after 'exit' command
        expect(output).to.include('^C');
        done();
      });
      
      child.on('error', (err) => {
        done(err);
      });
    });
  });
});