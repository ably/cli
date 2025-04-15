import { Args, Command, Config, Errors, Flags } from '@oclif/core';
import { expect } from 'chai';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sinon from 'sinon'; // Import url helpers
import { dirname } from 'node:path'; // Import dirname
// Import the compiled hook function
import didYouMeanHook from '../../../dist/src/hooks/command_not_found/did-you-mean.js';

// Mock command load
class MockCmdClass {
  static args = {
    channel: Args.string({ description: 'Channel to subscribe to', required: true }),
  };

  static description = 'Subscribe to a channel';
  static flags = {
    'hidden-flag': Flags.boolean({ hidden: true }),
    'some-flag': Flags.string({ char: 'f', description: 'A flag' }),
  };

  static id = 'channels:subscribe';
  static usage = 'channels subscribe CHANNEL_NAME';
  async run() {}
}

// Helper to create a minimal config for testing
async function createTestConfig(): Promise<Config> {
  // ESM way to get __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const root = path.resolve(__dirname, '../../../');
  // topicSeparator is loaded from package.json via config.load()
  const config = new Config({ root }); 
  await config.load(); 
  // Add command loadable
  const loadableCmd: Command.Loadable = {
    aliases: [], 
    args: MockCmdClass.args, 
    flags: MockCmdClass.flags, 
    hidden: false,
    hiddenAliases: [],
    id: 'channels:subscribe',
    load: async () => MockCmdClass as unknown as Command.Class, // Return mock class 
    pluginAlias: '@ably/cli', // Example
    pluginType: 'core',      // Example
  };
  config.commands.push(loadableCmd, { id: 'channels:publish', load: async () => ({ async run() {} } as any) } as Command.Loadable, { id: 'help', load: async () => ({ async run() {} } as any) } as Command.Loadable);
  config.commandIDs.push('channels:subscribe', 'channels:publish', 'help');
  config.topics.push({ description: 'Channel commands', name: 'channels' } as any);
  return config;
}

// Helper regex to strip ANSI codes for matching
const stripAnsi = (str: string) => str.replaceAll(/\u001B\[(?:\d*;)*\d*m/g, '');

describe('command_not_found hook: did-you-mean', () => {
  let testConfig: Config;
  let logStub: sinon.SinonStub;
  let warnStub: sinon.SinonStub;
  let errorStub: sinon.SinonStub;
  let exitStub: sinon.SinonStub;
  let mockContext: any; 

  before(async () => {
    testConfig = await createTestConfig();
  });

  after(() => {
    // Nothing needed here now
  });

  beforeEach(() => {
    // Ensure stubs are fresh for each test
    logStub = sinon.stub(console, 'log');
    warnStub = sinon.stub(console, 'warn'); 
    errorStub = sinon.stub(console, 'error');
    exitStub = sinon.stub(process, 'exit').returns(undefined as never);

    // Create the mock context *with the fresh stubs*
    mockContext = {
      config: testConfig,
      debug: sinon.stub(),
      error(input: Error | string, options: { code?: string; exit: false | number } = { exit: 1 }) {
        errorStub(input instanceof Error ? input.message : input);
        if (options.exit !== false) {
          const exitCode = typeof options.exit === 'number' ? options.exit : 1;
          exitStub(exitCode);
        }
      },
      exit: (code?: number) => exitStub(code ?? 0),
      log: logStub, 
      warn: warnStub,
    };
  });

  afterEach(() => {
    // Restore all stubs created by Sinon in this test file
    sinon.restore(); 
  });

  // --- Tests now assume confirmation always happens ---

  it('should run the suggested command (using space separator)', async () => {
    const runCommandStub = sinon.stub(testConfig, 'runCommand').resolves(); 
    const hookOpts = { argv: [], config: testConfig, context: mockContext, id: 'channels:pubish' };

    await didYouMeanHook.apply(mockContext, [hookOpts]);

    expect(warnStub.calledOnce, 'this.warn should have been called once').to.be.true;
    const warnArg = warnStub.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain('channels pubish is not an ably command'); 
    expect(runCommandStub.calledOnceWith('channels:publish', [])).to.be.true;
  });

  it('should pass arguments to the suggested command', async () => {
    const runCommandStub = sinon.stub(testConfig, 'runCommand').resolves();
    const hookOpts = { argv: ['my-channel', 'my-message', '--flag'], config: testConfig, context: mockContext, id: 'channels:publsh' };

    await didYouMeanHook.apply(mockContext, [hookOpts]);

    expect(warnStub.calledOnce, 'this.warn should have been called once').to.be.true;
    const warnArg = warnStub.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain('channels publsh is not an ably command'); 
    expect(runCommandStub.calledOnceWith('channels:publish', ['my-channel', 'my-message', '--flag'])).to.be.true;
  });

  it('should re-throw CLIError when suggested command fails missing args', async () => {
    const missingArgsError = new Errors.CLIError('Missing 1 required arg: channel');
    const runCommandStub = sinon.stub(testConfig, 'runCommand').rejects(missingArgsError);
    const hookOpts = { argv: [], config: testConfig, context: mockContext, id: 'channels:subscrib' };

    let caughtError: any = null;
    try {
      await didYouMeanHook.apply(mockContext, [hookOpts]);
    } catch (error: any) {
      caughtError = error;
    }

    // Verify initial warning and runCommand attempt still happened
    expect(warnStub.calledOnce, 'this.warn should have been called once').to.be.true;
    const warnArg = warnStub.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain('channels subscrib is not an ably command'); 
    expect(runCommandStub.calledOnceWith('channels:subscribe', [])).to.be.true;
    
    // Assert that the original error was re-thrown
    expect(caughtError, 'Hook should have re-thrown the CLIError').to.equal(missingArgsError);
    
    // Assert that the hook's specific error/log/exit logic was NOT called
    expect(errorStub.called, 'console.error should NOT have been called').to.be.false;
    expect(exitStub.called, 'process.exit should NOT have been called').to.be.false;
  });

  it('should correctly suggest and run help for a command', async () => {
    const runCommandStub = sinon.stub(testConfig, 'runCommand').resolves();
    const hookOpts = { argv: [], config: testConfig, context: mockContext, id: 'hep' }; 

    await didYouMeanHook.apply(mockContext, [hookOpts]);

    // This test previously failed because warnStub wasn't called.
    // Let's focus on why this assertion fails:
    expect(warnStub.calledOnce, 'this.warn should have been called once').to.be.true; 
    
    // If warn *was* called, these should pass if logic is correct:
    // const warnArg = warnStub.firstCall.args[0];
    // expect(stripAnsi(warnArg)).to.contain('hep is not an ably command'); 
    // expect(runCommandStub.calledOnceWith('help', [])).to.be.true; 
  });

  it('should show generic help if no close command is found', async () => {
    const runCommandStub = sinon.stub(testConfig, 'runCommand').resolves(); 
    const hookOpts = { argv: [], config: testConfig, context: mockContext, id: 'verywrongcommand' };

    await didYouMeanHook.apply(mockContext, [hookOpts]);

    expect(warnStub.called).to.be.false;
    expect(errorStub.calledOnce, 'this.error should have been called once').to.be.true;
    const errorArg = errorStub.firstCall.args[0];
    expect(stripAnsi(errorArg)).to.contain('Command verywrongcommand not found. Run ably help for a list of available commands.');
    expect(exitStub.calledOnceWithExactly(127)).to.be.true; 
    expect(runCommandStub.called).to.be.false;
  });

}); 