import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import Interactive from '../../../src/commands/interactive.js';
import { Readable, Writable } from 'node:stream';
import * as readline from 'node:readline';

describe('Interactive Mode - Terminal Behavior Unit Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockInput: Readable;
  let mockOutput: Writable;
  let _outputData: string;
  let originalStdin: any;
  let originalStdout: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    _outputData = '';
    
    // Create mock streams
    mockInput = new Readable({
      read() {}
    });
    
    // Add properties needed by the interactive command
    (mockInput as any).isTTY = true;
    (mockInput as any).setRawMode = sandbox.stub().returns(mockInput);
    
    // Enable keypress events on our mock input
    readline.emitKeypressEvents(mockInput);
    
    mockOutput = new Writable({
      write(chunk: any, encoding: any, callback: any) {
        _outputData += chunk.toString();
        if (callback) callback();
        return true;
      }
    });
    
    // Add properties needed by output
    (mockOutput as any).isTTY = true;
    
    // Store originals
    originalStdin = process.stdin;
    originalStdout = process.stdout;
    
    // Replace process.stdin and process.stdout
    Object.defineProperty(process, 'stdin', {
      value: mockInput,
      configurable: true
    });
    
    Object.defineProperty(process, 'stdout', {
      value: mockOutput,
      configurable: true
    });
    
    // Stub console methods
    sandbox.stub(console, 'log');
    sandbox.stub(console, 'error');
    
    // Suppress welcome message for tests
    process.env.ABLY_SUPPRESS_WELCOME = 'true';
  });

  afterEach(() => {
    // Restore process streams
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      configurable: true
    });
    
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      configurable: true
    });
    
    delete process.env.ABLY_SUPPRESS_WELCOME;
    
    sandbox.restore();
  });

  const simulateKeypress = (str: string | null, key: any) => {
    mockInput.emit('keypress', str || '', key);
  };

  it('should handle autocomplete during history search correctly', async () => {
    const cmd = new Interactive([], {} as any);
    cmd.config = {
      version: '1.0.0',
      commands: [{
        id: 'channels',
        description: 'Manage channels',
        flags: {},
        args: {},
        run: sandbox.stub()
      }],
      runCommand: sandbox.stub(),
      findCommand: sandbox.stub(),
      root: '/test',
    } as any;
    
    await cmd.run();
    
    const _rl = (cmd as any).rl;
    
    // Enter history search mode
    simulateKeypress(null, { ctrl: true, name: 'r' });
    
    // Verify autocomplete is disabled during search
    const completer = (cmd as any).completer.bind(cmd);
    const result = completer('ch');
    
    expect(result).to.deep.equal([[], 'ch']);
    
    // Exit search mode
    simulateKeypress(null, { name: 'escape' });
    
    // Verify autocomplete works again
    const result2 = completer('ch');
    expect(result2[0]).to.include('channels');
  });

  it('should maintain cursor position across operations', async () => {
    const cmd = new Interactive([], {} as any);
    cmd.config = {
      version: '1.0.0',
      commands: [],
      runCommand: sandbox.stub(),
      findCommand: sandbox.stub(),
      root: '/test',
    } as any;
    
    await cmd.run();
    
    const rl = (cmd as any).rl;
    
    // Set initial state
    (rl as any).line = 'test command';
    (rl as any).cursor = 5; // cursor at 'test |command'
    
    // Enter and exit history search
    simulateKeypress(null, { ctrl: true, name: 'r' });
    
    const historySearch = (cmd as any).historySearch;
    expect(historySearch.originalCursorPos).to.equal(5);
    
    // Cancel search
    simulateKeypress(null, { name: 'escape' });
    
    // Cursor should be restored
    expect((rl as any).cursor).to.equal(5);
  });

  it('should handle empty history gracefully', async () => {
    const cmd = new Interactive([], {} as any);
    cmd.config = {
      version: '1.0.0',
      commands: [],
      runCommand: sandbox.stub(),
      findCommand: sandbox.stub(),
      root: '/test',
    } as any;
    
    await cmd.run();
    
    const rl = (cmd as any).rl;
    
    // Ensure history is empty
    (rl as any).history = [];
    
    // Try history navigation
    const originalLine = 'current input';
    (rl as any).line = originalLine;
    
    // Simulate up arrow - should do nothing
    rl.emit('history', 1);
    
    // Line should remain unchanged
    expect((rl as any).line).to.equal(originalLine);
    
    // Try history search
    simulateKeypress(null, { ctrl: true, name: 'r' });
    simulateKeypress('t', { name: 't' });
    
    const historySearch = (cmd as any).historySearch;
    expect(historySearch.matches.length).to.equal(0);
  });

  it('should handle rapid key sequences', async () => {
    const cmd = new Interactive([], {} as any);
    cmd.config = {
      version: '1.0.0',
      commands: [{
        id: 'test',
        description: 'Test command',
        flags: {},
        args: {},
        run: sandbox.stub()
      }],
      runCommand: sandbox.stub(),
      findCommand: sandbox.stub(),
      root: '/test',
    } as any;
    
    await cmd.run();
    
    const rl = (cmd as any).rl;
    (rl as any).history = ['test one', 'test two', 'test three'];
    
    // Rapid sequence: Ctrl+R, type, Ctrl+R again, escape
    simulateKeypress(null, { ctrl: true, name: 'r' });
    simulateKeypress('t', { name: 't' });
    simulateKeypress('e', { name: 'e' });
    simulateKeypress('s', { name: 's' });
    simulateKeypress('t', { name: 't' });
    simulateKeypress(null, { ctrl: true, name: 'r' });
    simulateKeypress(null, { ctrl: true, name: 'r' });
    simulateKeypress(null, { name: 'escape' });
    
    // Should handle all keys without errors
    const historySearch = (cmd as any).historySearch;
    expect(historySearch.active).to.be.false;
  });

  it('should preserve prompt state after errors', async () => {
    const cmd = new Interactive([], {} as any);
    cmd.config = {
      version: '1.0.0',
      commands: [],
      runCommand: sandbox.stub().rejects(new Error('Command failed')),
      findCommand: sandbox.stub(),
      root: '/test',
    } as any;
    
    await cmd.run();
    
    const rl = (cmd as any).rl;
    const promptStub = sandbox.stub(rl, 'prompt');
    
    // Simulate command execution
    rl.emit('line', 'invalid command');
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Prompt should be called again after error
    expect(promptStub.called).to.be.true;
  });

  it('should handle special characters in autocomplete', async () => {
    const cmd = new Interactive([], {} as any);
    cmd.config = {
      version: '1.0.0',
      commands: [{
        id: 'test-command',
        description: 'Test command with dash',
        flags: {},
        args: {},
        run: sandbox.stub()
      }],
      runCommand: sandbox.stub(),
      findCommand: sandbox.stub(),
      root: '/test',
    } as any;
    
    await cmd.run();
    
    const completer = (cmd as any).completer.bind(cmd);
    
    // Test autocomplete with special characters
    const result = completer('test-');
    expect(result[0]).to.include('test-command');
  });

  it('should handle concurrent operations correctly', async () => {
    const cmd = new Interactive([], {} as any);
    cmd.config = {
      version: '1.0.0',
      commands: [],
      runCommand: sandbox.stub(),
      findCommand: sandbox.stub(),
      root: '/test',
    } as any;
    
    await cmd.run();
    
    const rl = (cmd as any).rl;
    (rl as any).history = ['command one', 'command two'];
    
    // Start history search
    simulateKeypress(null, { ctrl: true, name: 'r' });
    
    // Type while also trying to navigate history (should be ignored)
    simulateKeypress('c', { name: 'c' });
    rl.emit('history', -1); // This should be ignored during search
    simulateKeypress('o', { name: 'o' });
    
    const historySearch = (cmd as any).historySearch;
    expect(historySearch.searchTerm).to.equal('co');
    expect(historySearch.active).to.be.true;
  });

  it('should handle edge cases in history cycling', async () => {
    const cmd = new Interactive([], {} as any);
    cmd.config = {
      version: '1.0.0',
      commands: [],
      runCommand: sandbox.stub(),
      findCommand: sandbox.stub(),
      root: '/test',
    } as any;
    
    await cmd.run();
    
    const rl = (cmd as any).rl;
    (rl as any).history = ['match1', 'no', 'match2'];
    
    // Enter history search
    simulateKeypress(null, { ctrl: true, name: 'r' });
    simulateKeypress('m', { name: 'm' });
    simulateKeypress('a', { name: 'a' });
    simulateKeypress('t', { name: 't' });
    simulateKeypress('c', { name: 'c' });
    simulateKeypress('h', { name: 'h' });
    
    const historySearch = (cmd as any).historySearch;
    
    // Should find 2 matches
    expect(historySearch.matches.length).to.equal(2);
    
    // Cycle through all matches and wrap around
    simulateKeypress(null, { ctrl: true, name: 'r' }); // to match2
    simulateKeypress(null, { ctrl: true, name: 'r' }); // back to match1
    simulateKeypress(null, { ctrl: true, name: 'r' }); // to match2 again
    
    expect(historySearch.currentIndex).to.equal(1);
  });

  it('should clean up resources on exit', async () => {
    const cmd = new Interactive([], {} as any);
    cmd.config = {
      version: '1.0.0',
      commands: [],
      runCommand: sandbox.stub(),
      findCommand: sandbox.stub(),
      root: '/test',
    } as any;
    
    await cmd.run();
    
    const rl = (cmd as any).rl;
    const closeStub = sandbox.stub(rl, 'close');
    
    // Simulate exit command
    rl.emit('line', 'exit');
    
    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Readline should be closed
    expect(closeStub.called).to.be.true;
  });
});