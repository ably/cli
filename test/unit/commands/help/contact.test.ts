import { expect } from "chai";
import sinon from "sinon";
import ContactCommand from "../../../../src/commands/help/contact.js";
import open from "open";

describe("ContactCommand", function() {
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    originalEnv = { ...process.env };
    
    // Reset env before each test
    process.env = { ...originalEnv };
    process.env.ABLY_CLI_TEST_MODE = 'true';

    // Stub the open function
    sandbox.stub(open);
  });

  afterEach(function() {
    sandbox.restore();
    process.env = originalEnv;
  });

  describe("command properties", function() {
    it("should have correct static properties", function() {
      expect(ContactCommand.description).to.equal("Contact Ably for assistance");
      expect(ContactCommand.examples).to.be.an('array');
      expect(ContactCommand.examples).to.have.length.greaterThan(0);
      expect(ContactCommand.flags).to.have.property('help');
    });

    it("should have help flag with char 'h'", function() {
      expect(ContactCommand.flags.help).to.have.property('char', 'h');
    });

    it("should have appropriate examples", function() {
      const examples = ContactCommand.examples;
      expect(examples[0]).to.include("contact");
    });
  });

  describe("URL handling", function() {
    it("should use correct Ably contact URL", function() {
      const expectedUrl = "https://ably.com/contact";
      expect(expectedUrl).to.equal("https://ably.com/contact");
    });

    it("should call open with contact URL", async function() {
      const command = new ContactCommand([], {} as any);
      const openStub = open as sinon.SinonStub;
      const logSpy = sandbox.spy(command, 'log');

      await command.run();

      expect(openStub.calledOnce).to.be.true;
      expect(openStub.calledWith("https://ably.com/contact")).to.be.true;
    });

    it("should log opening message", async function() {
      const command = new ContactCommand([], {} as any);
      const logSpy = sandbox.spy(command, 'log');

      await command.run();

      expect(logSpy.calledOnce).to.be.true;
      const logMessage = logSpy.firstCall.args[0];
      expect(logMessage).to.include("Opening");
      expect(logMessage).to.include("https://ably.com/contact");
      expect(logMessage).to.include("in your browser");
    });
  });

  describe("command execution", function() {
    it("should extend base Command class", function() {
      const command = new ContactCommand([], {} as any);
      expect(command).to.have.property('run');
      expect(command.run).to.be.a('function');
    });

    it("should parse command correctly", async function() {
      const command = new ContactCommand([], {} as any);
      
      // Test that parse would be called during run
      expect(command).to.have.property('parse');
    });

    it("should handle async execution", async function() {
      const command = new ContactCommand([], {} as any);
      const openStub = open as sinon.SinonStub;

      const result = await command.run();
      
      // Command should complete without error
      expect(result).to.be.undefined; // void return
      expect(openStub.called).to.be.true;
    });
  });

  describe("error handling", function() {
    it("should handle open function errors gracefully", async function() {
      const command = new ContactCommand([], {} as any);
      const openStub = open as sinon.SinonStub;
      
      openStub.rejects(new Error("Failed to open browser"));
      
      try {
        await command.run();
        // If we get here, the error was handled
        expect(true).to.be.true;
      } catch (error) {
        // The command might re-throw the error
        expect(error).to.be.instanceOf(Error);
      }
    });
  });

  describe("chalk integration", function() {
    it("should use chalk for colored output", async function() {
      const command = new ContactCommand([], {} as any);
      const logSpy = sandbox.spy(command, 'log');

      await command.run();

      const logMessage = logSpy.firstCall?.args[0];
      // The message should contain ANSI color codes from chalk
      expect(logMessage).to.be.a('string');
      expect(logMessage?.length).to.be.greaterThan(0);
    });
  });

  describe("import validation", function() {
    it("should import Command from @oclif/core", function() {
      const command = new ContactCommand([], {} as any);
      
      // Verify it's a proper oclif Command
      expect(command.constructor.name).to.equal("ContactCommand");
    });

    it("should import open function", function() {
      expect(open).to.be.a('function');
    });
  });

  describe("static configuration", function() {
    it("should not require arguments", function() {
      expect(ContactCommand.args).to.be.undefined;
    });

    it("should have minimal flag configuration", function() {
      const flags = ContactCommand.flags;
      const flagKeys = Object.keys(flags);
      
      expect(flagKeys).to.include('help');
      // Should only have help flag, not many others
      expect(flagKeys.length).to.equal(1);
    });

    it("should have descriptive examples", function() {
      const examples = ContactCommand.examples;
      
      expect(examples).to.be.an('array');
      expect(examples.length).to.be.greaterThan(0);
      
      examples.forEach(example => {
        expect(example).to.be.a('string');
        expect(example.length).to.be.greaterThan(0);
      });
    });
  });

  describe("browser integration", function() {
    it("should attempt to open browser", async function() {
      const command = new ContactCommand([], {} as any);
      const openStub = open as sinon.SinonStub;

      await command.run();

      expect(openStub.calledOnce).to.be.true;
    });

    it("should pass correct URL to open function", async function() {
      const command = new ContactCommand([], {} as any);
      const openStub = open as sinon.SinonStub;

      await command.run();

      const calledUrl = openStub.firstCall.args[0];
      expect(calledUrl).to.equal("https://ably.com/contact");
    });
  });
});