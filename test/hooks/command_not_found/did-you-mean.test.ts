import { Args, Command, Config, Errors, Flags } from "@oclif/core";
import { expect, test } from "@oclif/test";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as sinon from "sinon";
import { dirname } from "node:path";
import * as _stringDistance from "../../../src/utils/string-distance.js";

// Restore all sinon stubs after each test
// eslint-disable-next-line mocha/no-top-level-hooks
afterEach(function() {
  sinon.restore();
});

// Set environment variable to skip confirmation in tests
process.env.SKIP_CONFIRMATION = "true";

// Import the compiled hook function
import hook from "../../../src/hooks/command_not_found/did-you-mean.js";

// Mock command load
class MockCmdClass {
  static args = {
    channel: Args.string({
      description: "Channel to subscribe to",
      required: true,
    }),
  };

  static description = "Subscribe to a channel";
  static flags = {
    "hidden-flag": Flags.boolean({ hidden: true }),
    "some-flag": Flags.string({ char: "f", description: "A flag" }),
  };

  static id = "channels:subscribe";
  static usage = "channels subscribe CHANNEL_NAME";
  async run() {}
}

// Helper to create a minimal config for testing
async function createTestConfig(): Promise<Config> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const root = path.resolve(__dirname, "../../../");
  const config = new Config({ root });
  await config.load();
  const loadableCmd: Command.Loadable = {
    aliases: [],
    args: MockCmdClass.args,
    flags: MockCmdClass.flags,
    hidden: false,
    hiddenAliases: [],
    id: "channels:subscribe",
    load: async () => MockCmdClass as unknown as Command.Class,
    pluginAlias: "@ably/cli",
    pluginType: "core",
  };
  config.commands.push(
    loadableCmd,
    {
      id: "channels:publish",
      // Define args for channels:publish to match the error message
      args: {
        channel: Args.string({ required: true }),
        message: Args.string({ required: true }),
      },
      // Add minimum required properties for Command.Loadable type
      aliases: [],
      flags: {},
      hidden: false,
      hiddenAliases: [],
      load: async () => ({ async run() {} }) as any,
    } as Command.Loadable,
    {
      id: "channels:list",
      // Add minimum required properties for Command.Loadable type
      aliases: [],
      flags: {},
      hidden: false,
      hiddenAliases: [],
      args: {},
      load: async () => ({ async run() {} }) as any,
    } as Command.Loadable,
    {
      id: "help",
      // Add minimum required properties for Command.Loadable type
      aliases: [],
      flags: {},
      hidden: false,
      hiddenAliases: [],
      args: {},
      load: async () => ({ async run() {} }) as any,
    } as Command.Loadable,
  );
  config.commandIDs.push(
    "channels:subscribe",
    "channels:publish",
    "channels:list",
    "help",
  );
  config.topics.push({
    description: "Channel commands",
    name: "channels",
  } as any);
  return config;
}

// Helper regex to strip ANSI codes for matching
// eslint-disable-next-line no-control-regex
const stripAnsi = (str: string) => str.replaceAll(/\u001B\[(?:\d*;)*\d*m/g, "");

// Define custom context interface without extending base Context
interface TestContext {
  config: Config;
  mockContext: any;
  stubs: {
    log: sinon.SinonStub;
    warn: sinon.SinonStub;
    error: sinon.SinonStub;
    exit: sinon.SinonStub;
    runCommand: sinon.SinonStub;
  };
}

// Setup context for tests using the custom interface
const setupTestContext = test
  .add("stubs", {}) // Initialize stubs object
  .do(async (ctx: TestContext) => {
    ctx.config = await createTestConfig();

    // Create and store stubs in context
    ctx.stubs = {
      log: sinon.stub(console, "log"),
      warn: sinon.stub(console, "warn"),
      error: sinon.stub(console, "error"),
      exit: sinon.stub(process, "exit").returns(undefined as never),
      runCommand: sinon.stub(Config.prototype, "runCommand").resolves(),
    };
  })
  .do((ctx: TestContext) => {
    // Create mock context for the hook
    ctx.mockContext = {
      config: ctx.config,
      debug: sinon.stub(),
      error(
        input: Error | string,
        options: { code?: string; exit: false | number } = { exit: 1 },
      ) {
        // Use the stub directly from context, then throw for test purposes
        ctx.stubs.error(input instanceof Error ? input.message : input);

        // For test purposes, throw the error so it can be caught
        const errorToThrow = input instanceof Error ? input : new TypeError(String(input));
        // Attach oclif exit code if provided OR if it exists on the input error
        const exitCode = options?.exit ?? (input instanceof Errors.CLIError ? (input as any).oclif?.exit : undefined) ?? 1;
        if (exitCode !== false) {
          (errorToThrow as any).oclif = { exit: exitCode };
        }
        throw errorToThrow;
      },
      exit: (code?: number) => ctx.stubs.exit(code ?? 0),
      log: (...args: any[]) => ctx.stubs.log(...args),
      warn: (...args: any[]) => ctx.stubs.warn(...args),
    };
  });
// No .finally here, use global afterEach

// Use a separate test chain for the rejecting stub
const setupRejectingTestContext = test
  .add("stubs", {}) // Initialize stubs object
  .do(async (ctx: TestContext) => {
    ctx.config = await createTestConfig();

    // Create and store stubs in context
    ctx.stubs = {
      log: sinon.stub(console, "log"),
      warn: sinon.stub(console, "warn"),
      error: sinon.stub(console, "error"),
      exit: sinon.stub(process, "exit").returns(undefined as never),
      // This stub specifically rejects by default (for channels:subscribe)
      // REMOVE default rejection - configure rejection within specific tests
      runCommand: sinon
        .stub(Config.prototype, "runCommand")
        // .withArgs("channels:subscribe", []) // Expect empty array now
        // .rejects(new Errors.CLIError("Missing 1 required arg: channel")),
    };
  })
  .do((ctx: TestContext) => {
    // Create mock context for the hook
    ctx.mockContext = {
      config: ctx.config,
      debug: sinon.stub(),
      error(
        input: Error | string,
        options: { code?: string; exit: false | number } = { exit: 1 },
      ) {
        ctx.stubs.error(input instanceof Error ? input.message : input);

        // For test purposes, throw the error so it can be caught
        const errorToThrow = input instanceof Error ? input : new TypeError(String(input));
        // Attach oclif exit code if provided OR if it exists on the input error
        const exitCode = options?.exit ?? (input instanceof Errors.CLIError ? (input as any).oclif?.exit : undefined) ?? 1;
        if (exitCode !== false) {
          (errorToThrow as any).oclif = { exit: exitCode };
        }
        throw errorToThrow;
      },
      exit: (code?: number) => ctx.stubs.exit(code ?? 0),
      log: (...args: any[]) => ctx.stubs.log(...args),
      warn: (...args: any[]) => ctx.stubs.warn(...args),
    };
  });
// No .finally here, use global afterEach

// --- Tests using the standard context setup ---

setupTestContext.it(
  "should warn with space separator and run the suggested command (colon input)",
  async (ctx: TestContext) => {
    const hookOpts = {
      argv: [],
      config: ctx.config,
      context: ctx.mockContext,
      id: "channels:pubish", // User typo with colon
    };
    ctx.config.topicSeparator = " ";

    await hook.apply(ctx.mockContext, [hookOpts]);

    expect(ctx.stubs.warn.calledOnce).to.be.true;
    const warnArg = ctx.stubs.warn.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain(
      "channels pubish is not an ably command",
    );
    // Expect runCommand called with empty argv array now
    expect(ctx.stubs.runCommand.calledOnceWith("channels:publish", [])).to.be
      .true;
  },
);

setupTestContext.it(
  "should warn with space separator and run the suggested command (space input)",
  async (ctx: TestContext) => {
    const hookOpts = {
      argv: [],
      config: ctx.config,
      context: ctx.mockContext,
      id: "channels pubish", // User typo with space
    };
    ctx.config.topicSeparator = " ";

    await hook.apply(ctx.mockContext, [hookOpts]);

    expect(ctx.stubs.warn.calledOnce).to.be.true;
    const warnArg = ctx.stubs.warn.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain(
      "channels pubish is not an ably command",
    );
    // Expect runCommand called with empty argv array now
    expect(ctx.stubs.runCommand.calledOnceWith("channels:publish", [])).to.be
      .true;
  },
);

setupTestContext.it(
  "should pass arguments when running suggested command (space input)",
  async (ctx: TestContext) => {
    // Simulate process.argv as oclif would see it (less critical now, but good practice)
    const originalArgv = process.argv;
    process.argv = [
      "node",
      "bin/run",
      "channels",
      "publsh", // Typo
      "my-arg1", // Arg intended for corrected command
      "--flag", // Flag intended for corrected command
    ];
    const hookOpts = {
      argv: ["my-arg1", "--flag"], // This argv comes from oclif parsing the *original* input
      config: ctx.config,
      context: ctx.mockContext,
      id: "channels publsh", // Typo with space
    };
    ctx.config.topicSeparator = " ";

    await hook.apply(ctx.mockContext, [hookOpts]);

    expect(ctx.stubs.warn.calledOnce).to.be.true;
    const warnArg = ctx.stubs.warn.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain(
      "channels publsh is not an ably command",
    );
    // Hook calls runCommand with the argv derived from opts.argv
    expect(
      ctx.stubs.runCommand.calledOnceWith("channels:publish", [
        "my-arg1",
        "--flag",
      ]),
    ).to.be.true;

    // Reset process.argv for other tests
    process.argv = originalArgv;
  },
);

// Turn the commented-out test into a proper test with a very different command
setupTestContext.it(
  "should error correctly for completely unknown command (space input)",
  async (ctx: TestContext) => {
    const hookOpts = {
      argv: [],
      config: ctx.config,
      context: ctx.mockContext,
      id: "xyzxyzxyz completely nonexistent command", // Something that won't match anything
    };
    ctx.config.topicSeparator = " ";

    let errorCaught = false;
    try {
      await hook.apply(ctx.mockContext, [hookOpts]);
    } catch (error: unknown) {
      errorCaught = true;
      expect((error as Error).message).to.contain("Command xyzxyzxyz completely nonexistent command not found");
    }

    // Verify error was thrown and behavior was correct
    expect(errorCaught).to.be.true;
    expect(ctx.stubs.warn.called).to.be.false; // No warning as no suggestion
    expect(ctx.stubs.runCommand.called).to.be.false; // No command run
    expect(ctx.stubs.error.calledOnce).to.be.true;

    // Check the error message format
    const errorArg = ctx.stubs.error.firstCall.args[0];
    expect(stripAnsi(String(errorArg))).to.include("xyzxyzxyz completely nonexistent command not found");
    expect(stripAnsi(String(errorArg))).to.include("Run ably help for a list of available commands");
  },
);

// Also use a very different command for this test
setupTestContext.it(
  "should show generic help if no close command is found",
  async (ctx: TestContext) => {
    const hookOpts = {
      argv: [],
      config: ctx.config,
      context: ctx.mockContext,
      id: "xyzxyzxyzabc", // Something that won't match anything
    };

    let errorThrown = false;
    try {
      await hook.apply(ctx.mockContext, [hookOpts]);
    } catch {
      errorThrown = true;
    }

    // Verify error was thrown
    expect(errorThrown).to.be.true;
    expect(ctx.stubs.warn.called).to.be.false;
    expect(ctx.stubs.runCommand.called).to.be.false;

    // Verify error was properly logged
    expect(ctx.stubs.error.calledOnce).to.be.true;
    const errorArg = ctx.stubs.error.firstCall.args[0];
    expect(stripAnsi(String(errorArg))).to.include("xyzxyzxyzabc not found");
    expect(stripAnsi(String(errorArg))).to.include("Run ably help for a list of available commands");
  },
);

setupRejectingTestContext.it(
  "should show command help with full help command for missing required arguments",
  async (ctx: TestContext) => {
    // Create a typical error from missing required args
    const missingArgsError = new Errors.CLIError("Missing 1 required arg: channel\nSee more help with --help");
    missingArgsError.oclif = { exit: 1 };

    // Configure the runCommand stub to reject with our error for this specific command
    ctx.stubs.runCommand
      .withArgs("channels:subscribe", [])
      .rejects(missingArgsError);

    const hookOpts = {
      argv: [], // No args provided for channels:subscribe which requires one
      config: ctx.config,
      context: ctx.mockContext,
      id: "channels subscrib", // Typo with space
    };
    ctx.config.topicSeparator = " ";

    // The hook should catch the error and display formatted help
    let errorCaught = false;
    try {
      await hook.apply(ctx.mockContext, [hookOpts]);
    } catch (error: unknown) {
      errorCaught = true;
      // Check that the error message contains the proper text
      const errorMsg = (error as Error).message;
      expect(errorMsg).to.include("Missing 1 required arg: channel");

      // The hook replaces the default help text with a more specific one
      expect(errorMsg).to.include("See more help with:");
      expect(errorMsg).to.include("ably channels subscribe --help");
      expect(errorMsg).not.to.include("See more help with --help");
    }

    // Verify our expectations
    expect(errorCaught).to.be.true;
    expect(ctx.stubs.warn.calledOnce).to.be.true;
    expect(ctx.stubs.runCommand.calledOnceWith("channels:subscribe", [])).to.be.true;

    // Verify usage information was displayed
    expect(ctx.stubs.log.called).to.be.true;

    // Find the log call with USAGE
    let usageCall = false;
    let helpCall = false;

    for (let i = 0; i < ctx.stubs.log.callCount; i++) {
      const callArg = ctx.stubs.log.getCall(i).args[0];
      if (typeof callArg === 'string') {
        if (callArg === '\nUSAGE') {
          usageCall = true;
        }
        if (callArg.includes('See more help with:')) {
          helpCall = true;
        }
      }
    }

    expect(usageCall).to.be.true;
    expect(helpCall).to.be.true;
  },
);

setupTestContext.it(
  "should correctly suggest and run help for a command",
  async (ctx: TestContext) => {
    const hookOpts = {
      argv: [],
      config: ctx.config,
      context: ctx.mockContext,
      id: "hep", // Typo for "help"
    };
    await hook.apply(ctx.mockContext, [hookOpts]);

    expect(ctx.stubs.warn.calledOnce).to.be.true;
    const warnArg = ctx.stubs.warn.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain("hep is not an ably command");
    // Assert runCommand was called with "help" and an empty argv array
    expect(ctx.stubs.runCommand.calledOnceWith("help", [])).to.be.true;
  },
);

// --- Tests using the rejecting context setup ---

setupTestContext
  .it(
  "should attempt suggested command and propagate its error (space input)",
  async (ctx: TestContext) => {
    // Create a typical error from missing required args
    const missingArgsError = new Errors.CLIError("Missing 1 required arg: channel");
    missingArgsError.oclif = { exit: 1 };

    // Configure the runCommand stub to reject with our error for this specific command
    ctx.stubs.runCommand
      .withArgs("channels:subscribe", [])
      .rejects(missingArgsError);

    const hookOpts = {
      argv: [], // No args provided for channels:subscribe which requires one
      config: ctx.config,
      context: ctx.mockContext,
      id: "channels subscrib", // Typo with space
    };
    ctx.config.topicSeparator = " ";

    // We expect the error to be thrown from the hook
    let errorCaught = false;
    try {
      await hook.apply(ctx.mockContext, [hookOpts]);
    } catch (error: unknown) {
      errorCaught = true;
      // Check the error is correctly propagated
      expect((error as Error).message).to.equal("Missing 1 required arg: channel");
    }

    // Verify our expectations
    expect(errorCaught).to.be.true;
    expect(ctx.stubs.warn.calledOnce).to.be.true;
    expect(ctx.stubs.runCommand.calledOnceWith("channels:subscribe", [])).to.be.true;
  },
);

setupTestContext.it(
  "should handle arguments when suggesting commands with a typo",
  async (ctx: TestContext) => {
    // Simulate a command with typo followed by arguments
    // In real CLI execution, the command comes with colons as separators
    const hookOpts = {
      argv: [], // In real CLI execution, argumentss aren't typically in argv
      config: ctx.config,
      context: ctx.mockContext,
      id: "channels:publis:foo:bar", // Real CLI format with colons
    };
    ctx.config.topicSeparator = " ";

    await hook.apply(ctx.mockContext, [hookOpts]);

    expect(ctx.stubs.warn.calledOnce).to.be.true;
    const warnArg = ctx.stubs.warn.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain(
      "channels publis is not an ably command",
    );

    // Should recognize "channels:publis" as typo for "channels:publish"
    // and pass the arguments "foo bar" when running the command
    expect(
      ctx.stubs.runCommand.calledOnceWith("channels:publish", ["foo", "bar"]),
    ).to.be.true;
  },
);
