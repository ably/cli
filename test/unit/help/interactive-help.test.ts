import { expect } from 'chai';
import { Config } from '@oclif/core';
import CustomHelp from '../../../src/help.js';

describe('Interactive Mode Help Formatting', () => {
  let help: CustomHelp;
  let config: Config;
  
  beforeEach(async () => {
    // Create a minimal config
    config = {
      bin: 'ably',
      commands: [],
      topics: []
    } as any;
  });
  
  afterEach(() => {
    // Clean up environment variables
    delete process.env.ABLY_INTERACTIVE_MODE;
  });
  
  describe('stripAblyPrefix', () => {
    beforeEach(() => {
      process.env.ABLY_INTERACTIVE_MODE = 'true';
      help = new CustomHelp(config);
    });
    
    it('should strip "$ ably " prefix from examples', () => {
      const input = '$ ably channels publish my-channel "Hello"';
      const result = help.formatHelpOutput(input);
      expect(result).to.equal('$ channels publish my-channel "Hello"');
    });
    
    it('should strip "ably " at the beginning of lines', () => {
      const input = 'ably channels subscribe test';
      const result = help.formatHelpOutput(input);
      expect(result).to.equal('channels subscribe test');
    });
    
    it('should strip indented "ably " commands', () => {
      const input = '  ably apps list';
      const result = help.formatHelpOutput(input);
      expect(result).to.equal('  apps list');
    });
    
    it('should handle multiple occurrences', () => {
      const input = `Examples:
$ ably channels publish test "msg1"
$ ably channels publish test "msg2"
  ably apps list`;
      const expected = `Examples:
$ channels publish test "msg1"
$ channels publish test "msg2"
  apps list`;
      const result = help.formatHelpOutput(input);
      expect(result).to.equal(expected);
    });
    
    it('should not strip when not in interactive mode', () => {
      delete process.env.ABLY_INTERACTIVE_MODE;
      help = new CustomHelp(config);
      
      const input = '$ ably channels publish test';
      const result = help.formatHelpOutput(input);
      expect(result).to.equal(input);
    });
  });
  
  describe('USAGE section', () => {
    it('should show "$ [COMMAND]" in interactive mode', () => {
      process.env.ABLY_INTERACTIVE_MODE = 'true';
      help = new CustomHelp(config);
      
      const output = help.formatStandardRoot();
      expect(output).to.include('$ [COMMAND]');
      expect(output).to.not.include('$ ably [COMMAND]');
    });
    
    it('should show "$ ably [COMMAND]" in normal mode', () => {
      help = new CustomHelp(config);
      
      const output = help.formatStandardRoot();
      expect(output).to.include('$ ably [COMMAND]');
    });
  });
  
  describe('Command examples', () => {
    it('should strip ably prefix from web CLI commands', () => {
      process.env.ABLY_INTERACTIVE_MODE = 'true';
      process.env.ABLY_WEB_CLI_MODE = 'true';
      help = new CustomHelp(config);
      
      const output = help.formatWebCliRoot();
      expect(output).to.include('channels publish [channel] [message]');
      expect(output).to.include('--help');
      expect(output).to.not.include('ably channels');
      expect(output).to.not.include('ably --help');
    });
    
    it('should show ably prefix in normal web CLI mode', () => {
      process.env.ABLY_WEB_CLI_MODE = 'true';
      help = new CustomHelp(config);
      
      const output = help.formatWebCliRoot();
      expect(output).to.include('ably channels publish');
      expect(output).to.include('ably --help');
    });
  });
  
  describe('Login prompt', () => {
    it('should strip ably from login command in interactive mode', () => {
      process.env.ABLY_INTERACTIVE_MODE = 'true';
      help = new CustomHelp(config);
      
      const output = help.formatStandardRoot();
      if (output.includes('login')) {
        expect(output).to.include('$ accounts login');
        expect(output).to.not.include('$ ably accounts login');
      }
    });
    
    it('should show full command in normal mode', () => {
      help = new CustomHelp(config);
      
      const output = help.formatStandardRoot();
      if (output.includes('login')) {
        expect(output).to.include('$ ably accounts login');
      }
    });
  });
});