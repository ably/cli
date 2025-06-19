import { expect } from 'chai';
import { execa } from 'execa';
import path from 'node:path';

const binPath = path.join(process.cwd(), 'bin/run.js');

describe('autocomplete command', function() {

  it('should have autocomplete command available and show instructions', async function() {
    const result = await execa('node', [binPath, 'autocomplete'], { reject: false });
    
    expect(result.stdout).to.contain('Setup Instructions');
    expect(result.stdout).to.contain('autocomplete');
    // Should detect the current shell and show relevant instructions
    expect(result.stdout).to.match(/zsh|bash|powershell/i);
  });

  it('should show bash-specific instructions', async function() {
    const result = await execa('node', [binPath, 'autocomplete', 'bash'], { reject: false });
    
    expect(result.stdout).to.contain('Setup Instructions');
    expect(result.stdout).to.contain('bash');
    expect(result.stdout).to.contain('.bashrc');
  });

  it('should show zsh-specific instructions', async function() {
    const result = await execa('node', [binPath, 'autocomplete', 'zsh'], { reject: false });
    
    expect(result.stdout).to.contain('Setup Instructions');
    expect(result.stdout).to.contain('zsh');
    expect(result.stdout).to.contain('.zshrc');
  });

  it('should show powershell-specific instructions', async function() {
    const result = await execa('node', [binPath, 'autocomplete', 'powershell'], { reject: false });
    
    expect(result.stdout).to.contain('Setup Instructions');
    expect(result.stdout).to.contain('powershell');
  });

  it('should support refresh-cache flag', async function() {
    const result = await execa('node', [binPath, 'autocomplete', '--refresh-cache'], { reject: false });
    
    // The refresh-cache flag causes the cache to be rebuilt
    // The stderr output includes "done" when cache building completes
    expect(result.stderr).to.contain('done');
  });
});