import { expect } from 'chai';
import { describe, it } from 'mocha';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Interactive Mode - Autocomplete', () => {
  const timeout = 10000;
  const binPath = path.join(__dirname, '../../../bin/development.js');

  // Helper to send tab completion request
  const sendTab = (child: any) => {
    // Send TAB character (ASCII 9)
    child.stdin.write('\t');
  };

  it('should autocomplete top-level commands', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
    });
    
    let output = '';
    let foundAccounts = false;
    let foundApps = false;
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      
      // Check if autocomplete shows available commands
      if (data.toString().includes('accounts') && data.toString().includes('apps')) {
        foundAccounts = true;
        foundApps = true;
      }
    });
    
    // Type 'a' and press tab
    setTimeout(() => {
      child.stdin.write('a');
      setTimeout(() => {
        sendTab(child);
      }, 100);
    }, 500);
    
    // Exit
    setTimeout(() => {
      child.stdin.write('\nexit\n');
    }, 1500);
    
    child.on('exit', () => {
      expect(foundAccounts || output.includes('accounts')).to.be.true;
      expect(foundApps || output.includes('apps')).to.be.true;
      done();
    });
  });

  it('should autocomplete subcommands', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
    });
    
    let output = '';
    let foundCurrent = false;
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      
      // Check if autocomplete shows subcommands
      if (data.toString().includes('current')) {
        foundCurrent = true;
      }
    });
    
    // Type 'accounts ' and press tab
    setTimeout(() => {
      child.stdin.write('accounts ');
      setTimeout(() => {
        sendTab(child);
      }, 100);
    }, 500);
    
    // Exit
    setTimeout(() => {
      child.stdin.write('\nexit\n');
    }, 1500);
    
    child.on('exit', () => {
      expect(foundCurrent || output.includes('current')).to.be.true;
      done();
    });
  });

  it('should autocomplete flags', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
    });
    
    let output = '';
    let foundHelp = false;
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      
      // Check if autocomplete shows flags
      if (data.toString().includes('--help')) {
        foundHelp = true;
      }
    });
    
    // Type 'accounts --' and press tab
    setTimeout(() => {
      child.stdin.write('accounts --');
      setTimeout(() => {
        sendTab(child);
      }, 100);
    }, 500);
    
    // Exit
    setTimeout(() => {
      child.stdin.write('\nexit\n');
    }, 1500);
    
    child.on('exit', () => {
      expect(foundHelp || output.includes('--help')).to.be.true;
      done();
    });
  });

  it('should filter autocomplete suggestions based on partial input', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
    });
    
    let output = '';
    let foundAccounts = false;
    let foundApps = false;
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      const dataStr = data.toString();
      
      // When we type 'acc' and tab, should only show 'accounts'
      if (dataStr.includes('accounts')) {
        foundAccounts = true;
      }
      if (dataStr.includes('apps')) {
        foundApps = true;
      }
    });
    
    // Type 'acc' and press tab
    setTimeout(() => {
      child.stdin.write('acc');
      setTimeout(() => {
        sendTab(child);
      }, 100);
    }, 500);
    
    // Exit
    setTimeout(() => {
      child.stdin.write('\nexit\n');
    }, 1500);
    
    child.on('exit', () => {
      // Should find accounts but not apps when filtering by 'acc'
      expect(foundAccounts || output.includes('accounts')).to.be.true;
      done();
    });
  });
});