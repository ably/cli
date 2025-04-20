/* eslint-disable unicorn/prefer-top-level-await */
import { Args, Command, Config, Errors, Flags } from "@oclif/core";
import { expect, test } from "@oclif/test";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as sinon from "sinon";
import { dirname } from "node:path";

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
      load: async () => ({ async run() {} }) as any,
    } as Command.Loadable,
    {
      id: "help",
      load: async () => ({ async run() {} }) as any,
    } as Command.Loadable,
  );
  config.commandIDs.push("channels:subscribe", "channels:publish", "help");
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
        _options: { code?: string; exit: false | number } = { exit: 1 },
      ) {
        // Use the stub directly from context, then throw for test purposes
        ctx.stubs.error(input instanceof Error ? input.message : input);

        // For test purposes, throw the error so it can be caught
        if (input instanceof Error) {
          throw input; // Re-throw the actual error
        } else {
          throw new TypeError(String(input)); // Convert string to Error and throw
        }
      },
      exit: (code?: number) => ctx.stubs.exit(code ?? 0),
      log: ctx.stubs.log,
      warn: ctx.stubs.warn,
    };
  })
  .finally((ctx: TestContext) => {
    // Restore all stubs
    Object.values(ctx.stubs).forEach((stub) => {
      if (stub.restore) stub.restore();
    });
  });

// --- Tests using @oclif/test structure ---

setupTestContext.it(
  "should warn with space separator and run the suggested command (colon input)",
  async (ctx: TestContext) => {
    // User input uses colon, hook should normalize for comparison but display using space
    const hookOpts = {
      argv: [],
      config: ctx.config,
      context: ctx.mockContext,
      id: "channels:pubish", // User typo with colon
    };
    // Set the separator in the test config
    ctx.config.topicSeparator = ' ';

    await hook.apply(ctx.mockContext, [hookOpts]);

    expect(ctx.stubs.warn.calledOnce).to.be.true;
    const warnArg = ctx.stubs.warn.firstCall.args[0];
    // Warning should display the *user's input* formatted with spaces
    expect(stripAnsi(warnArg)).to.contain(
      "channels pubish is not an ably command",
    );
    // runCommand still uses the canonical colon-separated ID
    expect(ctx.stubs.runCommand.calledOnceWith("channels:publish", [])).to.be.true;
  },
);

setupTestContext.it(
  "should warn with space separator and run the suggested command (space input)",
  async (ctx: TestContext) => {
    // User input uses space
    const hookOpts = {
      argv: [],
      config: ctx.config,
      context: ctx.mockContext,
      id: "channels pubish", // User typo with space
    };
    // Set the separator in the test config
    ctx.config.topicSeparator = ' ';

    await hook.apply(ctx.mockContext, [hookOpts]);

    expect(ctx.stubs.warn.calledOnce).to.be.true;
    const warnArg = ctx.stubs.warn.firstCall.args[0];
    // Warning should display the user's input as is (with spaces)
    expect(stripAnsi(warnArg)).to.contain(
      "channels pubish is not an ably command",
    );
    // runCommand still uses the canonical colon-separated ID
    expect(ctx.stubs.runCommand.calledOnceWith("channels:publish", [])).to.be.true;
  },
);

setupTestContext.it(
  "should pass arguments to the suggested command (space input)",
  async (ctx: TestContext) => {
    // User input uses space
    const hookOpts = {
      argv: ["my-arg1", "--flag"], // Args passed separately
      config: ctx.config,
      context: ctx.mockContext,
      id: "channels publsh", // Typo with space
    };
     // Set the separator in the test config
    ctx.config.topicSeparator = ' ';

    await hook.apply(ctx.mockContext, [hookOpts]);

    expect(ctx.stubs.warn.calledOnce).to.be.true;
    const warnArg = ctx.stubs.warn.firstCall.args[0];
    // Warning displays user input with space
    expect(stripAnsi(warnArg)).to.contain(
      "channels publsh is not an ably command",
    );
    // runCommand uses colon ID, argv is passed correctly
    expect(
      ctx.stubs.runCommand.calledOnceWith("channels:publish", [
        "my-arg1",
        "--flag",
      ]),
    ).to.be.true;
  },
);

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
      // This stub specifically rejects
      runCommand: sinon
        .stub(Config.prototype, "runCommand")
        .rejects(new Errors.CLIError("Missing 1 required arg: channel")),
    };
  })
  .do((ctx: TestContext) => {
    // Create mock context for the hook
    ctx.mockContext = {
      config: ctx.config,
      debug: sinon.stub(),
      error(
        input: Error | string,
        _options: { code?: string; exit: false | number } = { exit: 1 },
      ) {
        ctx.stubs.error(input instanceof Error ? input.message : input);

        // For test purposes, throw the error so it can be caught
        if (input instanceof Error) {
          throw input; // Re-throw the actual error
        } else {
          throw new TypeError(String(input)); // Convert string to Error and throw
        }
      },
      exit: (code?: number) => ctx.stubs.exit(code ?? 0),
      log: ctx.stubs.log,
      warn: ctx.stubs.warn,
    };
  })
  .finally((ctx: TestContext) => {
    // Restore all stubs
    Object.values(ctx.stubs).forEach((stub) => {
      if (stub.restore) stub.restore();
    });
  });

setupRejectingTestContext.it(
  "should re-throw CLIError when suggested command fails missing args (space input)",
  async (ctx: TestContext) => {
    const hookOpts = {
      argv: [], // No args provided for channels:subscribe which requires one
      config: ctx.config,
      context: ctx.mockContext,
      id: "channels subscrib", // Typo with space
    };
    // Set the separator in the test config
    ctx.config.topicSeparator = ' ';

    let caughtError: any = null;
    try {
      await hook.apply(ctx.mockContext, [hookOpts]);
    } catch (error: any) {
      caughtError = error;
    }

    expect(ctx.stubs.warn.calledOnce).to.be.true;
    const warnArg = ctx.stubs.warn.firstCall.args[0];
    // Warning displays user input with space
    expect(stripAnsi(warnArg)).to.contain(
      "channels subscrib is not an ably command",
    );
    // Ensure runCommand was called with the correct colon-separated ID
    expect(ctx.stubs.runCommand.calledOnceWith("channels:subscribe", [])).to.be
      .true;
    // Ensure the specific CLIError was re-thrown by the hook's error handler
    expect(caughtError).to.be.instanceOf(Errors.CLIError);
    expect(caughtError.message).to.contain("Missing 1 required arg");
    // Ensure the mockContext.error stub was called (which throws in tests)
    expect(ctx.stubs.error.calledOnce).to.be.true;
  },
);

setupTestContext.it(
  "should error correctly for completely unknown command (space input)",
  async (ctx: TestContext) => {
    const hookOpts = {
      argv: [],
      config: ctx.config,
      context: ctx.mockContext,
      id: "very wrong command", // Input with space, no close match
    };
     // Set the separator in the test config
    ctx.config.topicSeparator = ' ';

    let caughtError: any = null;
    try {
      await hook.apply(ctx.mockContext, [hookOpts]);
    } catch (error: any) {
      caughtError = error;
    }

    expect(ctx.stubs.warn.called).to.be.false; // No warning as no suggestion
    expect(ctx.stubs.runCommand.called).to.be.false; // No command run
    expect(caughtError).to.be.instanceOf(TypeError); // Thrown by mockContext.error
    // Error message displays user input as is
    expect(stripAnsi(caughtError.message)).to.equal(
      "Command very wrong command not found. Run ably help for a list of available commands.",
    );
  },
);

setupTestContext.it(
  "should correctly suggest and run help for a command",
  async (ctx: TestContext) => {
    const hookOpts = {
      argv: [],
      config: ctx.config,
      context: ctx.mockContext,
      id: "hep",
    };
    await hook.apply(ctx.mockContext, [hookOpts]);

    expect(ctx.stubs.warn.calledOnce).to.be.true;
    const warnArg = ctx.stubs.warn.firstCall.args[0];
    expect(stripAnsi(warnArg)).to.contain("hep is not an ably command");
    expect(ctx.stubs.runCommand.calledOnceWith("help", [])).to.be.true;
  },
);

setupTestContext.it(
  "should show generic help if no close command is found",
  async (ctx: TestContext) => {
    const hookOpts = {
      argv: [],
      config: ctx.config,
      context: ctx.mockContext,
      id: "verywrongcommand",
    };

    // Since we now throw errors directly, we need to catch them here
    let errorThrown = false;
    try {
      await hook.apply(ctx.mockContext, [hookOpts]);
    } catch {
      // Error is expected to be thrown, just catch it
      errorThrown = true;
    }

    expect(ctx.stubs.warn.called).to.be.false;
    expect(ctx.stubs.error.calledOnce).to.be.true;
    const errorArg = ctx.stubs.error.firstCall.args[0];
    expect(stripAnsi(errorArg)).to.contain(
      "Command verywrongcommand not found. Run ably help for a list of available commands.",
    );
    expect(errorThrown).to.be.true; // Check that an error was thrown
    expect(ctx.stubs.runCommand.called).to.be.false;
  },
);
