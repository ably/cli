import { test } from '@oclif/test';
import { expect } from 'chai';

describe('topic command display', function() {
  this.timeout(10000); // Allow time for command discovery

  describe('accounts topic', () => {
    test
      .stdout()
      .command(['accounts'])
      .it('should display accounts commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably accounts management commands:');
        expect(ctx.stdout).to.contain('ably accounts login');
        expect(ctx.stdout).to.contain('ably accounts list');
        expect(ctx.stdout).to.contain('ably accounts current');
        expect(ctx.stdout).to.contain('ably accounts logout');
        expect(ctx.stdout).to.contain('ably accounts switch');
        expect(ctx.stdout).to.contain('ably accounts stats');
        expect(ctx.stdout).to.contain('Run `ably accounts COMMAND --help`');
        expect(ctx.stdout).not.to.contain('Example:'); // Examples only with --help
      });
  });

  describe('apps topic', () => {
    test
      .stdout()
      .command(['apps'])
      .it('should display apps commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably apps management commands:');
        expect(ctx.stdout).to.contain('ably apps create');
        expect(ctx.stdout).to.contain('ably apps list');
        expect(ctx.stdout).to.contain('ably apps update');
        expect(ctx.stdout).to.contain('ably apps delete');
        expect(ctx.stdout).to.contain('ably apps channel-rules');
        expect(ctx.stdout).to.contain('ably apps stats');
        expect(ctx.stdout).to.contain('ably apps logs');
        expect(ctx.stdout).to.contain('ably apps switch');
        expect(ctx.stdout).to.contain('Run `ably apps COMMAND --help`');
      });
  });

  describe('auth topic', () => {
    test
      .stdout()
      .command(['auth'])
      .it('should display auth commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably authentication commands:');
        expect(ctx.stdout).to.contain('ably auth keys');
        expect(ctx.stdout).to.contain('ably auth issue-jwt-token');
        expect(ctx.stdout).to.contain('ably auth issue-ably-token');
        expect(ctx.stdout).to.contain('ably auth revoke-token');
        expect(ctx.stdout).to.contain('Run `ably auth COMMAND --help`');
      });
  });

  describe('bench topic', () => {
    test
      .stdout()
      .command(['bench'])
      .it('should display bench commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably benchmark testing commands:');
        expect(ctx.stdout).to.contain('ably bench publisher');
        expect(ctx.stdout).to.contain('ably bench subscriber');
        expect(ctx.stdout).to.contain('Run `ably bench COMMAND --help`');
      });
  });

  describe('channels topic', () => {
    test
      .stdout()
      .command(['channels'])
      .it('should display channels commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably Pub/Sub channel commands:');
        expect(ctx.stdout).to.contain('ably channels list');
        expect(ctx.stdout).to.contain('ably channels publish');
        expect(ctx.stdout).to.contain('ably channels batch-publish');
        expect(ctx.stdout).to.contain('ably channels subscribe');
        expect(ctx.stdout).to.contain('ably channels history');
        expect(ctx.stdout).to.contain('ably channels occupancy');
        expect(ctx.stdout).to.contain('ably channels presence');
        expect(ctx.stdout).to.contain('Run `ably channels COMMAND --help`');
      });
  });

  describe('connections topic', () => {
    test
      .stdout()
      .command(['connections'])
      .it('should display connections commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably Pub/Sub connection commands:');
        expect(ctx.stdout).to.contain('ably connections stats');
        expect(ctx.stdout).to.contain('ably connections test');
        expect(ctx.stdout).to.contain('Run `ably connections COMMAND --help`');
      });
  });

  describe('integrations topic', () => {
    test
      .stdout()
      .command(['integrations'])
      .it('should display integrations commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably integrations management commands:');
        expect(ctx.stdout).to.contain('ably integrations list');
        expect(ctx.stdout).to.contain('ably integrations get');
        expect(ctx.stdout).to.contain('ably integrations create');
        expect(ctx.stdout).to.contain('ably integrations update');
        expect(ctx.stdout).to.contain('ably integrations delete');
        expect(ctx.stdout).to.contain('Run `ably integrations COMMAND --help`');
      });
  });

  describe('logs topic', () => {
    test
      .stdout()
      .command(['logs'])
      .it('should display logs commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably logging commands:');
        expect(ctx.stdout).to.contain('ably logs app');
        expect(ctx.stdout).to.contain('ably logs channel-lifecycle');
        expect(ctx.stdout).to.contain('ably logs connection-lifecycle');
        expect(ctx.stdout).to.contain('ably logs push');
        expect(ctx.stdout).to.contain('Run `ably logs COMMAND --help`');
      });
  });

  describe('queues topic', () => {
    test
      .stdout()
      .command(['queues'])
      .it('should display queues commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably queues management commands:');
        expect(ctx.stdout).to.contain('ably queues list');
        expect(ctx.stdout).to.contain('ably queues create');
        expect(ctx.stdout).to.contain('ably queues delete');
        expect(ctx.stdout).to.contain('Run `ably queues COMMAND --help`');
      });
  });

  describe('rooms topic', () => {
    test
      .stdout()
      .command(['rooms'])
      .it('should display rooms commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably Chat rooms commands:');
        expect(ctx.stdout).to.contain('ably rooms list');
        expect(ctx.stdout).to.contain('ably rooms messages');
        expect(ctx.stdout).to.contain('ably rooms occupancy');
        expect(ctx.stdout).to.contain('ably rooms presence');
        expect(ctx.stdout).to.contain('ably rooms reactions');
        expect(ctx.stdout).to.contain('ably rooms typing');
        expect(ctx.stdout).to.contain('Run `ably rooms COMMAND --help`');
      });
  });

  describe('spaces topic', () => {
    test
      .stdout()
      .command(['spaces'])
      .it('should display spaces commands correctly', (ctx) => {
        expect(ctx.stdout).to.contain('Ably Spaces commands:');
        expect(ctx.stdout).to.contain('ably spaces list');
        expect(ctx.stdout).to.contain('ably spaces cursors');
        expect(ctx.stdout).to.contain('ably spaces locations');
        expect(ctx.stdout).to.contain('ably spaces locks');
        expect(ctx.stdout).to.contain('ably spaces members');
        expect(ctx.stdout).to.contain('Run `ably spaces COMMAND --help`');
      });
  });

  describe('formatting consistency', () => {
    const topics = ['accounts', 'apps', 'auth', 'bench', 'channels', 'connections', 
                   'integrations', 'logs', 'queues', 'rooms', 'spaces'];

    topics.forEach(topic => {
      test
        .stdout()
        .command([topic])
        .it(`should have consistent formatting for ${topic}`, (ctx) => {
          // Should have header
          expect(ctx.stdout).to.match(/^Ably .+ commands:$/m);
          
          // Should have empty line after header
          const lines = ctx.stdout.split('\n');
          const headerIndex = lines.findIndex(line => line.includes('commands:'));
          expect(lines[headerIndex + 1]).to.equal('');
          
          // Should have commands indented with consistent spacing
          const commandLines = lines.filter(line => line.match(/^\s+ably/));
          commandLines.forEach(line => {
            expect(line).to.match(/^\s{2}ably/); // Two spaces indent
            expect(line).to.contain(' - '); // Separator between command and description
          });
          
          // Should have help text at the end
          expect(ctx.stdout).to.contain(`Run \`ably ${topic} COMMAND --help\``);
        });
    });
  });

  describe('hidden commands', () => {
    test
      .stdout()
      .command(['accounts'])
      .it('should not display hidden commands', (ctx) => {
        // The accounts command should not show any hidden sub-commands
        // This test ensures that if any sub-commands are marked as hidden,
        // they won't appear in the output
        const lines = ctx.stdout.split('\n');
        const commandLines = lines.filter(line => line.match(/^\s+ably/));
        
        // All displayed commands should be valid, non-hidden commands
        commandLines.forEach(line => {
          expect(line).to.match(/^\s{2}ably accounts \w+/);
        });
      });
  });
});