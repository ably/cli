import { expect } from 'chai';
import sinon from 'sinon';
import { __testHooks } from '../../../scripts/terminal-server.js';

// Minimal ClientSession type for testing purposes (duplicate subset)
interface MiniSession {
  sessionId: string;
  ws: { terminate: () => void };
  lastActivityTime: number;
  creationTime: number;
  isAttaching: boolean;
  credentialHash: string;
  outputBuffer: string[];
  orphanTimer?: NodeJS.Timeout;
}

describe('terminal-server resume helpers', function () {
  it('scheduleOrphanCleanup sets timer that triggers terminateSession', async function () {
    // use fake timers
    const clock = sinon.useFakeTimers();
    const session: MiniSession = {
      sessionId: 's1',
      ws: { terminate: () => {} },
      lastActivityTime: Date.now(),
      creationTime: Date.now(),
      isAttaching: false,
      credentialHash: 'abc',
      outputBuffer: [],
    } as unknown as MiniSession;

    // Observe cleanup by checking sessions map
    const { sessions } = __testHooks as any;
    sessions.set(session.sessionId, session as any);

    __testHooks.scheduleOrphanCleanup(session as any);
    expect(session.orphanTimer).to.exist;

    clock.tick(61_000);
    expect(sessions.has('s1')).to.be.false;

    clock.restore();
  });

  it('takeoverSession replaces websocket and clears timer', function () {
    const wsOld = { readyState: 1, terminate: sinon.spy() } as any; // OPEN =1
    const wsNew = { readyState: 1, terminate: sinon.spy() } as any;

    const session: any = {
      sessionId: 'take1',
      ws: wsOld,
      orphanTimer: setTimeout(() => {}, 60_000),
      lastActivityTime: 0,
    };

    (__testHooks as any).takeoverSession(session, wsNew);

    expect(wsOld.terminate.calledOnce).to.be.true;
    expect(session.ws).to.equal(wsNew);
    expect(session.orphanTimer).to.be.undefined;
  });

  it('canResumeSession returns false when sessionId is unknown', function () {
    const hash = 'deadbeef';
    const result = (__testHooks as any).canResumeSession('does-not-exist', hash);
    expect(result).to.be.false;
  });
}); 