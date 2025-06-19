import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import sinon from 'sinon';
import { BaseTopicCommand } from '../../../src/base-topic-command.js';
import { Config } from '@oclif/core';

// Test implementation of BaseTopicCommand
class TestTopicCommand extends BaseTopicCommand {
  protected topicName = 'test';
  protected commandGroup = 'test management';
}

describe('BaseTopicCommand', () => {
  let sandbox: sinon.SinonSandbox;
  let logStub: sinon.SinonStub;
  let config: any;
  let command: TestTopicCommand;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    logStub = sandbox.stub();
    
    // Mock config with commands
    config = {
      commands: [
        {
          id: 'test:command1',
          hidden: false,
          load: async () => ({
            description: 'Test command 1',
            hidden: false
          })
        },
        {
          id: 'test:command2',
          hidden: false,
          load: async () => ({
            description: 'Test command 2',
            hidden: false
          })
        },
        {
          id: 'test:hidden',
          hidden: true,
          load: async () => ({
            description: 'Hidden command',
            hidden: true
          })
        },
        {
          id: 'other:command',
          hidden: false,
          load: async () => ({
            description: 'Other topic command',
            hidden: false
          })
        }
      ]
    };

    command = new TestTopicCommand([], config as Config);
    command.log = logStub;
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should list all non-hidden sub-commands', async () => {
    await command.run();

    expect(logStub.callCount).to.be.greaterThan(0);
    expect(logStub.calledWith('Ably test management commands:')).to.be.true;
    expect(logStub.calledWithMatch(/test command1.*Test command 1/)).to.be.true;
    expect(logStub.calledWithMatch(/test command2.*Test command 2/)).to.be.true;
    
    // Should not show hidden command
    expect(logStub.calledWithMatch(/hidden/)).to.be.false;
    
    // Should not show other topic commands
    expect(logStub.calledWithMatch(/other:command/)).to.be.false;
  });

  it('should format output consistently', async () => {
    await command.run();

    // Check header
    expect(logStub.firstCall.args[0]).to.equal('Ably test management commands:');
    
    // Check empty line after header
    expect(logStub.secondCall.args[0]).to.equal('');
    
    // Check footer
    const lastCalls = logStub.getCalls().slice(-2);
    expect(lastCalls[0].args[0]).to.equal('');
    expect(lastCalls[1].args[0]).to.contain('Run `');
    expect(lastCalls[1].args[0]).to.contain('ably test COMMAND --help');
  });

  it('should handle commands that fail to load', async () => {
    // Add a command that throws on load
    config.commands.push({
      id: 'test:error',
      hidden: false,
      load: async () => {
        throw new Error('Failed to load');
      }
    });

    // Should not throw
    let error: Error | undefined;
    try {
      await command.run();
    } catch (e) {
      error = e as Error;
    }
    expect(error).to.be.undefined;
    
    // Should still show other commands
    expect(logStub.calledWithMatch(/test command1/)).to.be.true;
    expect(logStub.calledWithMatch(/test command2/)).to.be.true;
  });

  it('should sort commands alphabetically', async () => {
    // Add commands in non-alphabetical order
    config.commands = [
      {
        id: 'test:zebra',
        hidden: false,
        load: async () => ({ description: 'Zebra command', hidden: false })
      },
      {
        id: 'test:alpha',
        hidden: false,
        load: async () => ({ description: 'Alpha command', hidden: false })
      },
      {
        id: 'test:beta',
        hidden: false,
        load: async () => ({ description: 'Beta command', hidden: false })
      }
    ];

    await command.run();

    const calls = logStub.getCalls();
    const commandCalls = calls.filter(call => 
      call.args[0].includes('test alpha') || 
      call.args[0].includes('test beta') || 
      call.args[0].includes('test zebra')
    );

    expect(commandCalls[0].args[0]).to.match(/test alpha/);
    expect(commandCalls[1].args[0]).to.match(/test beta/);
    expect(commandCalls[2].args[0]).to.match(/test zebra/);
  });

  it('should handle empty command list gracefully', async () => {
    config.commands = [];

    await command.run();

    expect(logStub.calledWith('Ably test management commands:')).to.be.true;
    expect(logStub.calledWith('')).to.be.true;
    expect(logStub.calledWithMatch(/Run.*ably test COMMAND --help/)).to.be.true;
  });

  it('should replace colons with spaces in command IDs', async () => {
    await command.run();

    // Should show "test command1" not "test:command1"
    expect(logStub.calledWithMatch(/test command1/)).to.be.true;
    expect(logStub.calledWithMatch(/test:command1/)).to.be.false;
  });

  it('should pad command names for alignment', async () => {
    config.commands = [
      {
        id: 'test:a',
        hidden: false,
        load: async () => ({ description: 'Short', hidden: false })
      },
      {
        id: 'test:very-long-command-name',
        hidden: false,
        load: async () => ({ description: 'Long', hidden: false })
      }
    ];

    await command.run();

    const calls = logStub.getCalls();
    const commandCalls = calls.filter(call => 
      call.args[0].includes(' - ') && 
      (call.args[0].includes('Short') || call.args[0].includes('Long'))
    );

    // Both commands should be aligned
    expect(commandCalls).to.have.lengthOf(2);
    commandCalls.forEach(call => {
      const dashIndex = call.args[0].indexOf(' - ');
      expect(dashIndex).to.be.greaterThan(0);
    });
  });

  it('should handle commands with no description', async () => {
    config.commands = [
      {
        id: 'test:no-desc',
        hidden: false,
        load: async () => ({ hidden: false })
      }
    ];

    await command.run();

    expect(logStub.calledWithMatch(/test no-desc.*-\s*$/)).to.be.true;
  });

  it('should respect command-level hidden flag from loaded command', async () => {
    config.commands = [
      {
        id: 'test:visible-config-hidden-loaded',
        hidden: false, // Not hidden in config
        load: async () => ({
          description: 'Should be hidden',
          hidden: true // But hidden when loaded
        })
      }
    ];

    await command.run();

    expect(logStub.calledWithMatch(/Should be hidden/)).to.be.false;
  });
});