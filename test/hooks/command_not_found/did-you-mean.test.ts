import { Args, Command, Config, Errors, Flags } from '@oclif/core';
import { expect, test } from '@oclif/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sinon from 'sinon';
import { dirname } from 'node:path';

// Import the compiled hook function
import hook from '../../../src/hooks/command_not_found/did-you-mean.js';

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
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const root = path.resolve(__dirname, '../../../');
  const config = new Config({ root });
  await config.load();
  const loadableCmd: Command.Loadable = {
    aliases: [],
    args: MockCmdClass.args,
    flags: MockCmdClass.flags,
    hidden: false,
    hiddenAliases: [],
    id: 'channels:subscribe',
    load: async () => MockCmdClass as unknown as Command.Class,
    pluginAlias: '@ably/cli',
    pluginType: 'core',
  };
  config.commands.push(
    loadableCmd,
    { id: 'channels:publish', load: async () => ({ async run() {} } as any) } as Command.Loadable,
    { id: 'help', load: async () => ({ async run() {} } as any) } as Command.Loadable
  );
  config.commandIDs.push('channels:subscribe', 'channels:publish', 'help');
  config.topics.push({ description: 'Channel commands', name: 'channels' } as any);
  return config;
}

// Helper regex to strip ANSI codes for matching
// eslint-disable-next-line no-control-regex
const stripAnsi = (str: string) => str.replaceAll(/\u001B\[(?:\d*;)*\d*m/g, '');

// Define custom context interface without extending base Context
interface TestContext {
  config: Config;
  mockContext: any; 
}

// Setup context for tests using the custom interface
const setupTestContext = test
  .do(async (ctx: TestContext) => {
    ctx.config = await createTestConfig();
  })
  .stub(console, 'log', () => sinon.stub())
  .stub(console, 'warn', () => sinon.stub())
  .stub(console, 'error', () => sinon.stub())
  // Cast process.exit stub through unknown
  .stub(process, 'exit', () => sinon.stub().returns(undefined as never) as unknown as sinon.SinonStub)
  .do((ctx: TestContext) => {
    // Create mock context for the hook
    ctx.mockContext = {
      config: ctx.config,
      debug: sinon.stub(),
      error(input: Error | string, options: { code?: string; exit: false | number } = { exit: 1 }) {
        // Cast console.error stub through unknown
        (console.error as unknown as sinon.SinonStub)(input instanceof Error ? input.message : input);
        if (options.exit !== false) {
          const exitCode = typeof options.exit === 'number' ? options.exit : 1;
          // Cast process.exit stub through unknown
          (process.exit as unknown as sinon.SinonStub)(exitCode);
        }
      },
      // Cast process.exit stub through unknown
      exit: (code?: number) => (process.exit as unknown as sinon.SinonStub)(code ?? 0),
      log: console.log as sinon.SinonStub,
      warn: console.warn as sinon.SinonStub,
    };
  })
  // Stub runCommand on the config within the context
  .stub(Config.prototype, 'runCommand', () => sinon.stub().resolves());


// --- Tests using @oclif/test structure ---

setupTestContext
  .it('should run the suggested command (using space separator)', async (ctx: TestContext) => {
    const hookOpts = { argv: [], config: ctx.config, context: ctx.mockContext, id: 'channels:pubish' };
    await hook.apply(ctx.mockContext, [hookOpts]);

    const warnStub = console.warn as sinon.SinonStub;
    // Access stubbed runCommand correctly via prototype stub
    const runCommandStub = Config.prototype.runCommand as sinon.SinonStub;

    expect(warnStub.calledOnce).to.be.true;
    const warnArg = warnStub.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain('channels pubish is not an ably command');
    // Assert on the prototype stub
    expect(runCommandStub.calledOnceWith('channels:publish', [])).to.be.true;
  });

setupTestContext
  .it('should pass arguments to the suggested command', async (ctx: TestContext) => {
    const hookOpts = { argv: ['my-channel', 'my-message', '--flag'], config: ctx.config, context: ctx.mockContext, id: 'channels:publsh' };
    await hook.apply(ctx.mockContext, [hookOpts]);

    const warnStub = console.warn as sinon.SinonStub;
    const runCommandStub = Config.prototype.runCommand as sinon.SinonStub;

    expect(warnStub.calledOnce).to.be.true;
    const warnArg = warnStub.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain('channels publsh is not an ably command');
    expect(runCommandStub.calledOnceWith('channels:publish', ['my-channel', 'my-message', '--flag'])).to.be.true;
  });

// Use a separate test chain for the rejecting stub
const setupRejectingTestContext = test
  .do(async (ctx: TestContext) => {
    ctx.config = await createTestConfig();
  })
  .stub(console, 'log', () => sinon.stub())
  .stub(console, 'warn', () => sinon.stub())
  .stub(console, 'error', () => sinon.stub())
  .stub(process, 'exit', () => sinon.stub().returns(undefined as never) as unknown as sinon.SinonStub)
  .do((ctx: TestContext) => {
    ctx.mockContext = {
      config: ctx.config,
      debug: sinon.stub(),
      error(input: Error | string, options: { code?: string; exit: false | number } = { exit: 1 }) {
        (console.error as unknown as sinon.SinonStub)(input instanceof Error ? input.message : input);
        if (options.exit !== false) {
          (process.exit as unknown as sinon.SinonStub)(typeof options.exit === 'number' ? options.exit : 1);
        }
      },
      exit: (code?: number) => (process.exit as unknown as sinon.SinonStub)(code ?? 0),
      log: console.log as sinon.SinonStub,
      warn: console.warn as sinon.SinonStub,
    };
  })
  // Stub runCommand specifically for this test context to reject
  .stub(Config.prototype, 'runCommand', () => sinon.stub().rejects(new Errors.CLIError('Missing 1 required arg: channel')));

setupRejectingTestContext
  .it('should re-throw CLIError when suggested command fails missing args', async (ctx: TestContext) => {
    const hookOpts = { argv: [], config: ctx.config, context: ctx.mockContext, id: 'channels:subscrib' };
    const warnStub = console.warn as sinon.SinonStub;
    const errorStub = console.error as unknown as sinon.SinonStub;
    const exitStub = process.exit as unknown as sinon.SinonStub;
    // Note: runCommandStub will be the rejecting one from this context setup
    const runCommandStub = Config.prototype.runCommand as sinon.SinonStub;

    let caughtError: any = null;
    try {
      await hook.apply(ctx.mockContext, [hookOpts]);
    } catch (error: any) {
      caughtError = error;
    }

    expect(warnStub.calledOnce).to.be.true;
    const warnArg = warnStub.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain('channels subscrib is not an ably command');
    expect(runCommandStub.calledOnceWith('channels:subscribe', [])).to.be.true;
    expect(caughtError).to.be.instanceOf(Errors.CLIError);
    expect(caughtError.message).to.contain('Missing 1 required arg: channel');
    expect(errorStub.called).to.be.false;
    expect(exitStub.called).to.be.false;
  });

setupTestContext
  .it('should correctly suggest and run help for a command', async (ctx: TestContext) => {
    const hookOpts = { argv: [], config: ctx.config, context: ctx.mockContext, id: 'hep' };
    await hook.apply(ctx.mockContext, [hookOpts]);

    const warnStub = console.warn as sinon.SinonStub;
    const runCommandStub = Config.prototype.runCommand as sinon.SinonStub;

    expect(warnStub.calledOnce).to.be.true;
    const warnArg = warnStub.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain('hep is not an ably command');
    expect(runCommandStub.calledOnceWith('help', [])).to.be.true;
  });

setupTestContext
  .it('should show generic help if no close command is found', async (ctx: TestContext) => {
    const hookOpts = { argv: [], config: ctx.config, context: ctx.mockContext, id: 'verywrongcommand' };
    await hook.apply(ctx.mockContext, [hookOpts]);

    const warnStub = console.warn as sinon.SinonStub;
    const errorStub = console.error as unknown as sinon.SinonStub;
    const exitStub = process.exit as unknown as sinon.SinonStub;
    const runCommandStub = Config.prototype.runCommand as sinon.SinonStub;

    expect(warnStub.called).to.be.false;
    expect(errorStub.calledOnce).to.be.true;
    const errorArg = errorStub.firstCall.args[0];
    expect(stripAnsi(errorArg)).to.contain('Command verywrongcommand not found. Run ably help for a list of available commands.');
    expect(exitStub.calledOnceWithExactly(127)).to.be.true;
    expect(runCommandStub.called).to.be.false;
  });

