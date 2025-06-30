import { expect } from 'chai';
import sinon from 'sinon';
import { Config } from '@oclif/core';
import hook from '../../../src/hooks/command_not_found/did-you-mean.js';
import inquirer from 'inquirer';
import chalk from 'chalk';

describe('Did You Mean Hook - Interactive Mode', () => {
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
  
  beforeEach(() => {
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
  
  afterEach(() => {
    sandbox.restore();
    process.env = originalEnv;
  });
  
  describe('command not found handling', () => {
    it('should use console.error instead of this.warn in interactive mode', async () => {
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
      
      // Should use console.error, not this.warn
      expect(warnStub.called).to.be.false;
      expect(consoleErrorStub.called).to.be.true;
      expect(consoleErrorStub.firstCall.args[0]).to.include('channels pubish is not an ably command');
    });
    
    it('should not skip confirmation prompt in interactive mode', async () => {
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
      (global as any).__ablyInteractiveReadline = mockReadline;
      
      await hook.call(context, {
        id: 'channels:pubish',
        argv: [],
        config,
        context
      });
      
      // Should show confirmation prompt
      expect(inquirerStub.called).to.be.true;
      expect(inquirerStub.firstCall.args[0][0].message).to.include('Did you mean channels publish?');
      
      // Should pause and resume readline
      expect(mockReadline.pause.called).to.be.true;
      expect(mockReadline.resume.called).to.be.true;
      
      // Clean up
      delete (global as any).__ablyInteractiveReadline;
    });
    
    it('should throw error instead of calling this.error when command fails', async () => {
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
      (global as any).__ablyInteractiveReadline = mockReadline;
      
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
      
      // Should throw error, not call this.error
      expect(thrownError).to.exist;
      expect(thrownError?.message).to.include('Missing required arg: channel');
      expect(errorStub.called).to.be.false;
      
      // Clean up
      delete (global as any).__ablyInteractiveReadline;
    });
    
    it('should use console.log for help output in interactive mode', async () => {
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
      (global as any).__ablyInteractiveReadline = mockReadline;
      
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
      delete (global as any).__ablyInteractiveReadline;
    });
    
    it('should provide interactive-friendly error for unknown commands', async () => {
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
  
  describe('normal mode comparison', () => {
    it('should use normal error handling when not in interactive mode', async () => {
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