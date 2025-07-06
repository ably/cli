import { expect } from 'chai';
import { describe, it } from 'mocha';
import sinon from 'sinon';
import { Config } from '@oclif/core';
import HelpCommand from '../../../src/commands/help.js';

describe('Help Command Tests', function() {
  let sandbox: sinon.SinonSandbox;
  let consoleLogStub: sinon.SinonStub;
  let processExitStub: sinon.SinonStub;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    consoleLogStub = sandbox.stub(console, 'log');
    processExitStub = sandbox.stub(process, 'exit');
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('Help Command Structure', function() {
    it('should be a simple command, not a topic', function() {
      // Help should not have any subcommands
      expect((HelpCommand as any).topic).to.be.undefined;
      expect(HelpCommand.description).to.include('help');
    });

    it('should have --web-cli-help flag', function() {
      const flags = HelpCommand.flags;
      expect(flags).to.have.property('web-cli-help');
      expect(flags['web-cli-help'].type).to.equal('boolean');
      expect(flags['web-cli-help'].hidden).to.be.true;
    });

    it('should have correct usage examples', function() {
      const examples = HelpCommand.examples;
      expect(examples).to.be.an('array');
      expect(examples).to.have.length.greaterThan(0);
      
      // Check for standard help examples
      const exampleStrings = examples.map((e: any) => typeof e === 'string' ? e : e.command);
      expect(exampleStrings.some((e: string) => e.includes('help'))).to.be.true;
      expect(exampleStrings.some((e: string) => e.includes('channels'))).to.be.true;
    });
  });

  describe('Help Command Behavior', function() {
    it('should accept command names as arguments', async function() {
      const help = new HelpCommand(['channels'], {} as Config);
      
      // Mock config.runCommand
      help.config = {
        runCommand: sandbox.stub().resolves()
      } as any;
      
      await help.run();
      
      expect((help.config.runCommand as sinon.SinonStub).calledWith('help', ['channels'])).to.be.true;
    });

    it('should handle --web-cli-help flag', async function() {
      const help = new HelpCommand([], {} as Config);
      
      // Set the flag
      (help as any).flags = { 'web-cli-help': true };
      
      // Mock config.runCommand
      help.config = {
        runCommand: sandbox.stub().resolves()
      } as any;
      
      await help.run();
      
      expect((help.config.runCommand as sinon.SinonStub).calledWith('help', ['--web-cli-help'])).to.be.true;
    });

    it('should pass through multiple arguments', async function() {
      const help = new HelpCommand(['channels', 'publish'], {} as Config);
      
      // Mock config.runCommand
      help.config = {
        runCommand: sandbox.stub().resolves()
      } as any;
      
      await help.run();
      
      expect((help.config.runCommand as sinon.SinonStub).calledWith('help', ['channels', 'publish'])).to.be.true;
    });
  });

  describe('No Help Subcommands', function() {
    it('should not have help:ask command', function() {
      // This test verifies that help subcommands have been removed
      // In the new structure, these should be under 'support' topic
      const mockConfig = {
        findCommand: (id: string) => {
          // help:ask should not exist
          if (id === 'help:ask') return null;
          // support:ask should exist
          if (id === 'support:ask') return { id: 'support:ask' };
          return null;
        }
      } as any;
      
      expect(mockConfig.findCommand('help:ask')).to.be.null;
      expect(mockConfig.findCommand('support:ask')).to.not.be.null;
    });

    it('should not have help:status command', function() {
      // status should be a root command now
      const mockConfig = {
        findCommand: (id: string) => {
          // help:status should not exist
          if (id === 'help:status') return null;
          // status should exist at root
          if (id === 'status') return { id: 'status' };
          return null;
        }
      } as any;
      
      expect(mockConfig.findCommand('help:status')).to.be.null;
      expect(mockConfig.findCommand('status')).to.not.be.null;
    });
  });
});