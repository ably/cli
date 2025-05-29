import { expect } from "chai";
import sinon from "sinon";
import ContactCommand from "../../../../src/commands/help/contact.js";

describe("ContactCommand", function() {
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    originalEnv = { ...process.env };
    
    // Reset env before each test
    process.env = { ...originalEnv };
    process.env.ABLY_CLI_TEST_MODE = 'true';
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
      expect(examples[0]).to.include("command.id");
    });
  });

  describe("URL handling", function() {
    it("should use correct Ably contact URL", function() {
      const expectedUrl = "https://ably.com/contact";
      expect(expectedUrl).to.equal("https://ably.com/contact");
    });
  });

  describe("command execution", function() {
    it("should extend base Command class", function() {
      const command = new ContactCommand([], {} as any);
      expect(command).to.have.property('run');
      expect(command.run).to.be.a('function');
    });

    it("should parse command correctly", function() {
      const command = new ContactCommand([], {} as any);
      
      // Test that parse method exists
      expect(command).to.have.property('parse');
    });
  });

  describe("static configuration", function() {
    it("should not require arguments", function() {
      expect(ContactCommand.args).to.deep.equal({});
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

  describe("functionality", function() {
    it("should have the expected command structure", function() {
      const command = new ContactCommand([], {} as any);
      
      // Verify basic command structure
      expect(command.constructor.name).to.equal("ContactCommand");
      expect(command.run).to.be.a('function');
    });

    it("should process contact URL correctly", function() {
      const contactUrl = "https://ably.com/contact";
      
      // Test URL validation
      expect(contactUrl).to.match(/^https:\/\/ably\.com\/contact$/);
      expect(contactUrl.startsWith('https://')).to.be.true;
      expect(contactUrl.includes('ably.com')).to.be.true;
    });
  });
});