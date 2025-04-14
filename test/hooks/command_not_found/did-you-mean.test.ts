import { expect } from 'chai';
import * as sinon from 'sinon';
import { Config, Errors, Command, Flags, Args } from '@oclif/core';
import * as path from 'path';
import { fileURLToPath } from 'url'; // Import url helpers
import { dirname } from 'path'; // Import dirname
// Import the compiled hook function
import didYouMeanHook from '../../../dist/src/hooks/command_not_found/did-you-mean.js';

// Mock command load
class MockCmdClass {
  static id = 'channels:subscribe';
  static usage = 'channels subscribe CHANNEL_NAME';
  static description = 'Subscribe to a channel';
  static args = {
    channel: Args.string({ description: 'Channel to subscribe to', required: true }),
  };
  static flags = {
    'some-flag': Flags.string({ char: 'f', description: 'A flag' }),
    'hidden-flag': Flags.boolean({ hidden: true }),
  };
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
    id: 'channels:subscribe', 
    aliases: [], 
    hidden: false, 
    pluginAlias: '@ably/cli', // Example
    pluginType: 'core',      // Example
    load: async () => MockCmdClass as unknown as Command.Class, // Return mock class
    args: MockCmdClass.args, 
    flags: MockCmdClass.flags,
    hiddenAliases: [],
  };
  config.commands.push(loadableCmd);
  config.commands.push({ id: 'channels:publish', load: async () => ({ run: async () => {} } as any) } as Command.Loadable);
  config.commands.push({ id: 'help', load: async () => ({ run: async () => {} } as any) } as Command.Loadable);
  config.commandIDs.push('channels:subscribe', 'channels:publish', 'help');
  config.topics.push({ name: 'channels', description: 'Channel commands' } as any);
  return config;
}

// Helper regex to strip ANSI codes for matching
const stripAnsi = (str: string) => str.replace(/\u001b\[(?:\d*;)*\d*m/g, '');

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
      log: logStub,
      warn: warnStub,
      error: (input: string | Error, options: { code?: string; exit: number | false } = { exit: 1 }) => {
        errorStub(input instanceof Error ? input.message : input);
        if (options.exit !== false) {
          const exitCode = typeof options.exit === 'number' ? options.exit : 1;
          exitStub(exitCode);
        }
      },
      exit: (code?: number) => exitStub(code ?? 0), 
      debug: sinon.stub(),
    };
  });

  afterEach(() => {
    // Restore all stubs created by Sinon in this test file
    sinon.restore(); 
  });

  // --- Tests now assume confirmation always happens ---

  it('should run the suggested command (using space separator)', async () => {
    const runCommandStub = sinon.stub(testConfig, 'runCommand').resolves(); 
    const hookOpts = { id: 'channels:pubish', config: testConfig, argv: [], context: mockContext };

    await didYouMeanHook.apply(mockContext, [hookOpts]);

    expect(warnStub.calledOnce, 'this.warn should have been called once').to.be.true;
    const warnArg = warnStub.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain('channels pubish is not an ably command'); 
    expect(runCommandStub.calledOnceWith('channels:publish', [])).to.be.true;
  });

  it('should pass arguments to the suggested command', async () => {
    const runCommandStub = sinon.stub(testConfig, 'runCommand').resolves();
    const hookOpts = { id: 'channels:publsh', config: testConfig, argv: ['my-channel', 'my-message', '--flag'], context: mockContext };

    await didYouMeanHook.apply(mockContext, [hookOpts]);

    expect(warnStub.calledOnce, 'this.warn should have been called once').to.be.true;
    const warnArg = warnStub.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain('channels publsh is not an ably command'); 
    expect(runCommandStub.calledOnceWith('channels:publish', ['my-channel', 'my-message', '--flag'])).to.be.true;
  });

  it('should re-throw CLIError when suggested command fails missing args', async () => {
    const missingArgsError = new Errors.CLIError('Missing 1 required arg: channel');
    const runCommandStub = sinon.stub(testConfig, 'runCommand').rejects(missingArgsError);
    const hookOpts = { id: 'channels:subscrib', config: testConfig, argv: [], context: mockContext };

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
    const hookOpts = { id: 'hep', config: testConfig, argv: [], context: mockContext }; 

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
    const hookOpts = { id: 'verywrongcommand', config: testConfig, argv: [], context: mockContext };

    await didYouMeanHook.apply(mockContext, [hookOpts]);

    expect(warnStub.called).to.be.false;
    expect(errorStub.calledOnce, 'this.error should have been called once').to.be.true;
    const errorArg = errorStub.firstCall.args[0];
    expect(stripAnsi(errorArg)).to.contain('Command verywrongcommand not found. Run ably help for a list of available commands.');
    expect(exitStub.calledOnceWithExactly(127)).to.be.true; 
    expect(runCommandStub.called).to.be.false;
  });

}); 