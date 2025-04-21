import { expect } from "chai";
import { test } from "@oclif/test";

// Add type declaration for global mocks
declare global {

  var __TEST_MOCKS__: {
    ablyRestMock: {
      request: () => any;
      channels: { get: () => any };
      close: () => void;
      connection?: { once: (event: string, cb: () => void) => void };
      [key: string]: any;
    };
    [key: string]: any;
  } | undefined;
}

// Very simple mock for Ably client - minimal implementation
const simpleMockClient = {
  request: () => {
    // Return channel list response
    return {
      statusCode: 200,
      items: [{ channelId: "test-channel-1" }]
    };
  },
  channels: {
    get: () => ({
      history: () => {
        // Return channel history response
        return {
          items: [{ name: "event1", data: { text: "Test message 1" } }]
        };
      }
    })
  },
  // Add connection for Realtime compatibility
  connection: {
    once: (event: string, callback: () => void) => {
      if (event === 'connected') {
        setTimeout(callback, 0);
      }
    }
  },
  close: () => {
    // Mock close method
  }
};

describe('Channels integration tests', function() {
  before(function() {
    // Make the mock globally available
    globalThis.__TEST_MOCKS__ = {
      ablyRestMock: simpleMockClient
    };

    // Set environment variables
    process.env.ABLY_CLI_TEST_MODE = 'true';
    process.env.ABLY_API_KEY = 'test.key:secret';
  });

  after(function() {
    delete globalThis.__TEST_MOCKS__;
    delete process.env.ABLY_CLI_TEST_MODE;
  });

  it('lists active channels', function() {
    return test
      .stdout()
      .command(['channels', 'list'])
      .it('lists active channels', ctx => {
        expect(ctx.stdout).to.contain('test-channel-1');
      });
  });

  it('outputs channels list in JSON format', function() {
    return test
      .stdout()
      .command(['channels', 'list', '--json'])
      .it('outputs channels list in JSON format', ctx => {
        const output = JSON.parse(ctx.stdout);
        expect(output).to.have.property('channels').that.is.an('array');
      });
  });
});
