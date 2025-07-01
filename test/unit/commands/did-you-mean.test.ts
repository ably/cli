import { expect } from 'chai';
import { describe, it } from 'mocha';
import { spawn, exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Did You Mean Functionality', () => {
  const timeout = 15000;
  let binPath: string;
  
  before(function() {
    binPath = path.join(__dirname, '../../../bin/development.js');
  });

  describe('Top-Level Command Suggestions', () => {
    describe('Interactive Mode', () => {
      it('should show Y/N prompt for misspelled commands', function(done) {
        this.timeout(timeout);
        
        const child = spawn('node', [binPath, 'interactive'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
        });
        
        let output = '';
        let foundPrompt = false;
        
        child.stdout.on('data', (data) => {
          output += data.toString();
          if (data.toString().includes('(Y/n)') || data.toString().includes('Did you mean accounts current?')) {
            foundPrompt = true;
            setTimeout(() => {
              child.stdin.write('n\n');
            }, 100);
          }
        });
        
        setTimeout(() => {
          child.stdin.write('account current\n');
        }, 500);
        
        setTimeout(() => {
          child.stdin.write('exit\n');
        }, 2000);
        
        child.on('exit', () => {
          expect(foundPrompt).to.be.true;
          expect(output).to.include('account current is not an ably command');
          done();
        });
      });
    });

    describe('Non-Interactive Mode', () => {
      it('should show Y/N prompt for misspelled commands', async function() {
        this.timeout(timeout);
        
        try {
          await execAsync(`node ${binPath} account current`, { timeout: 2000 });
          expect.fail('Should have timed out');
        } catch (error: any) {
          const fullOutput = (error.stdout || '') + (error.stderr || '');
          expect(fullOutput).to.include('Did you mean accounts current?');
          expect(fullOutput).to.include('(Y/n)');
        }
      });

      it('should auto-execute with SKIP_CONFIRMATION=1', async function() {
        this.timeout(timeout);
        
        try {
          const { stdout, stderr } = await execAsync(
            `SKIP_CONFIRMATION=1 ABLY_ACCESS_TOKEN=test node ${binPath} account current`,
            { 
              timeout: 5000,
              env: { ...process.env, SKIP_CONFIRMATION: '1', ABLY_ACCESS_TOKEN: 'test' }
            }
          );
          
          const fullOutput = stdout + stderr;
          expect(fullOutput).to.include('account current is not an ably command');
        } catch (error: any) {
          const fullOutput = (error.stdout || '') + (error.stderr || '');
          expect(fullOutput).to.include('account current is not an ably command');
        }
      });
    });
  });

  describe('Second-Level Command Suggestions', () => {
    describe('Interactive Mode', () => {
      it('should show Y/N prompt for "accounts curren"', function(done) {
        this.timeout(timeout);
        
        const child = spawn('node', [binPath, 'interactive'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
        });
        
        let output = '';
        let errorOutput = '';
        let foundPrompt = false;
        
        child.stdout.on('data', (data) => {
          output += data.toString();
          if (data.toString().includes('Did you mean accounts current?') || data.toString().includes('(Y/n)')) {
            foundPrompt = true;
            setTimeout(() => {
              child.stdin.write('n\n');
            }, 100);
          }
        });
        
        child.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        setTimeout(() => {
          child.stdin.write('accounts curren\n');
        }, 500);
        
        setTimeout(() => {
          child.stdin.write('exit\n');
        }, 2000);
        
        child.on('exit', () => {
          const fullOutput = output + errorOutput;
          expect(foundPrompt).to.be.true;
          expect(fullOutput).to.include('accounts curren is not an ably command');
          done();
        });
      });

      it('should execute command when confirmed with Y', function(done) {
        this.timeout(timeout);
        
        const child = spawn('node', [binPath, 'interactive'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
        });
        
        let _output = '';
        let foundPrompt = false;
        let executedCommand = false;
        
        child.stdout.on('data', (data) => {
          _output += data.toString();
          
          if (data.toString().includes('Did you mean accounts current?') || data.toString().includes('(Y/n)')) {
            foundPrompt = true;
            setTimeout(() => {
              child.stdin.write('y\n');
            }, 100);
          }
          
          if (data.toString().includes('Account:') || 
              data.toString().includes('Show the current Ably account') ||
              data.toString().includes('No access token provided')) {
            executedCommand = true;
          }
        });
        
        setTimeout(() => {
          child.stdin.write('accounts curren\n');
        }, 500);
        
        setTimeout(() => {
          child.stdin.write('exit\n');
        }, 3000);
        
        child.on('exit', () => {
          expect(foundPrompt).to.be.true;
          expect(executedCommand).to.be.true;
          done();
        });
      });
    });

    describe('Non-Interactive Mode', () => {
      it('should show Y/N prompt for "accounts curren"', async function() {
        this.timeout(timeout);
        
        try {
          await execAsync(`node ${binPath} accounts curren`, { timeout: 2000 });
          expect.fail('Should have timed out');
        } catch (error: any) {
          const fullOutput = (error.stdout || '') + (error.stderr || '');
          expect(fullOutput).to.include('Did you mean accounts current?');
          expect(fullOutput).to.include('(Y/n)');
        }
      });
    });
  });

  describe('Command List Display', () => {
    it('should show available commands after declining suggestion', function(done) {
      this.timeout(timeout);
      
      const child = spawn('node', [binPath, 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let foundPrompt = false;
      let foundCommandsList = false;
      
      child.stdout.on('data', (data) => {
        output += data.toString();
        
        if (data.toString().includes('Did you mean accounts current?')) {
          foundPrompt = true;
          setTimeout(() => {
            child.stdin.write('n\n');
          }, 100);
        }
        
        if (data.toString().includes('accounts current') && 
            data.toString().includes('Show the current Ably account')) {
          foundCommandsList = true;
        }
      });
      
      setTimeout(() => {
        child.stdin.write('accounts curren\n');
      }, 500);
      
      setTimeout(() => {
        child.stdin.write('exit\n');
      }, 2500);
      
      child.on('exit', () => {
        expect(foundPrompt).to.be.true;
        expect(foundCommandsList).to.be.true;
        expect(output).to.include('Ably accounts management commands:');
        done();
      });
    });

    it('should show commands when no suggestion found', function(done) {
      this.timeout(timeout);
      
      const child = spawn('node', [binPath, 'interactive'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1' }
      });
      
      let output = '';
      let errorOutput = '';
      let foundCommandsList = false;
      
      child.stdout.on('data', (data) => {
        output += data.toString();
        if (data.toString().includes('accounts current') && 
            data.toString().includes('Show the current Ably account')) {
          foundCommandsList = true;
        }
      });
      
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      setTimeout(() => {
        child.stdin.write('accounts xyz\n');
      }, 500);
      
      setTimeout(() => {
        child.stdin.write('exit\n');
      }, 1500);
      
      child.on('exit', () => {
        const fullOutput = output + errorOutput;
        expect(foundCommandsList).to.be.true;
        expect(fullOutput).to.include('Command accounts xyz not found');
        expect(fullOutput).to.include('Ably accounts management commands:');
        expect(fullOutput).to.not.include('(Y/n)');
        done();
      });
    });
  });

  describe('Consistent Behavior', () => {
    it('should behave consistently between top-level and second-level commands', async function() {
      this.timeout(timeout);
      
      // Both should timeout waiting for Y/N prompt
      try {
        await execAsync(`node ${binPath} account current`, { timeout: 2000 });
        expect.fail('Top-level should have timed out');
      } catch (error: any) {
        expect(error.stdout + error.stderr).to.include('(Y/n)');
      }
      
      try {
        await execAsync(`node ${binPath} accounts curren`, { timeout: 2000 });
        expect.fail('Second-level should have timed out');
      } catch (error: any) {
        expect(error.stdout + error.stderr).to.include('(Y/n)');
      }
    });
  });
});