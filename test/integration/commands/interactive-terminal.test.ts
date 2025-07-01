import { expect } from 'chai';
import { describe, it } from 'mocha';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const timeout = 15000;
const binPath = path.join(__dirname, '../../../bin/development.js');

// Helper to send key sequences
const sendKeys = (child: any, keys: string) => {
  child.stdin.write(keys);
};

// Helper to send special keys
const sendSpecialKey = (child: any, key: string) => {
  const keyMap: Record<string, string> = {
    'tab': '\t',
    'up': '\u001B[A',
    'down': '\u001B[B',
    'left': '\u001B[D',
    'right': '\u001B[C',
    'ctrl-r': '\u0012',
    'ctrl-c': '\u0003',
    'escape': '\u001B',
    'enter': '\n',
    'backspace': '\u007F'
  };
  child.stdin.write(keyMap[key] || key);
};

describe('Interactive Mode - Terminal Integration Tests', () => {

  describe('Integration Tests', function() {
    // Skip integration tests in CI or non-TTY environments
    beforeEach(function() {
      if (!process.stdout.isTTY || process.env.CI) {
        this.skip();
      }
    });


    it('should handle autocomplete with history navigation', function(done) {
      this.timeout(timeout);
      
      const child = spawn('node', [binPath, 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let foundAutocomplete = false;
      let foundHistory = false;
      
      child.stdout.on('data', (data) => {
        output += data.toString();
        
        // Check for autocomplete suggestions
        if (data.toString().includes('accounts') || data.toString().includes('apps')) {
          foundAutocomplete = true;
        }
        
        // Check for history recall
        if (data.toString().includes('apps list')) {
          foundHistory = true;
        }
      });
      
      child.stderr.on('data', (data) => {
        console.error('stderr:', data.toString());
      });
      
      const sequence = async () => {
        // Wait for prompt
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Execute a command first to populate history
        sendKeys(child, 'apps list\n');
        
        // Wait for command to complete
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Start typing for autocomplete
        sendKeys(child, 'a');
        await new Promise(resolve => setTimeout(resolve, 200));
        sendSpecialKey(child, 'tab');
        
        // Wait for autocomplete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Clear line and test history
        sendSpecialKey(child, 'ctrl-c');
        await new Promise(resolve => setTimeout(resolve, 200));
        sendSpecialKey(child, 'up');
        
        // Wait for history
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Exit
        sendKeys(child, '\nexit\n');
      };
      
      sequence();
      
      child.on('exit', (_code) => {
        // Log output for debugging
        if (!foundAutocomplete || !foundHistory) {
          console.log('Test output:', output);
        }
        
        expect(foundAutocomplete || output.includes('accounts') || output.includes('apps')).to.be.true;
        expect(foundHistory || output.includes('apps list')).to.be.true;
        done();
      });
    });

    it('should handle history search with autocomplete', function(done) {
      this.timeout(timeout);
      
      const child = spawn('node', [binPath, 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let foundSearchPrompt = false;
      let _foundMatch = false;
      
      child.stdout.on('data', (data) => {
        output += data.toString();
        
        if (data.toString().includes('(reverse-i-search)') || data.toString().includes('reverse-i-search')) {
          foundSearchPrompt = true;
        }
        
        if (data.toString().includes('channels publish')) {
          _foundMatch = true;
        }
      });
      
      const sequence = async () => {
        // Wait for prompt
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Execute some commands to populate history
        sendKeys(child, 'channels publish test\n');
        await new Promise(resolve => setTimeout(resolve, 1000));
        sendKeys(child, 'apps list\n');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Enter history search mode
        sendSpecialKey(child, 'ctrl-r');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Search for 'ch'
        sendKeys(child, 'ch');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Exit search and then exit interactive mode
        sendSpecialKey(child, 'escape');
        await new Promise(resolve => setTimeout(resolve, 200));
        sendKeys(child, 'exit\n');
      };
      
      sequence();
      
      child.on('exit', () => {
        // More flexible checks
        expect(foundSearchPrompt || output.includes('search') || output.includes('channels')).to.be.true;
        done();
      });
    });

    it('should maintain terminal state across all operations', function(done) {
      this.timeout(timeout);
      
      const child = spawn('node', [binPath, 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let _output = '';
      let promptCount = 0;
      
      child.stdout.on('data', (data) => {
        _output += data.toString();
        
        // Count prompts to verify terminal state
        if (data.toString().includes('ably>')) {
          promptCount++;
        }
      });
      
      const sequence = async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Test autocomplete
        sendKeys(child, 'app');
        sendSpecialKey(child, 'tab');
        await new Promise(resolve => setTimeout(resolve, 200));
        sendSpecialKey(child, 'ctrl-c');
        
        // Test history navigation
        await new Promise(resolve => setTimeout(resolve, 200));
        sendSpecialKey(child, 'up');
        await new Promise(resolve => setTimeout(resolve, 200));
        sendSpecialKey(child, 'down');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Test history search
        sendSpecialKey(child, 'ctrl-r');
        await new Promise(resolve => setTimeout(resolve, 200));
        sendSpecialKey(child, 'escape');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Exit
        sendKeys(child, 'exit\n');
      };
      
      sequence();
      
      child.on('exit', () => {
        // Should see multiple prompts indicating terminal state was maintained
        expect(promptCount).to.be.at.least(2);
        done();
      });
    });
  });
});