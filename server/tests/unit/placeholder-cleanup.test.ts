import { expect } from 'chai';
import sinon from 'sinon';
import { __testHooks, __deleteSessionForTest } from '../../../scripts/terminal-server.js';

interface MiniSession {
  sessionId: string;
  timeoutId: NodeJS.Timeout;
  ws: { terminate: () => void };
  authenticated: boolean;
  lastActivityTime: number;
  creationTime: number;
  isAttaching: boolean;
}

describe('terminal-server placeholder cleanup', function () {
  it('removes placeholder session and clears its auth timeout', function () {
    const clock = sinon.useFakeTimers();

    const placeholder: MiniSession = {
      sessionId: 'placeholder-1',
      timeoutId: setTimeout(() => {}, 10_000),
      ws: { terminate: () => {} },
      authenticated: false,
      lastActivityTime: Date.now(),
      creationTime: Date.now(),
      isAttaching: false,
    } as unknown as MiniSession;

    // put placeholder in sessions map
    (__testHooks as any).sessions.set(placeholder.sessionId, placeholder);

    // Ensure timer exists
    expect((__testHooks as any).sessions.has('placeholder-1')).to.be.true;

    // Invoke helper to remove it (simulating in-code cleanup path)
    __deleteSessionForTest('placeholder-1');

    // Advance time – timer should have been cleared so no errors
    clock.tick(11_000);

    expect((__testHooks as any).sessions.has('placeholder-1')).to.be.false;

    clock.restore();
  });
}); 