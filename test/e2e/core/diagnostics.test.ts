import { expect } from 'chai';
import { runBackgroundProcessAndGetOutput, forceExit, cleanupTrackedResources, testOutputFiles, testCommands, displayTestFailureDebugOutput } from '../../helpers/e2e-test-helper.js';

// Public terminal server endpoint
const PUBLIC_TERMINAL_SERVER_URL = 'wss://web-cli.ably.com';

describe('Client-Side Diagnostic Tests (Public Endpoint)', function() {
  before(function() {
    process.on('SIGINT', forceExit);
  });

  after(function() {
    process.removeListener('SIGINT', forceExit);
  });

  beforeEach(function() {
    this.timeout(120000); // 2 minutes per individual test
    // Clear tracked output files and commands for this test
    testOutputFiles.clear();
    testCommands.length = 0;
  });

  afterEach(async function() {
    if (this.currentTest?.state === 'failed') {
      await displayTestFailureDebugOutput(this.currentTest?.title);
    }
    await cleanupTrackedResources();
  });

  it('diagnostics:server script should complete successfully against public server', async function() {
    try {
      const result = await runBackgroundProcessAndGetOutput(
        `pnpm diagnostics:server ${PUBLIC_TERMINAL_SERVER_URL}`,
        180000 // 3 minutes timeout
      );
      
      if (result.stderr && !result.stderr.includes('Debugger') && !result.stderr.includes('deprecated') && !result.stderr.includes('Warning:')) {
        console.error('--- diagnostics:server stderr (non-fatal) ---');
        console.error(result.stderr);
      }
      
      expect(result.exitCode).to.equal(0);
      expect(result.stdout).to.include('Diagnostics successful!');
    } catch (error: any) {
      console.error('diagnostics:server test against public endpoint failed:');
      if (error.stdout) console.log('Failed command stdout:', error.stdout);
      if (error.stderr) console.error('Failed command stderr:', error.stderr);
      throw error;
    }
  });
}); 