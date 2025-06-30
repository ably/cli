import { expect } from 'chai';
import { describe, it } from 'mocha';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Accounts Command - Unknown Flag Handling', () => {
  const timeout = 10000;

  it('should show subcommands when using unknown flag in interactive mode', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [path.join(__dirname, '../../../bin/development.js'), 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Send accounts with unknown flag
    setTimeout(() => {
      child.stdin.write('accounts --non-existing-flag\n');
    }, 500);
    
    // Exit
    setTimeout(() => {
      child.stdin.write('exit\n');
    }, 1500);
    
    child.on('exit', () => {
      const fullOutput = output + errorOutput;
      
      // Should show accounts command help with subcommands
      expect(fullOutput).to.include('Ably accounts management commands:');
      expect(fullOutput).to.include('accounts current');
      expect(fullOutput).to.include('accounts list');
      expect(fullOutput).to.include('accounts login');
      expect(fullOutput).to.include('Show the current Ably account');
      
      // Should not show error about unknown flag
      expect(fullOutput).to.not.include('Nonexistent flag');
      expect(fullOutput).to.not.include('Unknown flag');
      
      done();
    });
  });

  it('should show same output in interactive and non-interactive modes', function(done) {
    this.timeout(timeout);
    
    // First, run non-interactive command
    const nonInteractive = spawn('node', [
      path.join(__dirname, '../../../bin/development.js'),
      'accounts', '--non-existing-flag'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let nonInteractiveOutput = '';
    
    nonInteractive.stdout.on('data', (data) => {
      nonInteractiveOutput += data.toString();
    });
    
    nonInteractive.stderr.on('data', (data) => {
      nonInteractiveOutput += data.toString();
    });
    
    nonInteractive.on('exit', () => {
      // Now run interactive command
      const interactive = spawn('node', [
        path.join(__dirname, '../../../bin/development.js'),
        'interactive'
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let interactiveOutput = '';
      
      interactive.stdout.on('data', (data) => {
        interactiveOutput += data.toString();
      });
      
      interactive.stderr.on('data', (data) => {
        interactiveOutput += data.toString();
      });
      
      setTimeout(() => {
        interactive.stdin.write('accounts --non-existing-flag\n');
      }, 500);
      
      setTimeout(() => {
        interactive.stdin.write('exit\n');
      }, 1500);
      
      interactive.on('exit', () => {
        // Both should show the accounts management commands
        expect(nonInteractiveOutput).to.include('Ably accounts management commands:');
        expect(interactiveOutput).to.include('Ably accounts management commands:');
        
        // Both should list the same subcommands
        expect(nonInteractiveOutput).to.include('accounts current');
        expect(interactiveOutput).to.include('accounts current');
        
        expect(nonInteractiveOutput).to.include('accounts list');
        expect(interactiveOutput).to.include('accounts list');
        
        done();
      });
    });
  });
});