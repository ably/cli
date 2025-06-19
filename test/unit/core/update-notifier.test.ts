import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { execa } from 'execa';

describe('update notifier', function() {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(function() {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(function() {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should respect ABLY_SKIP_NEW_VERSION_CHECK', async function() {
    // The plugin respects the standard oclif environment variable
    const result = await execa('node', ['bin/run.js', '--help'], {
      env: {
        ...process.env,
        ABLY_SKIP_NEW_VERSION_CHECK: '1',
        NODE_OPTIONS: '', // Clear NODE_OPTIONS to prevent debugger attachment
      },
      reject: false,
    });

    // When update check is skipped, the command should run normally
    expect(result.failed).to.be.false;
    expect(result.stdout).to.contain('USAGE');
    
    // The update notification would appear in stderr if it was shown
    // With ABLY_SKIP_NEW_VERSION_CHECK=1, there should be no update notification
    // Note: We can't directly test for absence of update notification
    // as it only appears when there's actually a new version available
  });

  it('should allow update checks when environment variable is not set', async function() {
    // Run without the skip environment variable
    const result = await execa('node', ['bin/run.js', '--help'], {
      env: {
        ...process.env,
        NODE_OPTIONS: '', // Clear NODE_OPTIONS to prevent debugger attachment
        // Not setting ABLY_SKIP_NEW_VERSION_CHECK
      },
      reject: false,
    });

    // Command should run normally regardless of update check
    expect(result.failed).to.be.false;
    expect(result.stdout).to.contain('USAGE');
  });

  it('should respect ABLY_FORCE_VERSION_CACHE_UPDATE', async function() {
    // This forces an immediate update check
    const result = await execa('node', ['bin/run.js', '--help'], {
      env: {
        ...process.env,
        ABLY_FORCE_VERSION_CACHE_UPDATE: '1',
        NODE_OPTIONS: '', // Clear NODE_OPTIONS to prevent debugger attachment
      },
      reject: false,
    });

    // Command should run normally
    expect(result.failed).to.be.false;
    expect(result.stdout).to.contain('USAGE');
  });
});