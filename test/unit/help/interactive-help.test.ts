import { expect } from 'chai';
import { Config } from '@oclif/core';
import CustomHelp from '../../../src/help.js';

describe('Interactive Mode Help Formatting', function() {
  let help: CustomHelp;
  let config: Config;
  
  beforeEach(async function() {
    // Create a minimal config
    config = {
      bin: 'ably',
      commands: [],
      topics: []
    } as any;
  });
  
  afterEach(function() {
    // Clean up environment variables
    delete process.env.ABLY_INTERACTIVE_MODE;
    delete process.env.ABLY_WEB_CLI_MODE;
    delete process.env.ABLY_ANONYMOUS_USER_MODE;
  });
  
  describe('stripAblyPrefix', function() {
    beforeEach(function() {
      process.env.ABLY_INTERACTIVE_MODE = 'true';
      help = new CustomHelp(config);
    });
    
    it('should replace "$ ably " with "ably> " in examples', function() {
      const input = '$ ably channels publish my-channel "Hello"';
      const result = help.formatHelpOutput(input);
      expect(result).to.equal('ably> channels publish my-channel "Hello"');
    });
    
    it('should strip "ably " at the beginning of lines', function() {
      const input = 'ably channels subscribe test';
      const result = help.formatHelpOutput(input);
      expect(result).to.equal('channels subscribe test');
    });
    
    it('should strip indented "ably " commands', function() {
      const input = '  ably apps list';
      const result = help.formatHelpOutput(input);
      expect(result).to.equal('  apps list');
    });
    
    it('should handle multiple occurrences', function() {
      const input = `Examples:
$ ably channels publish test "msg1"
$ ably channels publish test "msg2"
  ably apps list`;
      const expected = `Examples:
ably> channels publish test "msg1"
ably> channels publish test "msg2"
  apps list`;
      const result = help.formatHelpOutput(input);
      expect(result).to.equal(expected);
    });
    
    it('should not strip when not in interactive mode', function() {
      delete process.env.ABLY_INTERACTIVE_MODE;
      help = new CustomHelp(config);
      
      const input = '$ ably channels publish test';
      const result = help.formatHelpOutput(input);
      expect(result).to.equal(input);
    });
  });
  
  describe('USAGE section', function() {
    it('should show "ably> [COMMAND]" in interactive mode', function() {
      process.env.ABLY_INTERACTIVE_MODE = 'true';
      help = new CustomHelp(config);
      
      const output = help.formatStandardRoot();
      expect(output).to.include('ably> [COMMAND]');
      expect(output).to.not.include('$ ably [COMMAND]');
    });
    
    it('should show "$ ably [COMMAND]" in normal mode', function() {
      help = new CustomHelp(config);
      
      const output = help.formatStandardRoot();
      expect(output).to.include('$ ably [COMMAND]');
    });
  });
  
  describe('Command examples', function() {
    it('should strip ably prefix from web CLI commands', function() {
      process.env.ABLY_INTERACTIVE_MODE = 'true';
      process.env.ABLY_WEB_CLI_MODE = 'true';
      help = new CustomHelp(config);
      
      const output = help.formatWebCliRoot();
      expect(output).to.include('channels publish [channel] [message]');
      expect(output).to.include('--help');
      expect(output).to.not.include('ably channels');
      expect(output).to.not.include('ably --help');
    });
    
    it('should show ably prefix in normal web CLI mode', function() {
      process.env.ABLY_WEB_CLI_MODE = 'true';
      help = new CustomHelp(config);
      
      const output = help.formatWebCliRoot();
      expect(output).to.include('ably channels publish');
      expect(output).to.include('ably --help');
    });
  });
  
  describe('Login prompt', function() {
    it('should strip ably from login command in interactive mode', function() {
      process.env.ABLY_INTERACTIVE_MODE = 'true';
      help = new CustomHelp(config);
      
      const output = help.formatStandardRoot();
      if (output.includes('login')) {
        expect(output).to.include('ably> accounts login');
        expect(output).to.not.include('$ ably accounts login');
      }
    });
    
    it('should show full command in normal mode', function() {
      help = new CustomHelp(config);
      
      const output = help.formatStandardRoot();
      if (output.includes('login')) {
        expect(output).to.include('$ ably accounts login');
      }
    });
  });

  describe('Anonymous Mode Command Filtering', function() {
    beforeEach(function() {
      // Set up a more complete config with various commands
      config = {
        bin: 'ably',
        commands: [
          { id: 'channels:publish', description: 'Publish a message', hidden: false },
          { id: 'channels:subscribe', description: 'Subscribe to channel', hidden: false },
          { id: 'channels:list', description: 'List channels', hidden: false },
          { id: 'channels:logs', description: 'View channel logs', hidden: false },
          { id: 'accounts:list', description: 'List accounts', hidden: false },
          { id: 'apps:list', description: 'List apps', hidden: false },
          { id: 'bench:publisher', description: 'Benchmark publisher', hidden: false },
          { id: 'auth:keys:list', description: 'List auth keys', hidden: false },
          { id: 'logs:app:history', description: 'View app logs', hidden: false },
          { id: 'spaces:list', description: 'List spaces', hidden: false },
          { id: 'rooms:list', description: 'List rooms', hidden: false },
          { id: 'integrations:create', description: 'Create integration', hidden: false },
          { id: 'queues:create', description: 'Create queue', hidden: false }
        ],
        topics: [],
        findCommand: (id: string) => config.commands.find(c => c.id === id)
      } as any;
    });

    it('should display all commands when not in web CLI mode', function() {
      help = new CustomHelp(config);
      
      // Test shouldDisplay for various commands
      expect(help.shouldDisplay({ id: 'channels:list' } as any)).to.be.true;
      expect(help.shouldDisplay({ id: 'accounts:list' } as any)).to.be.true;
      expect(help.shouldDisplay({ id: 'apps:list' } as any)).to.be.true;
      expect(help.shouldDisplay({ id: 'bench:publisher' } as any)).to.be.true;
    });

    it('should filter web CLI restricted commands in web mode', function() {
      process.env.ABLY_WEB_CLI_MODE = 'true';
      help = new CustomHelp(config);
      
      // These should be hidden in web CLI mode
      expect(help.shouldDisplay({ id: 'accounts:list' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'apps:create' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'config' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'mcp:start' } as any)).to.be.false;
      
      // These should still be visible
      expect(help.shouldDisplay({ id: 'channels:publish' } as any)).to.be.true;
      expect(help.shouldDisplay({ id: 'channels:list' } as any)).to.be.true;
    });

    it('should filter anonymous restricted commands in anonymous mode', function() {
      process.env.ABLY_WEB_CLI_MODE = 'true';
      process.env.ABLY_ANONYMOUS_USER_MODE = 'true';
      help = new CustomHelp(config);
      
      // These should be hidden in anonymous mode
      expect(help.shouldDisplay({ id: 'channels:list' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'channels:logs' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'accounts:list' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'apps:list' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'bench:publisher' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'auth:keys:list' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'logs:app:history' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'spaces:list' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'rooms:list' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'integrations:create' } as any)).to.be.false;
      expect(help.shouldDisplay({ id: 'queues:create' } as any)).to.be.false;
      
      // These should still be visible
      expect(help.shouldDisplay({ id: 'channels:publish' } as any)).to.be.true;
      expect(help.shouldDisplay({ id: 'channels:subscribe' } as any)).to.be.true;
    });

    it('should handle wildcard patterns correctly', function() {
      process.env.ABLY_WEB_CLI_MODE = 'true';
      process.env.ABLY_ANONYMOUS_USER_MODE = 'true';
      help = new CustomHelp(config);
      
      // Test wildcard patterns
      expect(help.shouldDisplay({ id: 'accounts' } as any)).to.be.false; // matches accounts*
      expect(help.shouldDisplay({ id: 'accounts:stats' } as any)).to.be.false; // matches accounts*
      expect(help.shouldDisplay({ id: 'apps' } as any)).to.be.false; // matches apps*
      expect(help.shouldDisplay({ id: 'apps:current' } as any)).to.be.false; // matches apps*
      expect(help.shouldDisplay({ id: 'bench' } as any)).to.be.false; // matches bench*
      expect(help.shouldDisplay({ id: 'bench:subscriber' } as any)).to.be.false; // matches bench*
      expect(help.shouldDisplay({ id: 'logs' } as any)).to.be.false; // matches logs*
      expect(help.shouldDisplay({ id: 'logs:push:subscribe' } as any)).to.be.false; // matches logs*
    });

    it('should show appropriate message for anonymous restricted commands', function() {
      process.env.ABLY_WEB_CLI_MODE = 'true';
      process.env.ABLY_ANONYMOUS_USER_MODE = 'true';
      help = new CustomHelp(config);
      
      const command = { id: 'channels:list', description: 'List channels' };
      const output = help.formatCommand(command as any);
      
      expect(output).to.include('This command is not available in anonymous mode');
      expect(output).to.include('Please provide an access token to use this command');
    });

    it('should show appropriate message for web CLI restricted commands', function() {
      process.env.ABLY_WEB_CLI_MODE = 'true';
      help = new CustomHelp(config);
      
      const command = { id: 'accounts:login', description: 'Login to account' };
      const output = help.formatCommand(command as any);
      
      expect(output).to.include('This command is not available in the web CLI mode');
      expect(output).to.include('Please use the standalone CLI installation instead');
    });
  });
});