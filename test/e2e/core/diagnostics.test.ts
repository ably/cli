import { expect } from 'chai';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Public terminal server endpoint
const PUBLIC_TERMINAL_SERVER_URL = 'wss://web-cli.ably.com';

describe('Client-Side Diagnostic Tests (Public Endpoint)', function() {
  this.timeout(180000); // 3 minutes overall timeout

  it('diagnostics:server script should complete successfully against public server', async function() {
    try {
      const { stdout, stderr } = await execAsync(`pnpm diagnostics:server ${PUBLIC_TERMINAL_SERVER_URL}`);
      if (stderr && !stderr.includes('Debugger') && !stderr.includes('deprecated') && !stderr.includes('Warning:')) {
        console.error('--- diagnostics:server stderr (non-fatal) ---');
        console.error(stderr);
      }
      expect(stdout).to.include('Diagnostics successful!');
    } catch (error: any) {
      console.error('diagnostics:server test against public endpoint failed:');
      if (error.stdout) console.log('Failed command stdout:', error.stdout);
      if (error.stderr) console.error('Failed command stderr:', error.stderr);
      throw error;
    }
  });
}); 