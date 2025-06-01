import { expect } from 'chai';
import { __testHooks } from '../../src/index.js';

const { takeoverSession, canResumeSession } = __testHooks;

// Mock WebSocket for testing
class MockWebSocket {
  readyState = 1; // OPEN
  terminate() {}
}

describe('terminal-server resume helpers', function () {
  // Set timeout to prevent hanging
  this.timeout(5000);
  
  describe('canResumeSession', function () {
    it('returns false for null resumeId', function () {
      const result = canResumeSession(null, 'hash123');
      expect(result).to.be.false;
    });

    it('returns false for non-existent sessionId', function () {
      const result = canResumeSession('nonexistent', 'hash123');
      expect(result).to.be.false;
    });
  });

  describe('takeoverSession', function () {
    it('takeoverSession replaces websocket and clears timer', function () {
      const oldWs = new MockWebSocket() as MockWebSocket & { terminate: () => void };
      const newWs = new MockWebSocket() as MockWebSocket & { terminate: () => void };

      const mockSession = {
        ws: oldWs,
        orphanTimer: setTimeout(() => {}, 1000),
        lastActivityTime: 0,
        authenticated: true,
        timeoutId: setTimeout(() => {}, 1000),
        sessionId: 'test-session',
        creationTime: Date.now(),
        isAttaching: false,
      } as Partial<{
        ws: MockWebSocket & { terminate: () => void };
        orphanTimer: NodeJS.Timeout | undefined;
        lastActivityTime: number;
        authenticated: boolean;
        timeoutId: NodeJS.Timeout;
        sessionId: string;
        creationTime: number;
        isAttaching: boolean;
      }>;

      // Mock terminate function to track calls
      let terminateCalled = false;
      oldWs.terminate = () => { terminateCalled = true; };

      takeoverSession(mockSession as never, newWs as never);

      expect(terminateCalled).to.be.true;
      expect(mockSession.ws).to.equal(newWs);
      expect(mockSession.orphanTimer).to.be.undefined;
      expect(mockSession.lastActivityTime).to.be.greaterThan(0);
    });
  });
}); 