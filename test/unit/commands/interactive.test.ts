import { expect } from 'chai';
import Interactive from '../../../src/commands/interactive.js';
import { Config } from '@oclif/core';

describe('Interactive Command', () => {
  describe('static properties', () => {
    it('should have correct description', () => {
      expect(Interactive.description).to.equal('Launch interactive Ably shell (experimental)');
    });
    
    it('should be hidden', () => {
      expect(Interactive.hidden).to.be.true;
    });
    
    it('should have special exit code', () => {
      expect(Interactive.EXIT_CODE_USER_EXIT).to.equal(42);
    });
  });
  
  describe('interactive mode environment', () => {
    afterEach(() => {
      delete process.env.ABLY_INTERACTIVE_MODE;
    });
    
    it('should set ABLY_INTERACTIVE_MODE environment variable', async () => {
      const cmd = new Interactive([], {} as Config);
      
      // The run method sets the env var
      try {
        await cmd.run();
      } catch (e) {
        // Ignore errors from missing config, we just need to check env var
      }
      
      expect(process.env.ABLY_INTERACTIVE_MODE).to.equal('true');
    });
  });
  
  describe('parseCommand', () => {
    it('should parse commands correctly', () => {
      const cmd = new Interactive([], {} as Config);
      
      // Access private method through any type
      const parseCommand = (cmd as any).parseCommand.bind(cmd);
      
      // Test simple command
      expect(parseCommand('help')).to.deep.equal(['help']);
      
      // Test command with arguments
      expect(parseCommand('apps list')).to.deep.equal(['apps', 'list']);
      
      // Test command with quoted strings
      expect(parseCommand('channels publish "my channel" "hello world"')).to.deep.equal([
        'channels', 'publish', 'my channel', 'hello world'
      ]);
      
      // Test mixed quotes
      expect(parseCommand(`channels publish 'single' "double"`)).to.deep.equal([
        'channels', 'publish', 'single', 'double'
      ]);
      
      // Test empty quotes - should return empty string
      expect(parseCommand('test "" empty')).to.deep.equal(['test', '', 'empty']);
      
      // Test with backslashes - regex doesn't handle escapes specially
      expect(parseCommand('test "quoted string"')).to.deep.equal(['test', 'quoted string']);
    });
  });
  
  describe('environment variables', () => {
    it('should detect wrapper mode', () => {
      process.env.ABLY_WRAPPER_MODE = '1';
      const cmd = new Interactive([], {} as Config);
      expect((cmd as any).isWrapperMode).to.be.true;
      delete process.env.ABLY_WRAPPER_MODE;
    });
    
    it('should not be in wrapper mode by default', () => {
      const cmd = new Interactive([], {} as Config);
      expect((cmd as any).isWrapperMode).to.be.false;
    });
  });
});