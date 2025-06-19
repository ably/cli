import { expect } from 'chai';
import { execa } from 'execa';
import path from 'node:path';

const binPath = path.join(process.cwd(), 'bin/run.js');

async function testTopicFormatting(topic: string) {
  const result = await execa('node', [binPath, topic], { reject: false });
  
  // Should have header
  expect(result.stdout).to.match(/^Ably .+ commands:$/m);
  
  // Should have empty line after header
  const lines = result.stdout.split('\n');
  const headerIndex = lines.findIndex(function(line) { 
    return line.includes('commands:'); 
  });
  expect(lines[headerIndex + 1]).to.equal('');
  
  // Should have commands indented with consistent spacing
  const commandLines = lines.filter(function(line) { 
    return line.match(/^\s+ably/); 
  });
  commandLines.forEach(function(line) {
    expect(line).to.match(/^\s{2}ably/); // Two spaces indent
    expect(line).to.contain(' - '); // Separator between command and description
  });
  
  // Should have help text at the end
  expect(result.stdout).to.contain(`Run \`ably ${topic} COMMAND --help\``);
}

describe('topic command display', function() {
  this.timeout(10000); // Allow time for command discovery

  describe('accounts topic', function() {
    it('should display accounts commands correctly', async function() {
      const result = await execa('node', [binPath, 'accounts'], { reject: false });
      
      expect(result.stdout).to.contain('Ably accounts management commands:');
      expect(result.stdout).to.contain('ably accounts login');
      expect(result.stdout).to.contain('ably accounts list');
      expect(result.stdout).to.contain('ably accounts current');
      expect(result.stdout).to.contain('ably accounts logout');
      expect(result.stdout).to.contain('ably accounts switch');
      expect(result.stdout).to.contain('ably accounts stats');
      expect(result.stdout).to.contain('Run `ably accounts COMMAND --help`');
      expect(result.stdout).not.to.contain('Example:'); // Examples only with --help
    });
  });

  describe('apps topic', function() {
    it('should display apps commands correctly', async function() {
      const result = await execa('node', [binPath, 'apps'], { reject: false });
      
      expect(result.stdout).to.contain('Ably apps management commands:');
      expect(result.stdout).to.contain('ably apps create');
      expect(result.stdout).to.contain('ably apps list');
      expect(result.stdout).to.contain('ably apps update');
      expect(result.stdout).to.contain('ably apps delete');
      expect(result.stdout).to.contain('ably apps channel-rules');
      expect(result.stdout).to.contain('ably apps stats');
      expect(result.stdout).to.contain('ably apps logs');
      expect(result.stdout).to.contain('ably apps switch');
      expect(result.stdout).to.contain('Run `ably apps COMMAND --help`');
    });
  });

  describe('auth topic', function() {
    it('should display auth commands correctly', async function() {
      const result = await execa('node', [binPath, 'auth'], { reject: false });
      
      expect(result.stdout).to.contain('Ably authentication commands:');
      expect(result.stdout).to.contain('ably auth keys');
      expect(result.stdout).to.contain('ably auth issue-jwt-token');
      expect(result.stdout).to.contain('ably auth issue-ably-token');
      expect(result.stdout).to.contain('ably auth revoke-token');
      expect(result.stdout).to.contain('Run `ably auth COMMAND --help`');
    });
  });

  describe('bench topic', function() {
    it('should display bench commands correctly', async function() {
      const result = await execa('node', [binPath, 'bench'], { reject: false });
      
      expect(result.stdout).to.contain('Ably benchmark testing commands:');
      expect(result.stdout).to.contain('ably bench publisher');
      expect(result.stdout).to.contain('ably bench subscriber');
      expect(result.stdout).to.contain('Run `ably bench COMMAND --help`');
    });
  });

  describe('channels topic', function() {
    it('should display channels commands correctly', async function() {
      const result = await execa('node', [binPath, 'channels'], { reject: false });
      
      expect(result.stdout).to.contain('Ably Pub/Sub channel commands:');
      expect(result.stdout).to.contain('ably channels list');
      expect(result.stdout).to.contain('ably channels publish');
      expect(result.stdout).to.contain('ably channels batch-publish');
      expect(result.stdout).to.contain('ably channels subscribe');
      expect(result.stdout).to.contain('ably channels history');
      expect(result.stdout).to.contain('ably channels occupancy');
      expect(result.stdout).to.contain('ably channels presence');
      expect(result.stdout).to.contain('Run `ably channels COMMAND --help`');
    });
  });

  describe('connections topic', function() {
    it('should display connections commands correctly', async function() {
      const result = await execa('node', [binPath, 'connections'], { reject: false });
      
      expect(result.stdout).to.contain('Ably Pub/Sub connection commands:');
      expect(result.stdout).to.contain('ably connections stats');
      expect(result.stdout).to.contain('ably connections test');
      expect(result.stdout).to.contain('Run `ably connections COMMAND --help`');
    });
  });

  describe('integrations topic', function() {
    it('should display integrations commands correctly', async function() {
      const result = await execa('node', [binPath, 'integrations'], { reject: false });
      
      expect(result.stdout).to.contain('Ably integrations management commands:');
      expect(result.stdout).to.contain('ably integrations list');
      expect(result.stdout).to.contain('ably integrations get');
      expect(result.stdout).to.contain('ably integrations create');
      expect(result.stdout).to.contain('ably integrations update');
      expect(result.stdout).to.contain('ably integrations delete');
      expect(result.stdout).to.contain('Run `ably integrations COMMAND --help`');
    });
  });

  describe('logs topic', function() {
    it('should display logs commands correctly', async function() {
      const result = await execa('node', [binPath, 'logs'], { reject: false });
      
      expect(result.stdout).to.contain('Ably logging commands:');
      expect(result.stdout).to.contain('ably logs app');
      expect(result.stdout).to.contain('ably logs channel-lifecycle');
      expect(result.stdout).to.contain('ably logs connection-lifecycle');
      expect(result.stdout).to.contain('ably logs push');
      expect(result.stdout).to.contain('Run `ably logs COMMAND --help`');
    });
  });

  describe('queues topic', function() {
    it('should display queues commands correctly', async function() {
      const result = await execa('node', [binPath, 'queues'], { reject: false });
      
      expect(result.stdout).to.contain('Ably queues management commands:');
      expect(result.stdout).to.contain('ably queues list');
      expect(result.stdout).to.contain('ably queues create');
      expect(result.stdout).to.contain('ably queues delete');
      expect(result.stdout).to.contain('Run `ably queues COMMAND --help`');
    });
  });

  describe('rooms topic', function() {
    it('should display rooms commands correctly', async function() {
      const result = await execa('node', [binPath, 'rooms'], { reject: false });
      
      expect(result.stdout).to.contain('Ably Chat rooms commands:');
      expect(result.stdout).to.contain('ably rooms list');
      expect(result.stdout).to.contain('ably rooms messages');
      expect(result.stdout).to.contain('ably rooms occupancy');
      expect(result.stdout).to.contain('ably rooms presence');
      expect(result.stdout).to.contain('ably rooms reactions');
      expect(result.stdout).to.contain('ably rooms typing');
      expect(result.stdout).to.contain('Run `ably rooms COMMAND --help`');
    });
  });

  describe('spaces topic', function() {
    it('should display spaces commands correctly', async function() {
      const result = await execa('node', [binPath, 'spaces'], { reject: false });
      
      expect(result.stdout).to.contain('Ably Spaces commands:');
      expect(result.stdout).to.contain('ably spaces list');
      expect(result.stdout).to.contain('ably spaces cursors');
      expect(result.stdout).to.contain('ably spaces locations');
      expect(result.stdout).to.contain('ably spaces locks');
      expect(result.stdout).to.contain('ably spaces members');
      expect(result.stdout).to.contain('Run `ably spaces COMMAND --help`');
    });
  });

  describe('formatting consistency', function() {

    it('should have consistent formatting for accounts', async function() {
      await testTopicFormatting('accounts');
    });
    
    it('should have consistent formatting for apps', async function() {
      await testTopicFormatting('apps');
    });
    
    it('should have consistent formatting for auth', async function() {
      await testTopicFormatting('auth');
    });
    
    it('should have consistent formatting for bench', async function() {
      await testTopicFormatting('bench');
    });
    
    it('should have consistent formatting for channels', async function() {
      await testTopicFormatting('channels');
    });
    
    it('should have consistent formatting for connections', async function() {
      await testTopicFormatting('connections');
    });
    
    it('should have consistent formatting for integrations', async function() {
      await testTopicFormatting('integrations');
    });
    
    it('should have consistent formatting for logs', async function() {
      await testTopicFormatting('logs');
    });
    
    it('should have consistent formatting for queues', async function() {
      await testTopicFormatting('queues');
    });
    
    it('should have consistent formatting for rooms', async function() {
      await testTopicFormatting('rooms');
    });
    
    it('should have consistent formatting for spaces', async function() {
      await testTopicFormatting('spaces');
    });
  });

  describe('hidden commands', function() {
    it('should not display hidden commands', async function() {
      const result = await execa('node', [binPath, 'accounts'], { reject: false });
      
      // The accounts command should not show any hidden sub-commands
      // This test ensures that if any sub-commands are marked as hidden,
      // they won't appear in the output
      const lines = result.stdout.split('\n');
      const commandLines = lines.filter(function(line) { 
        return line.match(/^\s+ably/); 
      });
      
      // All displayed commands should be valid, non-hidden commands
      commandLines.forEach(function(line) {
        expect(line).to.match(/^\s{2}ably accounts \w+/);
      });
    });
  });
});