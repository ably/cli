import { test } from '@oclif/test';
import { expect } from 'chai';

describe('autocomplete command', function() {
  test
    .stdout()
    .command(['autocomplete'])
    .it('should have autocomplete command available and show instructions', (ctx) => {
      expect(ctx.stdout).to.contain('Setup Instructions');
      expect(ctx.stdout).to.contain('autocomplete');
      // Should detect the current shell and show relevant instructions
      expect(ctx.stdout).to.match(/zsh|bash|powershell/i);
    });

  test
    .stdout()
    .command(['autocomplete', 'bash'])
    .it('should show bash-specific instructions', (ctx) => {
      expect(ctx.stdout).to.contain('Setup Instructions');
      expect(ctx.stdout).to.contain('bash');
      expect(ctx.stdout).to.contain('.bashrc');
    });

  test
    .stdout()
    .command(['autocomplete', 'zsh'])
    .it('should show zsh-specific instructions', (ctx) => {
      expect(ctx.stdout).to.contain('Setup Instructions');
      expect(ctx.stdout).to.contain('zsh');
      expect(ctx.stdout).to.contain('.zshrc');
    });

  test
    .stdout()
    .command(['autocomplete', 'powershell'])
    .it('should show powershell-specific instructions', (ctx) => {
      expect(ctx.stdout).to.contain('Setup Instructions');
      expect(ctx.stdout).to.contain('powershell');
    });

  test
    .stderr()
    .command(['autocomplete', '--refresh-cache'])
    .it('should support refresh-cache flag', (ctx) => {
      // The refresh-cache flag causes the cache to be rebuilt
      // The stderr output includes "done" when cache building completes
      expect(ctx.stderr).to.contain('done');
    });
});