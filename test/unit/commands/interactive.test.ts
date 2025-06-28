import { expect, test } from '@oclif/test';
import sinon from 'sinon';
import { ChildProcess } from 'child_process';
import Interactive from '../../../src/commands/interactive.js';
import { Config } from '@oclif/core';

describe('commands:interactive', () => {
  let sandbox: sinon.SinonSandbox;
  let forkStub: sinon.SinonStub;
  let mockWorker: Partial<ChildProcess>;
  let readlineInterface: any;
  let consoleLogStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock console methods
    consoleLogStub = sandbox.stub(console, 'log');
    consoleErrorStub = sandbox.stub(console, 'error');

    // Create mock worker with proper typing
    mockWorker = {
      send: sandbox.stub() as any,
      kill: sandbox.stub() as any,
      on: sandbox.stub() as any,
      once: sandbox.stub() as any,
      removeListener: sandbox.stub() as any,
    };

    // Mock fork to return our mock worker
    forkStub = sandbox.stub();
    forkStub.returns(mockWorker as ChildProcess);

    // Mock readline interface
    readlineInterface = {
      prompt: sandbox.stub(),
      pause: sandbox.stub(),
      resume: sandbox.stub(),
      close: sandbox.stub(),
      write: sandbox.stub(),
      on: sandbox.stub(),
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('command setup', () => {
    test
      .stdout()
      .stub(Interactive.prototype as any, 'setupReadline', () => {})
      .stub(process, 'exit', () => {})
      .command(['interactive'])
      .it('shows welcome message', (ctx) => {
        expect(consoleLogStub.calledWith('Welcome to Ably interactive shell. Type "exit" to quit.')).to.be.true;
      });

    it('should be hidden from help', () => {
      expect(Interactive.hidden).to.be.true;
    });

    it('should have correct description', () => {
      expect(Interactive.description).to.equal('Launch interactive Ably shell (experimental)');
    });
  });

  describe('worker management', () => {
    let interactive: Interactive;

    beforeEach(async () => {
      // Create instance
      interactive = new Interactive([], {} as Config);
      (interactive as any).rl = readlineInterface;
      (interactive as any).fork = forkStub;
    });

    it('should create worker on first keypress', async () => {
      // Setup worker ready response
      (mockWorker.once as sinon.SinonStub).callsFake((event, callback) => {
        if (event === 'message') {
          // Simulate worker ready message
          callback({ type: 'ready' });
        }
      });

      const workerPromise = (interactive as any).ensureWorker();
      await workerPromise;

      expect(forkStub.calledOnce).to.be.true;
      expect((interactive as any).worker).to.equal(mockWorker);
      expect((interactive as any).workerReady).to.be.true;
    });

    it('should reuse existing worker if already created', async () => {
      // Set up existing worker
      (interactive as any).worker = mockWorker;
      (interactive as any).workerReady = true;

      await (interactive as any).ensureWorker();

      // Fork should not be called again
      expect(forkStub.called).to.be.false;
    });

    it('should handle worker initialization timeout', async () => {
      // Don't send ready message
      (mockWorker.once as sinon.SinonStub).callsFake(() => {});

      try {
        await (interactive as any).ensureWorker();
        expect.fail('Should have thrown timeout error');
      } catch (error: any) {
        expect(error.message).to.equal('Worker initialization timeout');
      }
    });

    it('should set idle timer after worker creation', async () => {
      const setTimeoutStub = sandbox.stub(global, 'setTimeout');
      
      (mockWorker.once as sinon.SinonStub).callsFake((event, callback) => {
        if (event === 'message') {
          callback({ type: 'ready' });
        }
      });

      await (interactive as any).ensureWorker();

      expect(setTimeoutStub.called).to.be.true;
      expect(setTimeoutStub.firstCall.args[1]).to.equal(30000); // 30 seconds
    });
  });

  describe('command execution', () => {
    let interactive: Interactive;

    beforeEach(async () => {
      interactive = new Interactive([], {} as Config);
      (interactive as any).rl = readlineInterface;
      (interactive as any).fork = forkStub;
      (interactive as any).worker = mockWorker;
      (interactive as any).workerReady = true;
    });

    it('should handle exit command', async () => {
      await (interactive as any).handleCommand('exit');
      expect(readlineInterface.close.calledOnce).to.be.true;
    });

    it('should handle .exit command', async () => {
      await (interactive as any).handleCommand('.exit');
      expect(readlineInterface.close.calledOnce).to.be.true;
    });

    it('should handle empty command', async () => {
      await (interactive as any).handleCommand('');
      expect(readlineInterface.prompt.calledOnce).to.be.true;
      expect(mockWorker.send).not.to.have.been.called;
    });

    it('should execute command through worker', async () => {
      // Setup worker response
      (mockWorker.on as sinon.SinonStub).callsFake((event, handler) => {
        if (event === 'message') {
          // Simulate successful command execution
          setTimeout(() => handler({ type: 'result', data: { exitCode: 0 } }), 10);
        }
      });

      await (interactive as any).handleCommand('apps list');

      expect(mockWorker.send).to.have.been.calledWith({
        type: 'execute',
        args: ['apps', 'list']
      });
      expect(readlineInterface.pause.calledOnce).to.be.true;
      expect(readlineInterface.resume.calledOnce).to.be.true;
      expect(readlineInterface.prompt.called).to.be.true;
    });

    it('should handle command execution error', async () => {
      // Setup worker error response
      (mockWorker.on as sinon.SinonStub).callsFake((event, handler) => {
        if (event === 'message') {
          setTimeout(() => handler({ 
            type: 'result', 
            data: { exitCode: 1, error: 'Command not found' } 
          }), 10);
        }
      });

      await (interactive as any).handleCommand('invalid-command');

      expect(consoleErrorStub.calledWith('Error: Command not found')).to.be.true;
    });
  });

  describe('signal handling', () => {
    let interactive: Interactive;

    beforeEach(() => {
      interactive = new Interactive([], {} as Config);
      (interactive as any).rl = readlineInterface;
      (interactive as any).worker = mockWorker;
    });

    it('should send interrupt to worker when command is running', () => {
      (interactive as any).commandRunning = true;

      (interactive as any).handleSigInt();

      expect(mockWorker.send).to.have.been.calledWith({ type: 'interrupt' });
      expect(consoleLogStub.calledWith('^C')).to.be.true;
    });

    it('should clear line and re-prompt when no command is running', () => {
      (interactive as any).commandRunning = false;

      (interactive as any).handleSigInt();

      expect(readlineInterface.write.calledWith('', { ctrl: true, name: 'u' })).to.be.true;
      expect(readlineInterface.write.calledWith('\n')).to.be.true;
      expect(readlineInterface.prompt.calledOnce).to.be.true;
    });
  });

  describe('cleanup', () => {
    let interactive: Interactive;
    let clearTimeoutStub: sinon.SinonStub;

    beforeEach(() => {
      interactive = new Interactive([], {} as Config);
      (interactive as any).worker = mockWorker;
      (interactive as any).idleTimer = setTimeout(() => {}, 1000);
      clearTimeoutStub = sandbox.stub(global, 'clearTimeout');
    });

    it('should clean up resources on exit', () => {
      (interactive as any).cleanup();

      expect(clearTimeoutStub.calledOnce).to.be.true;
      expect(mockWorker.kill).to.have.been.calledOnce;
      expect(consoleLogStub.calledWith('\nGoodbye!')).to.be.true;
    });
  });

  describe('command parsing', () => {
    let interactive: Interactive;

    beforeEach(() => {
      interactive = new Interactive([], {} as Config);
    });

    it('should parse simple commands', () => {
      const args = (interactive as any).parseCommand('apps list');
      expect(args).to.deep.equal(['apps', 'list']);
    });

    it('should parse commands with multiple arguments', () => {
      const args = (interactive as any).parseCommand('channels publish my-channel hello');
      expect(args).to.deep.equal(['channels', 'publish', 'my-channel', 'hello']);
    });

    // TODO: Add tests for quoted strings when implemented
  });
});