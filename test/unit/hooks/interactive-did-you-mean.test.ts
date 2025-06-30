import { expect } from 'chai';
import sinon from 'sinon';
import { Config } from '@oclif/core';
import hook from '../../../src/hooks/command_not_found/did-you-mean.js';
import inquirer from 'inquirer';
import chalk from 'chalk';

describe('Did You Mean Hook - Interactive Mode', function() {
  let sandbox: sinon.SinonSandbox;
  let config: any;
  let warnStub: sinon.SinonStub;
  let errorStub: sinon.SinonStub;
  let logStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;
  let consoleLogStub: sinon.SinonStub;
  let inquirerStub: sinon.SinonStub;
  let runCommandStub: sinon.SinonStub;
  let originalEnv: NodeJS.ProcessEnv;
  
  beforeEach(function() {
    sandbox = sinon.createSandbox();
    originalEnv = { ...process.env };
    
    // Set interactive mode
    process.env.ABLY_INTERACTIVE_MODE = 'true';
    
    // Create stubs
    warnStub = sandbox.stub();
    errorStub = sandbox.stub();
    logStub = sandbox.stub();
    consoleErrorStub = sandbox.stub(console, 'error');
    consoleLogStub = sandbox.stub(console, 'log');
    runCommandStub = sandbox.stub();
    
    // Mock config
    config = {
      bin: 'ably',
      commandIDs: ['channels:publish', 'channels:subscribe', 'apps:list'],
      runCommand: runCommandStub,
      findCommand: (id: string) => ({
        id,
        load: async () => ({
          id,
          description: `Command ${id}`,
          usage: id,
          args: {
            channel: { description: 'Channel name' }
          }
        })
      })
    };
    
    // Mock inquirer to auto-confirm
    inquirerStub = sandbox.stub(inquirer, 'prompt').resolves({ confirmed: true });
  });
  
  afterEach(function() {
    sandbox.restore();
    process.env = originalEnv;
  });
  
  describe('command not found handling', function() {
    it('should use console.log instead of this.warn in interactive mode', async function() {
      const context = {
        config,
        warn: warnStub,
        error: errorStub,
        log: logStub,
        exit: sandbox.stub(),
        debug: sandbox.stub()
      };
      
      await hook.call(context, {
        id: 'channels:pubish',
        argv: [],
        config,
        context
      });
      
      // Should use console.log, not this.warn
      expect(warnStub.called).to.be.false;
      expect(consoleLogStub.called).to.be.true;
      
      // Find the warning message in console.log calls
      const warningCall = consoleLogStub.getCalls().find(call => 
        call.args[0].includes('channels pubish is not an ably command')
      );
      expect(warningCall).to.exist;
    });
    
    it('should not skip confirmation prompt in interactive mode', async function() {
      const context = {
        config,
        warn: warnStub,
        error: errorStub,
        log: logStub,
        exit: sandbox.stub(),
        debug: sandbox.stub()
      };
      
      // Mock the global readline instance
      const mockReadline = {
        pause: sandbox.stub(),
        resume: sandbox.stub(),
        prompt: sandbox.stub(),
        listeners: sandbox.stub().returns([]),
        removeAllListeners: sandbox.stub(),
        on: sandbox.stub()
      };
      (globalThis as any).__ablyInteractiveReadline = mockReadline;
      
      await hook.call(context, {
        id: 'channels:pubish',
        argv: [],
        config,
        context
      });
      
      // Should show confirmation prompt
      expect(inquirerStub.called).to.be.true;
      expect(inquirerStub.firstCall.args[0][0].message).to.include('Did you mean channels publish?');
      
      // Should pause readline (resume happens asynchronously)
      expect(mockReadline.pause.called).to.be.true;
      
      // Clean up
      delete (globalThis as any).__ablyInteractiveReadline;
    });
    
    it('should throw error instead of calling this.error when command fails', async function() {
      const context = {
        config,
        warn: warnStub,
        error: errorStub,
        log: logStub,
        exit: sandbox.stub(),
        debug: sandbox.stub()
      };
      
      // Mock the global readline instance
      const mockReadline = {
        pause: sandbox.stub(),
        resume: sandbox.stub(),
        prompt: sandbox.stub(),
        listeners: sandbox.stub().returns([]),
        removeAllListeners: sandbox.stub(),
        on: sandbox.stub()
      };
      (globalThis as any).__ablyInteractiveReadline = mockReadline;
      
      // Make runCommand fail
      runCommandStub.throws(new Error('Missing required arg: channel'));
      
      let thrownError: Error | undefined;
      try {
        await hook.call(context, {
          id: 'channels:pubish',
          argv: [],
          config,
          context
        });
      } catch (error) {
        thrownError = error as Error;
      }
      
      // Should throw error with oclif exit code
      expect(thrownError).to.exist;
      expect(thrownError?.message).to.include('Missing required arg: channel');
      expect((thrownError as any)?.oclif?.exit).to.exist;
      expect(errorStub.called).to.be.false;
      
      // Clean up
      delete (globalThis as any).__ablyInteractiveReadline;
    });
    
    it('should use console.log for help output in interactive mode', async function() {
      const context = {
        config,
        warn: warnStub,
        error: errorStub,
        log: logStub,
        exit: sandbox.stub(),
        debug: sandbox.stub()
      };
      
      // Mock the global readline instance
      const mockReadline = {
        pause: sandbox.stub(),
        resume: sandbox.stub(),
        prompt: sandbox.stub(),
        listeners: sandbox.stub().returns([]),
        removeAllListeners: sandbox.stub(),
        on: sandbox.stub()
      };
      (globalThis as any).__ablyInteractiveReadline = mockReadline;
      
      // Make runCommand fail with missing args
      const error = new Error('Missing required arg: channel\nSee more help with --help');
      runCommandStub.throws(error);
      
      try {
        await hook.call(context, {
          id: 'channels:pubish',
          argv: [],
          config,
          context
        });
      } catch {
        // Expected to throw
      }
      
      // Should use console.log for help, not this.log
      expect(logStub.called).to.be.false;
      expect(consoleLogStub.called).to.be.true;
      
      // Check help output doesn't include 'ably' prefix
      const helpOutput = consoleLogStub.getCalls().map(call => call.args[0]).join('\n');
      expect(helpOutput).to.include('USAGE');
      expect(helpOutput).to.include('$ channels publish'); // Space separated format
      expect(helpOutput).to.not.include('$ ably channels');
      expect(helpOutput).to.include('See more help with:');
      expect(helpOutput).to.include('channels publish --help');
      expect(helpOutput).to.not.include('ably channels publish --help');
      
      // Clean up
      delete (globalThis as any).__ablyInteractiveReadline;
    });
    
    it('should provide interactive-friendly error for unknown commands', async function() {
      const context = {
        config,
        warn: warnStub,
        error: errorStub,
        log: logStub,
        exit: sandbox.stub(),
        debug: sandbox.stub()
      };
      
      let thrownError: Error | undefined;
      try {
        await hook.call(context, {
          id: 'unknown:command',
          argv: [],
          config,
          context
        });
      } catch (error) {
        thrownError = error as Error;
      }
      
      // Should throw with interactive-friendly message
      expect(thrownError).to.exist;
      expect(thrownError?.message).to.include("Command unknown command not found. Run 'help' for a list of available commands.");
      expect(thrownError?.message).to.not.include('ably --help');
      expect(errorStub.called).to.be.false;
    });
  });
  
  describe('readline restoration', function() {
    it('should properly restore readline state after inquirer prompt', async function() {
      const context = {
        config,
        warn: warnStub,
        error: errorStub,
        log: logStub,
        exit: sandbox.stub(),
        debug: sandbox.stub()
      };
      
      // Mock the global readline instance with more detailed state tracking
      const lineListeners = [sandbox.stub(), sandbox.stub()];
      const mockReadline = {
        pause: sandbox.stub(),
        resume: sandbox.stub(),
        prompt: sandbox.stub(),
        listeners: sandbox.stub().returns(lineListeners),
        removeAllListeners: sandbox.stub(),
        on: sandbox.stub(),
        _refreshLine: sandbox.stub()
      };
      (globalThis as any).__ablyInteractiveReadline = mockReadline;
      
      // Mock process.stdin for terminal state
      const originalIsRaw = process.stdin.isRaw;
      const originalIsTTY = process.stdin.isTTY;
      const originalSetRawMode = process.stdin.setRawMode;
      
      process.stdin.isRaw = false;
      process.stdin.isTTY = true;
      process.stdin.setRawMode = sandbox.stub().returns(process.stdin);
      
      try {
        await hook.call(context, {
          id: 'channels:pubish',
          argv: [],
          config,
          context
        });
        
        // Wait for async restoration
        await new Promise(resolve => setTimeout(resolve, 30));
        
        // Verify readline was paused during prompt
        expect(mockReadline.pause.called).to.be.true;
        
        // Verify line listeners were temporarily removed and restored
        expect(mockReadline.removeAllListeners.calledWith('line')).to.be.true;
        expect(mockReadline.on.callCount).to.equal(lineListeners.length);
        lineListeners.forEach((listener, index) => {
          expect(mockReadline.on.getCall(index).args).to.deep.equal(['line', listener]);
        });
        
        // Verify readline was resumed
        expect(mockReadline.resume.called).to.be.true;
        
        // Verify terminal state was restored
        expect((process.stdin.setRawMode as sinon.SinonStub).calledWith(false)).to.be.true;
      } finally {
        // Clean up
        delete (globalThis as any).__ablyInteractiveReadline;
        process.stdin.isRaw = originalIsRaw;
        process.stdin.isTTY = originalIsTTY;
        process.stdin.setRawMode = originalSetRawMode;
      }
    });
  });
  
  describe('normal mode comparison', function() {
    it('should use normal error handling when not in interactive mode', async function() {
      // Disable interactive mode
      delete process.env.ABLY_INTERACTIVE_MODE;
      
      const context = {
        config,
        warn: warnStub,
        error: errorStub,
        log: logStub,
        exit: sandbox.stub(),
        debug: sandbox.stub()
      };
      
      await hook.call(context, {
        id: 'channels:pubish',
        argv: [],
        config,
        context
      });
      
      // Should use this.warn in normal mode
      expect(warnStub.called).to.be.true;
      expect(warnStub.firstCall.args[0]).to.include('channels pubish is not an ably command');
      
      // Console.error should only be called by the stubs, not directly
      expect(consoleErrorStub.callCount).to.equal(0);
    });
  });
});