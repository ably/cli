import { expect } from 'chai';
import { describe, it } from 'mocha';
import { exec, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Help Output Consistency', () => {
  const timeout = 10000;
  let binPath: string;
  
  before(() => {
    binPath = path.join(__dirname, '../../../bin/development.js');
  });

  describe('Topic Command Help (e.g., accounts --help)', () => {
    it('should show COMMANDS section in non-interactive mode', async function() {
      this.timeout(timeout);
      
      const { stdout } = await execAsync(`node ${binPath} accounts --help`);
      
      // Check for COMMANDS section
      expect(stdout).to.include('COMMANDS');
      
      // Check for proper formatting with spaces (not colons)
      expect(stdout).to.include('ably accounts current');
      expect(stdout).to.include('ably accounts list');
      expect(stdout).to.include('ably accounts login');
      
      // Should NOT have colons
      expect(stdout).to.not.include('accounts:current');
      expect(stdout).to.not.include('accounts:list');
      expect(stdout).to.not.include('accounts:login');
    });

    it('should show COMMANDS section in interactive mode', function(done) {
      this.timeout(timeout);
      
      const child = spawn('node', [binPath, 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      setTimeout(() => {
        child.stdin.write('accounts --help\n');
      }, 500);
      
      setTimeout(() => {
        child.stdin.write('exit\n');
      }, 1500);
      
      child.on('exit', () => {
        // Check for COMMANDS section
        expect(output).to.include('COMMANDS');
        
        // Check for proper formatting with spaces (not colons)
        expect(output).to.include('accounts current');
        expect(output).to.include('accounts list');
        expect(output).to.include('accounts login');
        
        // Should NOT have colons
        expect(output).to.not.include('accounts:current');
        expect(output).to.not.include('accounts:list');
        expect(output).to.not.include('accounts:login');
        
        // Should NOT have ably prefix in interactive mode
        expect(output).to.not.match(/COMMANDS[\s\S]*ably accounts current/);
        
        done();
      });
    });

    it('should have same sections in both modes', async function() {
      this.timeout(timeout);
      
      // Get non-interactive output
      const { stdout: nonInteractive } = await execAsync(`node ${binPath} accounts --help`);
      
      // Get interactive output
      const interactiveOutput = await new Promise<string>((resolve) => {
        const child = spawn('node', [binPath, 'interactive'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
        });
        
        let output = '';
        
        child.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        setTimeout(() => {
          child.stdin.write('accounts --help\n');
        }, 500);
        
        setTimeout(() => {
          child.stdin.write('exit\n');
        }, 1500);
        
        child.on('exit', () => {
          resolve(output);
        });
      });
      
      // Both should have these sections
      const sections = ['USAGE', 'DESCRIPTION', 'EXAMPLES', 'COMMANDS'];
      
      sections.forEach(section => {
        expect(nonInteractive).to.include(section);
        expect(interactiveOutput).to.include(section);
      });
      
      // Both should list the same commands (ignoring the ably prefix)
      const commands = ['current', 'list', 'login', 'logout', 'stats', 'switch'];
      
      commands.forEach(cmd => {
        expect(nonInteractive).to.include(`accounts ${cmd}`);
        expect(interactiveOutput).to.include(`accounts ${cmd}`);
      });
    });
  });

  describe('Help Command Suggestions', () => {
    it('should suggest "help ask" when typing "help aska"', function(done) {
      this.timeout(timeout);
      
      const child = spawn('node', [binPath, 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let foundSuggestion = false;
      
      child.stdout.on('data', (data) => {
        output += data.toString();
        if (data.toString().includes('Did you mean help ask?')) {
          foundSuggestion = true;
          setTimeout(() => {
            child.stdin.write('n\n');
          }, 100);
        }
      });
      
      setTimeout(() => {
        child.stdin.write('help aska\n');
      }, 500);
      
      setTimeout(() => {
        child.stdin.write('exit\n');
      }, 2000);
      
      child.on('exit', () => {
        expect(foundSuggestion).to.be.true;
        expect(output).to.include('help aska is not an ably command');
        done();
      });
    });
  });

  describe('Multiple Topic Commands', () => {
    it('should show consistent help for different topic commands', async function() {
      this.timeout(timeout);
      
      // Test multiple topic commands
      const topicCommands = ['accounts', 'apps', 'channels'];
      
      for (const topic of topicCommands) {
        const { stdout } = await execAsync(`node ${binPath} ${topic} --help`);
        
        // Should have standard sections
        expect(stdout).to.include('USAGE');
        expect(stdout).to.include('DESCRIPTION');
        expect(stdout).to.include('EXAMPLES');
        
        // Should have COMMANDS section if it has subcommands
        if (topic === 'accounts' || topic === 'apps' || topic === 'channels') {
          expect(stdout).to.include('COMMANDS');
          // Commands should use spaces, not colons
          expect(stdout).to.not.match(new RegExp(`${topic}:[a-z]+`));
        }
      }
    });
  });
});