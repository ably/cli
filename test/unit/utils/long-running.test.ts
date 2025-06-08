import { expect } from "chai";
import sinon from "sinon";
import { waitUntilInterruptedOrTimeout } from "../../../src/utils/long-running.js";

describe("waitUntilInterruptedOrTimeout", function() {
  let processOnStub: sinon.SinonStub;
  let processRemoveListenerStub: sinon.SinonStub;

  beforeEach(function() {
    // Stub the process event methods we need
    processOnStub = sinon.stub(process, 'on');
    processRemoveListenerStub = sinon.stub(process, 'removeListener');
  });

  afterEach(function() {
    sinon.restore();
  });

  describe("timeout behavior", function() {
    it("should resolve with 'timeout' after specified duration", async function() {
      const startTime = Date.now();
      const duration = 0.1; // 100ms
      
      const result = await waitUntilInterruptedOrTimeout(duration);
      const endTime = Date.now();
      
      expect(result).to.equal("timeout");
      expect(endTime - startTime).to.be.greaterThanOrEqual(90); // Allow some tolerance
      expect(endTime - startTime).to.be.lessThan(200); // But not too much
    });

    it("should resolve with 'timeout' when duration is 0.5 seconds", async function() {
      const startTime = Date.now();
      const duration = 0.5; // 500ms
      
      const result = await waitUntilInterruptedOrTimeout(duration);
      const endTime = Date.now();
      
      expect(result).to.equal("timeout");
      expect(endTime - startTime).to.be.greaterThanOrEqual(450);
      expect(endTime - startTime).to.be.lessThan(600);
    });

    it("should run indefinitely when no duration specified", async function() {
      let sigintHandler: () => void;
      let _sigtermHandler: () => void;
      
      // Capture the event handlers when they're registered
      processOnStub.callsFake((event: string, handler: () => void) => {
        if (event === "SIGINT") sigintHandler = handler;
        if (event === "SIGTERM") _sigtermHandler = handler;
      });
      
      let resolved = false;
      let result: string | undefined;
      
      // Start the function without duration
      const promise = waitUntilInterruptedOrTimeout().then((res) => {
        resolved = true;
        result = res;
      });
      
      // Wait a bit to ensure it doesn't resolve on its own
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(resolved).to.be.false;
      
      // Now simulate SIGINT by calling the handler
      sigintHandler!();
      
      // Wait for resolution
      await promise;
      
      expect(resolved).to.be.true;
      expect(result).to.equal("signal");
    });

    it("should run indefinitely when duration is 0", async function() {
      let _sigintHandler: () => void;
      let sigtermHandler: () => void;
      
      // Capture the event handlers when they're registered
      processOnStub.callsFake((event: string, handler: () => void) => {
        if (event === "SIGINT") _sigintHandler = handler;
        if (event === "SIGTERM") sigtermHandler = handler;
      });
      
      let resolved = false;
      let result: string | undefined;
      
      // Start the function with duration 0
      const promise = waitUntilInterruptedOrTimeout(0).then((res) => {
        resolved = true;
        result = res;
      });
      
      // Wait a bit to ensure it doesn't resolve on its own
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(resolved).to.be.false;
      
      // Now simulate SIGTERM by calling the handler
      sigtermHandler!();
      
      // Wait for resolution
      await promise;
      
      expect(resolved).to.be.true;
      expect(result).to.equal("signal");
    });

    it("should run indefinitely when duration is undefined", async function() {
      let sigintHandler: () => void;
      
      // Capture the event handlers when they're registered
      processOnStub.callsFake((event: string, handler: () => void) => {
        if (event === "SIGINT") sigintHandler = handler;
      });
      
      let resolved = false;
      let result: string | undefined;
      
      // Start the function with undefined duration
      const promise = waitUntilInterruptedOrTimeout().then((res) => {
        resolved = true;
        result = res;
      });
      
      // Wait a bit to ensure it doesn't resolve on its own
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(resolved).to.be.false;
      
      // Now simulate SIGINT
      sigintHandler!();
      
      // Wait for resolution
      await promise;
      
      expect(resolved).to.be.true;
      expect(result).to.equal("signal");
    });
  });

  describe("signal behavior", function() {
    it("should resolve with 'signal' on SIGINT", async function() {
      let sigintHandler: () => void;
      
      // Capture the event handlers when they're registered
      processOnStub.callsFake((event: string, handler: () => void) => {
        if (event === "SIGINT") sigintHandler = handler;
      });
      
      let resolved = false;
      let result: string | undefined;
      
      // Start the function with a long duration
      const promise = waitUntilInterruptedOrTimeout(10).then((res) => {
        resolved = true;
        result = res;
      });
      
      // Wait a bit then send signal
      await new Promise(resolve => setTimeout(resolve, 50));
      sigintHandler!();
      
      // Wait for resolution
      await promise;
      
      expect(resolved).to.be.true;
      expect(result).to.equal("signal");
    });

    it("should resolve with 'signal' on SIGTERM", async function() {
      let sigtermHandler: () => void;
      
      // Capture the event handlers when they're registered
      processOnStub.callsFake((event: string, handler: () => void) => {
        if (event === "SIGTERM") sigtermHandler = handler;
      });
      
      let resolved = false;
      let result: string | undefined;
      
      // Start the function with a long duration
      const promise = waitUntilInterruptedOrTimeout(10).then((res) => {
        resolved = true;
        result = res;
      });
      
      // Wait a bit then send signal
      await new Promise(resolve => setTimeout(resolve, 50));
      sigtermHandler!();
      
      // Wait for resolution
      await promise;
      
      expect(resolved).to.be.true;
      expect(result).to.equal("signal");
    });

    it("should clean up event listeners when resolving via signal", async function() {
      let sigintHandler: () => void;
      
      // Capture the event handlers when they're registered
      processOnStub.callsFake((event: string, handler: () => void) => {
        if (event === "SIGINT") sigintHandler = handler;
      });
      
      // Start the function
      const promise = waitUntilInterruptedOrTimeout(10);
      
      // Wait a bit then send signal
      await new Promise(resolve => setTimeout(resolve, 50));
      sigintHandler!();
      
      // Wait for resolution
      const result = await promise;
      
      expect(result).to.equal("signal");
      
      // Verify removeListener was called for both events using sinon assertions
      expect(processRemoveListenerStub.calledWith("SIGINT")).to.be.true;
      expect(processRemoveListenerStub.calledWith("SIGTERM")).to.be.true;
    });

    it("should clean up event listeners when resolving via timeout", async function() {
      // Start the function with short duration
      const promise = waitUntilInterruptedOrTimeout(0.1);
      
      // Wait for resolution
      const result = await promise;
      
      expect(result).to.equal("timeout");
      
      // Verify removeListener was called for both events using sinon assertions
      expect(processRemoveListenerStub.calledWith("SIGINT")).to.be.true;
      expect(processRemoveListenerStub.calledWith("SIGTERM")).to.be.true;
    });
  });

  describe("environment variable fallback", function() {
    let originalEnv: string | undefined;

    beforeEach(function() {
      originalEnv = process.env.ABLY_CLI_DEFAULT_DURATION;
    });

    afterEach(function() {
      if (originalEnv === undefined) {
        delete process.env.ABLY_CLI_DEFAULT_DURATION;
      } else {
        process.env.ABLY_CLI_DEFAULT_DURATION = originalEnv;
      }
    });

    it("should use environment variable when no duration provided", async function() {
      // Set environment variable
      process.env.ABLY_CLI_DEFAULT_DURATION = "0.1"; // 100ms
      
      const startTime = Date.now();
      const result = await waitUntilInterruptedOrTimeout();
      const endTime = Date.now();
      
      expect(result).to.equal("timeout");
      expect(endTime - startTime).to.be.greaterThanOrEqual(90);
      expect(endTime - startTime).to.be.lessThan(200);
    });

    it("should ignore environment variable when explicit duration provided", async function() {
      // Set environment variable to a different value
      process.env.ABLY_CLI_DEFAULT_DURATION = "10";
      
      const startTime = Date.now();
      const result = await waitUntilInterruptedOrTimeout(0.1); // 100ms explicit
      const endTime = Date.now();
      
      expect(result).to.equal("timeout");
      expect(endTime - startTime).to.be.greaterThanOrEqual(90);
      expect(endTime - startTime).to.be.lessThan(200); // Should use explicit 100ms, not env 10s
    });

    it("should run indefinitely when env var is 0", async function() {
      process.env.ABLY_CLI_DEFAULT_DURATION = "0";
      
      let sigintHandler: () => void;
      
      // Capture the event handlers when they're registered
      processOnStub.callsFake((event: string, handler: () => void) => {
        if (event === "SIGINT") sigintHandler = handler;
      });
      
      let resolved = false;
      
      const promise = waitUntilInterruptedOrTimeout().then(() => {
        resolved = true;
      });
      
      // Wait a bit to ensure it doesn't resolve on its own
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(resolved).to.be.false;
      
      // Now simulate SIGINT to clean up
      sigintHandler!();
      await promise;
    });
  });

  describe("edge cases", function() {
    it("should handle multiple signals gracefully (only resolve once)", async function() {
      let sigintHandler: () => void;
      let sigtermHandler: () => void;
      let resolveCount = 0;
      
      // Capture the event handlers when they're registered
      processOnStub.callsFake((event: string, handler: () => void) => {
        if (event === "SIGINT") sigintHandler = handler;
        if (event === "SIGTERM") sigtermHandler = handler;
      });
      
      const promise = waitUntilInterruptedOrTimeout(10).then((result) => {
        resolveCount++;
        return result;
      });
      
      // Wait a bit then send multiple signals
      await new Promise(resolve => setTimeout(resolve, 50));
      sigintHandler!();
      sigtermHandler!();
      sigintHandler!();
      
      const result = await promise;
      
      // Should only resolve once
      expect(resolveCount).to.equal(1);
      expect(result).to.equal("signal");
    });

    it("should handle very short durations", async function() {
      const result = await waitUntilInterruptedOrTimeout(0.001); // 1ms
      expect(result).to.equal("timeout");
    });

    it("should handle negative durations as indefinite", async function() {
      let sigintHandler: () => void;
      
      // Capture the event handlers when they're registered
      processOnStub.callsFake((event: string, handler: () => void) => {
        if (event === "SIGINT") sigintHandler = handler;
      });
      
      let resolved = false;
      
      const promise = waitUntilInterruptedOrTimeout(-1).then(() => {
        resolved = true;
      });
      
      // Wait a bit to ensure it doesn't resolve on its own
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(resolved).to.be.false;
      
      // Clean up with signal
      sigintHandler!();
      await promise;
    });
  });
}); 