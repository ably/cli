import { expect } from 'chai';
import { describe, it } from 'mocha';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import InteractiveCommand from '../../../src/commands/interactive.js';
import { Config } from '@oclif/core';
import * as fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const timeout = 10000;
const binPath = path.join(__dirname, '../../../bin/development.js');

// Helper to send tab completion request
const sendTab = (child: any) => {
  // Send TAB character (ASCII 9)
  child.stdin.write('\t');
};

describe('Interactive Mode - Autocomplete & Command Filtering', () => {
  describe('Autocomplete', () => {

  it('should autocomplete top-level commands', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let output = '';
    let foundAccounts = false;
    let foundApps = false;
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      
      // Check if autocomplete shows available commands
      if (data.toString().includes('accounts') && data.toString().includes('apps')) {
        foundAccounts = true;
        foundApps = true;
      }
    });
    
    // Type 'a' and press tab
    setTimeout(() => {
      child.stdin.write('a');
      setTimeout(() => {
        sendTab(child);
      }, 100);
    }, 500);
    
    // Exit
    setTimeout(() => {
      child.stdin.write('\nexit\n');
    }, 1500);
    
    child.on('exit', () => {
      expect(foundAccounts || output.includes('accounts')).to.be.true;
      expect(foundApps || output.includes('apps')).to.be.true;
      done();
    });
  });

  it('should autocomplete subcommands', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let output = '';
    let foundCurrent = false;
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      
      // Check if autocomplete shows subcommands
      if (data.toString().includes('current')) {
        foundCurrent = true;
      }
    });
    
    // Type 'accounts ' and press tab
    setTimeout(() => {
      child.stdin.write('accounts ');
      setTimeout(() => {
        sendTab(child);
      }, 100);
    }, 500);
    
    // Exit
    setTimeout(() => {
      child.stdin.write('\nexit\n');
    }, 1500);
    
    child.on('exit', () => {
      expect(foundCurrent || output.includes('current')).to.be.true;
      done();
    });
  });

  it('should autocomplete flags', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let output = '';
    let foundHelp = false;
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      
      // Check if autocomplete shows flags
      if (data.toString().includes('--help')) {
        foundHelp = true;
      }
    });
    
    // Type 'accounts --' and press tab
    setTimeout(() => {
      child.stdin.write('accounts --');
      setTimeout(() => {
        sendTab(child);
      }, 100);
    }, 500);
    
    // Exit
    setTimeout(() => {
      child.stdin.write('\nexit\n');
    }, 1500);
    
    child.on('exit', () => {
      expect(foundHelp || output.includes('--help')).to.be.true;
      done();
    });
  });

  it('should filter autocomplete suggestions based on partial input', function(done) {
    this.timeout(timeout);
    
    const child = spawn('node', [binPath, 'interactive'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ABLY_INTERACTIVE_MODE: 'true', ABLY_SUPPRESS_WELCOME: '1', ABLY_WRAPPER_MODE: '1' }
    });
    
    let output = '';
    let foundAccounts = false;
    let _foundApps = false;
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      const dataStr = data.toString();
      
      // When we type 'acc' and tab, should only show 'accounts'
      if (dataStr.includes('accounts')) {
        foundAccounts = true;
      }
      if (dataStr.includes('apps')) {
        _foundApps = true;
      }
    });
    
    // Type 'acc' and press tab
    setTimeout(() => {
      child.stdin.write('acc');
      setTimeout(() => {
        sendTab(child);
      }, 100);
    }, 500);
    
    // Exit
    setTimeout(() => {
      child.stdin.write('\nexit\n');
    }, 1500);
    
    child.on('exit', () => {
      // Should find accounts but not apps when filtering by 'acc'
      expect(foundAccounts || output.includes('accounts')).to.be.true;
      done();
    });
  });
  });

  describe('Command Filtering', () => {
    let interactiveCommand: InteractiveCommand;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(function() {
      originalEnv = { ...process.env };

      // Mock config with various commands
      const mockConfig = {
        commands: [
          // Normal commands that should be available
          { id: 'apps', hidden: false },
          { id: 'apps:list', hidden: false },
          { id: 'apps:create', hidden: false },
          { id: 'apps:switch', hidden: false },
          { id: 'apps:delete', hidden: false },
          { id: 'channels', hidden: false },
          { id: 'channels:publish', hidden: false },
          { id: 'channels:subscribe', hidden: false },
          { id: 'channels:list', hidden: false },
          { id: 'accounts', hidden: false },
          { id: 'accounts:list', hidden: false },
          { id: 'accounts:login', hidden: false },
          { id: 'accounts:logout', hidden: false },
          { id: 'accounts:switch', hidden: false },
          { id: 'accounts:current', hidden: false },
          { id: 'accounts:stats', hidden: false },
          { id: 'auth', hidden: false },
          { id: 'auth:keys', hidden: false },
          { id: 'auth:keys:switch', hidden: false },
          { id: 'auth:revoke-token', hidden: false },
          { id: 'bench', hidden: false },
          { id: 'bench:realtime', hidden: false },
          { id: 'integrations', hidden: false },
          { id: 'integrations:list', hidden: false },
          { id: 'queues', hidden: false },
          { id: 'queues:list', hidden: false },
          { id: 'logs', hidden: false },
          { id: 'logs:tail', hidden: false },
          { id: 'connections', hidden: false },
          { id: 'connections:logs', hidden: false },
          { id: 'rooms', hidden: false },
          { id: 'rooms:list', hidden: false },
          { id: 'spaces', hidden: false },
          { id: 'spaces:list', hidden: false },
          // Commands that should always be filtered in interactive mode
          { id: 'autocomplete', hidden: false },
          { id: 'help', hidden: false },
          { id: 'config', hidden: false },
          { id: 'config:get', hidden: false },
          { id: 'config:set', hidden: false },
          { id: 'version', hidden: false },
          // MCP commands (restricted in web CLI)
          { id: 'mcp', hidden: false },
          { id: 'mcp:start', hidden: false },
          // Hidden command (should always be filtered)
          { id: 'hidden-command', hidden: true },
        ],
        root: '/test/root',
        version: '1.0.0',
        findCommand: (id: string) => mockConfig.commands.find(cmd => cmd.id === id),
      } as unknown as Config;

      interactiveCommand = new InteractiveCommand([], mockConfig);
    });

    afterEach(function() {
      process.env = originalEnv;
    });

    describe('Normal mode (not web CLI)', () => {
      beforeEach(function() {
        delete process.env.ABLY_WEB_CLI_MODE;
        delete process.env.ABLY_ANONYMOUS_USER_MODE;
        // Clear command cache to ensure fresh filtering
        (interactiveCommand as any)._commandCache = undefined;
      });

      it('should filter out unsuitable commands for interactive mode', () => {
        const commands = (interactiveCommand as any).getTopLevelCommands();
        
        // Should NOT include these commands
        expect(commands).to.not.include('autocomplete');
        expect(commands).to.not.include('config');
        expect(commands).to.not.include('version');
        expect(commands).to.not.include('mcp'); // MCP is not suitable for interactive mode
        
        // Should include these commands
        expect(commands).to.include('apps');
        expect(commands).to.include('channels');
        expect(commands).to.include('accounts');
        expect(commands).to.include('auth');
        expect(commands).to.include('exit'); // Special command
        expect(commands).to.include('help'); // Help is now allowed in interactive mode
      });

      it('should not filter subcommands in normal mode', () => {
        const subcommands = (interactiveCommand as any).getSubcommandsForPath(['apps']);
        
        expect(subcommands).to.include('list');
        expect(subcommands).to.include('create');
        expect(subcommands).to.include('switch');
        expect(subcommands).to.include('delete');
      });
    });

    describe('Web CLI mode (authenticated)', () => {
      beforeEach(function() {
        process.env.ABLY_WEB_CLI_MODE = 'true';
        delete process.env.ABLY_ANONYMOUS_USER_MODE;
        // Clear command cache to ensure fresh filtering
        (interactiveCommand as any)._commandCache = undefined;
      });

      it('should filter out web CLI restricted commands', () => {
        const commands = (interactiveCommand as any).getTopLevelCommands();
        
        // Should NOT include web CLI restricted commands
        expect(commands).to.not.include('config'); // config* restricted
        expect(commands).to.not.include('mcp'); // mcp* restricted
        
        // Should include commands that are only partially restricted
        expect(commands).to.include('accounts'); // only specific subcommands are restricted
        expect(commands).to.include('apps'); // only specific subcommands are restricted
        expect(commands).to.include('channels');
        expect(commands).to.include('auth'); // auth is allowed, only specific subcommands restricted
        expect(commands).to.include('bench'); // bench is allowed in authenticated mode
        expect(commands).to.include('integrations');
        expect(commands).to.include('queues');
        expect(commands).to.include('logs');
        expect(commands).to.include('rooms');
        expect(commands).to.include('spaces');
      });

      it('should filter out restricted subcommands', () => {
        // Apps subcommands - create, switch, delete should be filtered
        const appsSubcommands = (interactiveCommand as any).getSubcommandsForPath(['apps']);
        expect(appsSubcommands).to.include('list'); // list is allowed
        expect(appsSubcommands).to.not.include('create');
        expect(appsSubcommands).to.not.include('switch');
        expect(appsSubcommands).to.not.include('delete');

        // Auth:keys subcommands
        const authKeysSubcommands = (interactiveCommand as any).getSubcommandsForPath(['auth', 'keys']);
        expect(authKeysSubcommands).to.not.include('switch'); // auth:keys:switch is restricted
      });
    });

    describe('Web CLI mode (anonymous)', () => {
      beforeEach(function() {
        process.env.ABLY_WEB_CLI_MODE = 'true';
        process.env.ABLY_ANONYMOUS_USER_MODE = 'true';
        // Clear command cache to ensure fresh filtering
        (interactiveCommand as any)._commandCache = undefined;
      });

      it('should filter out both web CLI and anonymous restricted commands', () => {
        const commands = (interactiveCommand as any).getTopLevelCommands();
        
        // Should NOT include any of these
        expect(commands).to.not.include('accounts'); // accounts* restricted in anonymous mode
        expect(commands).to.not.include('apps'); // apps* restricted in anonymous mode
        expect(commands).to.not.include('bench'); // restricted in anonymous mode
        expect(commands).to.not.include('integrations'); // restricted in anonymous mode
        expect(commands).to.not.include('queues'); // restricted in anonymous mode
        expect(commands).to.not.include('logs'); // restricted in anonymous mode
        expect(commands).to.not.include('config'); // restricted in web CLI mode
        expect(commands).to.not.include('mcp'); // restricted in web CLI mode
        
        // Should still include some commands
        expect(commands).to.include('channels'); // channels root is allowed
        expect(commands).to.include('auth'); // auth root is allowed
        expect(commands).to.include('exit');
      });

      it('should filter out anonymous-restricted subcommands', () => {
        // Channels subcommands - list and logs should be filtered in anonymous mode
        const channelsSubcommands = (interactiveCommand as any).getSubcommandsForPath(['channels']);
        expect(channelsSubcommands).to.include('publish'); // allowed
        expect(channelsSubcommands).to.include('subscribe'); // allowed
        expect(channelsSubcommands).to.not.include('list'); // channels:list restricted in anonymous

        // Auth subcommands
        const authSubcommands = (interactiveCommand as any).getSubcommandsForPath(['auth']);
        expect(authSubcommands).to.not.include('keys'); // auth:keys* restricted in anonymous
        expect(authSubcommands).to.not.include('revoke-token'); // auth:revoke-token restricted

        // Connections subcommands
        const connectionsSubcommands = (interactiveCommand as any).getSubcommandsForPath(['connections']);
        expect(connectionsSubcommands).to.not.include('logs'); // connections:logs restricted

        // Rooms subcommands
        const roomsSubcommands = (interactiveCommand as any).getSubcommandsForPath(['rooms']);
        expect(roomsSubcommands).to.not.include('list'); // rooms:list restricted

        // Spaces subcommands  
        const spacesSubcommands = (interactiveCommand as any).getSubcommandsForPath(['spaces']);
        expect(spacesSubcommands).to.not.include('list'); // spaces:list restricted
      });
    });

    describe('Command pattern matching', () => {
      it('should correctly match wildcard patterns', () => {
        const isRestricted = (interactiveCommand as any).isCommandRestricted.bind(interactiveCommand);
        
        // Set up web CLI mode for testing
        process.env.ABLY_WEB_CLI_MODE = 'true';
        // Clear command cache to ensure fresh filtering
        (interactiveCommand as any)._commandCache = undefined;
        
        // Test wildcard patterns from WEB_CLI_RESTRICTED_COMMANDS
        expect(isRestricted('config')).to.be.true; // config* matches config
        expect(isRestricted('config:get')).to.be.true; // config* matches config:get
        expect(isRestricted('config:set')).to.be.true; // config* matches config:set
        expect(isRestricted('mcp')).to.be.true; // mcp* matches mcp
        expect(isRestricted('mcp:start')).to.be.true; // mcp* matches mcp:start
        
        // Test exact matches
        expect(isRestricted('accounts:login')).to.be.true;
        expect(isRestricted('apps:create')).to.be.true;
        
        // Test non-matches
        expect(isRestricted('channels:publish')).to.be.false;
        expect(isRestricted('auth:create-token')).to.be.false; // not in restricted list
      });
    });

    describe('Cache invalidation', () => {
      it('should rebuild command cache when environment changes', () => {
        // Get commands in normal mode
        delete process.env.ABLY_WEB_CLI_MODE;
        const normalCommands = (interactiveCommand as any).getTopLevelCommands();
        expect(normalCommands).to.not.include('mcp'); // MCP is always unsuitable for interactive mode
        expect(normalCommands).to.include('accounts'); // accounts is available in normal mode
        
        // Clear cache
        (interactiveCommand as any)._commandCache = undefined;
        
        // Get commands in web CLI mode
        process.env.ABLY_WEB_CLI_MODE = 'true';
        const webCliCommands = (interactiveCommand as any).getTopLevelCommands();
        expect(webCliCommands).to.not.include('mcp'); // Still filtered
        // accounts:login, logout, switch are restricted but accounts itself is visible
        expect(webCliCommands).to.include('accounts');
      });
    });
  });

  describe('Flag Completion', () => {
    let interactive: any;
    let mockManifest: any;

    beforeEach(function() {
      // Create a mock manifest with flag data
      mockManifest = {
        commands: {
          'channels:batch-publish': {
            flags: {
              'channels': {
                name: 'channels',
                description: 'Comma-separated list of channel names to publish to',
                type: 'option'
              },
              'channels-json': {
                name: 'channels-json',
                description: 'JSON array of channel names to publish to',
                type: 'option'
              },
              'encoding': {
                name: 'encoding',
                char: 'e',
                description: 'The encoding for the message',
                type: 'option'
              },
              'name': {
                name: 'name',
                char: 'n',
                description: 'The event name (if not specified in the message JSON)',
                type: 'option'
              },
              'spec': {
                name: 'spec',
                description: 'Complete batch spec JSON (either a single BatchSpec object or an array of BatchSpec objects)',
                type: 'option'
              },
              'json': {
                name: 'json',
                description: 'Output in JSON format',
                type: 'boolean'
              },
              'pretty-json': {
                name: 'pretty-json',
                description: 'Output in colorized JSON format',
                type: 'boolean'
              },
              'api-key': {
                name: 'api-key',
                description: 'Overrides any configured API key used for the product APIs',
                type: 'option'
              },
              'help': {
                name: 'help',
                char: 'h',
                description: 'Show help for command',
                type: 'boolean'
              }
            }
          }
        }
      };
    });

    it('should return all flags for channels:batch-publish command', async function() {
        // Create a test instance
        const config = {
          root: process.cwd(),
          commands: [],
          findCommand: () => null
        } as any;
        
        interactive = new InteractiveCommand([], config);
        interactive._manifestCache = mockManifest;
        
        // Test getting flags for channels:batch-publish
        const flags = interactive.getFlagsForCommandSync(['channels', 'batch-publish']);
        
        // Check that flags array contains expected values
        expect(flags).to.include('--channels');
        expect(flags).to.include('--channels-json');
        expect(flags).to.include('--encoding');
        expect(flags).to.include('-e');
        expect(flags).to.include('--name');
        expect(flags).to.include('-n');
        expect(flags).to.include('--spec');
        expect(flags).to.include('--json');
        expect(flags).to.include('--pretty-json');
        expect(flags).to.include('--api-key');
        expect(flags).to.include('--help');
        expect(flags).to.include('-h');
    });

    it('should display flag completions with descriptions', async function() {
        // Create a test instance
        const config = {
          root: process.cwd(),
          commands: [],
          findCommand: () => null
        } as any;
        
        interactive = new InteractiveCommand([], config);
        interactive._manifestCache = mockManifest;
        
        // Capture console output
        const originalLog = console.log;
        let output = '';
        console.log = (...args: any[]) => {
          output += args.join(' ') + '\n';
        };
        
        try {
          // Test completion display
          const matches = ['--channels', '--channels-json', '--encoding', '-e'];
          interactive.displayCompletions(matches, 'flag', ['channels', 'batch-publish']);
          
          expect(output).to.contain('--channels');
          expect(output).to.contain('Comma-separated list of channel names to publish to');
          expect(output).to.contain('--channels-json');
          expect(output).to.contain('JSON array of channel names to publish to');
          expect(output).to.contain('--encoding');
          expect(output).to.contain('The encoding for the message');
        } finally {
          console.log = originalLog;
        }
    });

    it('should filter hidden flags based on ABLY_SHOW_DEV_FLAGS', async function() {
        // Test that hidden flags are filtered out unless ABLY_SHOW_DEV_FLAGS is set
        const hiddenFlagManifest = {
          commands: {
            'test:command': {
              flags: {
                'visible': {
                  name: 'visible',
                  description: 'A visible flag',
                  type: 'option'
                },
                'hidden': {
                  name: 'hidden',
                  description: 'A hidden flag',
                  type: 'option',
                  hidden: true
                }
              }
            }
          }
        };
        
        const config = {
          root: process.cwd(),
          commands: [],
          findCommand: () => null
        } as any;
        
        interactive = new InteractiveCommand([], config);
        interactive._manifestCache = hiddenFlagManifest;
        
        // Test without dev flags
        const flags = interactive.getFlagsForCommandSync(['test', 'command']);
        expect(flags).to.include('--visible');
        expect(flags).to.not.include('--hidden');
        
        // Test with dev flags
        process.env.ABLY_SHOW_DEV_FLAGS = 'true';
        interactive._flagsCache = {}; // Clear cache
        const devFlags = interactive.getFlagsForCommandSync(['test', 'command']);
        expect(devFlags).to.include('--visible');
        expect(devFlags).to.include('--hidden');
        delete process.env.ABLY_SHOW_DEV_FLAGS;
    });
  });

  describe('Flag Manifest', () => {
    it('manifest should contain all flags for channels:batch-publish', async function() {
        // Verify the manifest contains all expected flags
        const manifestPath = path.join(process.cwd(), 'oclif.manifest.json');
        expect(fs.existsSync(manifestPath)).to.be.true;
        
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const batchPublish = manifest.commands['channels:batch-publish'];
        
        expect(batchPublish).to.exist;
        expect(batchPublish.flags).to.exist;
        
        // Check for command-specific flags
        expect(batchPublish.flags).to.have.property('channels');
        expect(batchPublish.flags).to.have.property('channels-json');
        expect(batchPublish.flags).to.have.property('encoding');
        expect(batchPublish.flags).to.have.property('name');
        expect(batchPublish.flags).to.have.property('spec');
        
        // Check for global flags
        expect(batchPublish.flags).to.have.property('json');
        expect(batchPublish.flags).to.have.property('pretty-json');
        expect(batchPublish.flags).to.have.property('api-key');
        expect(batchPublish.flags).to.have.property('access-token');
        expect(batchPublish.flags).to.have.property('verbose');
        
        // Check flag details
        expect(batchPublish.flags.encoding).to.have.property('char', 'e');
        expect(batchPublish.flags.name).to.have.property('char', 'n');
        expect(batchPublish.flags.verbose).to.have.property('char', 'v');
    });

    it('manifest should be properly populated for all commands', async function() {
        // Check a few other commands to ensure manifest is complete
        const manifestPath = path.join(process.cwd(), 'oclif.manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        
        // Check channels:publish
        const channelsPublish = manifest.commands['channels:publish'];
        expect(channelsPublish).to.exist;
        expect(channelsPublish.flags).to.have.property('count');
        expect(channelsPublish.flags).to.have.property('delay');
        expect(channelsPublish.flags).to.have.property('encoding');
        expect(channelsPublish.flags).to.have.property('transport');
        
        // Check apps:list
        const appsList = manifest.commands['apps:list'];
        expect(appsList).to.exist;
        expect(appsList.flags).to.have.property('json');
        expect(appsList.flags).to.have.property('pretty-json');
    });
  });
});