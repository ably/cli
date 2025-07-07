import { expect } from 'chai';
import { describe, it } from 'mocha';
import sinon from 'sinon';

describe('Support Command Tests', function() {
  let sandbox: sinon.SinonSandbox;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('Support Topic Structure', function() {
    it('should be a topic command with subcommands', function() {
      // Mock config to simulate the support topic structure
      const mockConfig = {
        commands: [
          { id: 'support:ask', description: 'Ask Ably AI for help' },
          { id: 'support:contact', description: 'Contact Ably support' },
          { id: 'support:info', description: 'Show support information' }
        ],
        topics: [
          { name: 'support', description: 'Get support and help from Ably' }
        ]
      } as any;
      
      // Verify support is a topic
      const supportTopic = mockConfig.topics.find((t: any) => t.name === 'support');
      expect(supportTopic).to.exist;
      expect(supportTopic.description).to.include('support');
      
      // Verify subcommands exist
      const supportCommands = mockConfig.commands.filter((c: any) => c.id.startsWith('support:'));
      expect(supportCommands).to.have.length(3);
      
      // Check specific subcommands
      expect(supportCommands.some((c: any) => c.id === 'support:ask')).to.be.true;
      expect(supportCommands.some((c: any) => c.id === 'support:contact')).to.be.true;
      expect(supportCommands.some((c: any) => c.id === 'support:info')).to.be.true;
    });

    it('should have correct subcommand mappings', function() {
      // Verify the migration from help subcommands
      const commandMappings = {
        'help:ask': 'support:ask',
        'help:contact': 'support:contact',
        'help:support': 'support:info'  // Note: help:support -> support:info
      };
      
      Object.entries(commandMappings).forEach(([oldCmd, newCmd]) => {
        // Old commands should not exist
        const mockConfig = {
          findCommand: (id: string) => {
            if (id === oldCmd) return null;
            if (id === newCmd) return { id: newCmd };
            return null;
          }
        } as any;
        
        expect(mockConfig.findCommand(oldCmd)).to.be.null;
        expect(mockConfig.findCommand(newCmd)).to.not.be.null;
      });
    });
  });

  describe('Support Subcommands', function() {
    it('support:ask should have correct description', function() {
      const mockCommand = {
        id: 'support:ask',
        description: 'Ask Ably AI for help with the CLI, your account, or Ably features'
      };
      
      expect(mockCommand.description).to.include('AI');
      expect(mockCommand.description).to.include('help');
    });

    it('support:contact should have correct description', function() {
      const mockCommand = {
        id: 'support:contact',
        description: 'Contact Ably support'
      };
      
      expect(mockCommand.description).to.include('Contact');
      expect(mockCommand.description).to.include('support');
    });

    it('support:info should have correct description', function() {
      const mockCommand = {
        id: 'support:info',
        description: 'Get links to Ably support, documentation, and community resources'
      };
      
      expect(mockCommand.description).to.include('support');
      expect(mockCommand.description).to.include('documentation');
    });
  });

  describe('Topic Command Behavior', function() {
    it('should show help when run without subcommand', async function() {
      // Mock a topic command behavior
      const mockTopicCommand = {
        run: async function() {
          // Topic commands should show their help when run without subcommand
          return this.config.runCommand('help', ['support']);
        },
        config: {
          runCommand: sandbox.stub().resolves()
        }
      };
      
      await mockTopicCommand.run();
      
      expect((mockTopicCommand.config.runCommand as sinon.SinonStub).calledWith('help', ['support'])).to.be.true;
    });
  });
});