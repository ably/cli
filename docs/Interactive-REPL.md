# Interactive ([Immersive](https://github.com/dthree/vorpal)) CLI

The Ably CLI is desigend to be run as a traditional command line tool, where commands are run individually from a bash-like shell. Between each invocation of commands, the entire CLI environment is loaded and executed. This model works very well for a locally installed CLI.

However, the Ably CLI is also available as a Web Terminal CLI as a convenience for Ably customers who are logged in or browsing the docs, with a CLI drawer available to slide up and execute commands. This is made possible with a local restricted shell within a secure container being spawned for each session, with STDIN/STDOUT streamed over a WebSocket connection.

This model is operational today and works largely as expected, however it has some unexpected tradeoffs:

- There is some lag loading the Ably CLI within a restricted container for each request, typically a few hundred millseconds. This coupled with the roundtrip latency becomes noticeable, although definitely still workable.
- Auto-complete does not work because of the security restrictions in place in the container and restricted shell. Working around this is proving very difficult, hacky or compromises on the security posture we were aiming for.

I would like to explore an alternative route where the Ably CLI supports an interactive ([immersive](https://github.com/dthree/vorpal)) CLI mode which would:

- Allow the CLI to be launched and remain running between commands (this will reduce latency by removing the need for the bootstrap sequence for every command)
- Offer all the same commands with the same Ably CLI syntax (commands and arguments) within the interactive mode. This consistency is important so that users dropping into the local CLI will get the same experience.
- Provide rich autocomplete functionality to ensure we deliver a great developer experience, similar to what `zsh` offers
- Provide history (Cmd+R / up)
- Catch Ctrl-C and prevent mistaken exit from the interactive shell
- Interactive REPL should feel like a standard shell, with the $ prompt for example
- Support for rich TUI terminal functionality such as progress indicators and inline table updates

## Technical considerations

There are some relevant Node.js projects we can draw inspiration from:

- [Vorpal interactive CLI](https://vorpal.js.org/) with source code at https://github.com/dthree/vorpal
- [Inquirer package](https://www.npmjs.com/package/inquirer) for common interactive command line user interface commands

[oclif](https://oclif.io/) does not appear to have any plugins to support an interactive/embedded CLI mode.
However, a [REPL plugin](https://github.com/sisou/oclif-plugin-repl) exists, although that's unlikely to share much with the goals of interactive CLI.

If there are any existing libraries that we can depend on to enable this functionality, taht that should be our preference to keep the CLI complexity low. However, any dependencies used should be well maintained and popular. If the additional dependencies to support this functionality add any material bloat, we should consider how this functionality can be added as an optional plugin so that the standard locally installed CLI has minimal dependencies.

## Execution Plan

### Overview

This execution plan implements an interactive REPL mode using a fork-on-demand approach with pre-warming. The design prioritizes minimal latency, clean process isolation for Ctrl+C handling, and efficient resource usage.

### Architecture: Fork-on-Demand with Pre-warming

The chosen approach uses Node.js's `child_process.fork()` to create an isolated process for command execution. Key features:

- **Pre-warming on keypress**: Fork process starts when user begins typing, not when they press Enter
- **30-second idle timeout**: Fork is terminated after inactivity to free resources
- **Single fork model**: Only one fork exists at a time (sufficient for sequential command execution)
- **Clean isolation**: Commands run in separate process, enabling reliable Ctrl+C termination

**Expected Performance**:
- First keypress to fork ready: ~35-70ms (hidden from user)
- Command execution: 0ms additional overhead (fork already warm)
- Memory usage: 0MB when idle, ~30MB when fork active

### Implementation Phases

#### Phase 1: Basic REPL Loop with Fork Worker (3-4 days)

**Goal**: Create functioning interactive shell with fork-based command execution.

**Tasks**:
1. Create `src/commands/interactive.ts` command (hidden initially)
2. Implement `src/workers/command-worker.ts` for forked execution
3. Basic readline loop with `$ ` prompt
4. Fork management with pre-warming logic

**Key Files**:

```typescript
// src/commands/interactive.ts
import { Command } from '@oclif/core';
import * as readline from 'readline';
import { fork, ChildProcess } from 'child_process';
import * as path from 'path';

export default class Interactive extends Command {
  static description = 'Launch interactive Ably shell';
  static hidden = true;

  private rl!: readline.Interface;
  private worker?: ChildProcess;
  private workerReady = false;
  private idleTimer?: NodeJS.Timeout;
  private commandRunning = false;
  private readonly IDLE_TIMEOUT = 30000; // 30 seconds

  async run() {
    this.setupReadline();
    console.log('Welcome to Ably interactive shell. Type "exit" to quit.');
    this.rl.prompt();
  }

  private setupReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '$ '
    });

    // Pre-warm on any keypress
    this.rl.on('keypress', () => {
      if (!this.commandRunning) {
        this.ensureWorker();
      }
    });

    this.rl.on('line', async (input) => {
      await this.handleCommand(input.trim());
    });

    this.rl.on('SIGINT', () => {
      this.handleSigInt();
    });

    this.rl.on('close', () => {
      this.cleanup();
      process.exit(0);
    });
  }

  private async ensureWorker(): Promise<ChildProcess> {
    if (this.worker && this.workerReady) {
      this.resetIdleTimer();
      return this.worker;
    }

    if (!this.worker) {
      this.worker = fork(
        path.join(__dirname, '../workers/command-worker.js'),
        [],
        {
          silent: false,
          env: process.env,
          cwd: process.cwd()
        }
      );

      // Wait for worker ready signal
      await new Promise<void>((resolve) => {
        this.worker!.once('message', (msg) => {
          if (msg.type === 'ready') {
            this.workerReady = true;
            resolve();
          }
        });
      });

      this.resetIdleTimer();
    }

    return this.worker;
  }

  private resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      if (this.worker && !this.commandRunning) {
        this.worker.kill();
        this.worker = undefined;
        this.workerReady = false;
      }
    }, this.IDLE_TIMEOUT);
  }

  private async handleCommand(input: string) {
    if (input === 'exit' || input === '.exit') {
      this.rl.close();
      return;
    }

    if (input === '') {
      this.rl.prompt();
      return;
    }

    this.commandRunning = true;
    this.rl.pause();

    try {
      const args = this.parseCommand(input);
      const worker = await this.ensureWorker();

      const result = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Command timeout'));
        }, 300000); // 5 minute timeout

        worker.once('message', (msg) => {
          clearTimeout(timeout);
          if (msg.type === 'result') {
            resolve(msg.data);
          } else if (msg.type === 'error') {
            reject(new Error(msg.error));
          }
        });

        worker.send({ type: 'execute', args });
      });

      if (result.exitCode !== 0) {
        console.error(`Command failed with exit code ${result.exitCode}`);
      }
    } catch (error) {
      console.error('Error:', error.message);
    } finally {
      this.commandRunning = false;
      this.rl.resume();
      this.rl.prompt();
    }
  }

  private parseCommand(input: string): string[] {
    // Basic parsing - will be enhanced in Phase 3
    return input.split(/\s+/);
  }

  private handleSigInt() {
    if (this.commandRunning && this.worker) {
      // Send interrupt to worker
      this.worker.send({ type: 'interrupt' });
      console.log('^C');
    } else {
      // Clear current line and re-prompt
      this.rl.write('\n');
      this.rl.prompt();
    }
  }

  private cleanup() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    if (this.worker) {
      this.worker.kill();
    }
    console.log('\nGoodbye!');
  }
}
```

```typescript
// src/workers/command-worker.ts
import { Config } from '@oclif/core';

let config: Config;

async function initialize() {
  // Load oclif config once
  config = await Config.load({ root: process.cwd() });
  process.send!({ type: 'ready' });
}

process.on('message', async (msg: any) => {
  if (msg.type === 'execute') {
    try {
      await config.runCommand(msg.args[0], msg.args.slice(1));
      process.send!({ type: 'result', data: { exitCode: 0 } });
    } catch (error) {
      process.send!({ 
        type: 'result', 
        data: { exitCode: 1, error: error.message } 
      });
    }
  } else if (msg.type === 'interrupt') {
    // Handle interrupt - exit the process
    process.exit(130); // Standard exit code for SIGINT
  }
});

// Handle process termination
process.on('SIGINT', () => {
  process.exit(130);
});

// Initialize worker
initialize().catch(console.error);
```

**Testing**:
- Verify pre-warming works (fork starts on first keypress)
- Test command execution through fork
- Verify idle timeout and cleanup
- Test Ctrl+C handling

#### Phase 2: Autocomplete Implementation (3-4 days)

**Goal**: Add tab completion for commands, subcommands, and flags.

**Tasks**:
1. Extract command metadata from oclif config
2. Implement readline completer function
3. Support nested command completion
4. Add flag completion

**Implementation**:
```typescript
// Add to Interactive class
private completer(line: string): [string[], string] {
  const commands = this.getAvailableCommands();
  const words = line.trim().split(/\s+/);
  
  if (words.length <= 1) {
    // Complete command names
    const partial = words[0] || '';
    const matches = commands.filter(cmd => cmd.startsWith(partial));
    return [matches, partial];
  } else {
    // Complete subcommands or flags
    const cmdPath = words.slice(0, -1).join(' ');
    const partial = words[words.length - 1];
    
    if (partial.startsWith('--')) {
      // Complete flags
      const flags = this.getFlagsForCommand(cmdPath);
      const matches = flags.filter(flag => flag.startsWith(partial));
      return [matches, partial];
    } else {
      // Complete subcommands
      const subcommands = this.getSubcommands(cmdPath);
      const matches = subcommands.filter(cmd => cmd.startsWith(partial));
      return [matches, partial];
    }
  }
}

private getAvailableCommands(): string[] {
  // Cache this on initialization
  return Array.from(this.config.commands.keys())
    .map(cmd => cmd.replace(/:/g, ' '))
    .sort();
}
```

#### Phase 3: Command History (2 days)

**Goal**: Implement session-based command history with arrow key navigation.

**Tasks**:
1. Enable readline history
2. Implement history persistence (optional for web)
3. Test arrow key navigation

**Implementation**:
```typescript
// History is largely automatic with readline
// Just ensure proper configuration in setupReadline():
this.rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '$ ',
  completer: this.completer.bind(this),
  historySize: 100  // Limit history
});
```

#### Phase 4: Enhanced Parsing & Error Handling (2 days)

**Goal**: Improve command parsing and error handling.

**Tasks**:
1. Better quote handling in command parsing
2. Enhanced error messages
3. Worker crash recovery
4. Timeout handling

#### Phase 5: Testing & Polish (3 days)

**Goal**: Comprehensive testing and refinement.

**Tasks**:
1. Cross-platform testing (Windows, macOS, Linux)
2. Performance benchmarking
3. Edge case handling
4. Documentation

### Performance Metrics

**Target Performance**:
- Fork pre-warming: < 100ms (invisible to user)
- Command execution: 0ms additional overhead
- Autocomplete response: < 50ms
- Memory footprint: < 50MB total

### Risk Mitigation

1. **Fork fails to start**: Fallback to direct execution with warning
2. **Worker crashes**: Auto-restart with backoff
3. **Memory leaks**: Periodic worker recycling after N commands
4. **Platform issues**: Test on all target platforms early

### Success Criteria

1. **Latency**: < 100ms from Enter to command start
2. **Reliability**: Clean Ctrl+C handling for all commands
3. **Features**: Full autocomplete and history support
4. **Compatibility**: All existing commands work unchanged
5. **Resource usage**: Minimal memory footprint when idle

### Deployment Strategy

1. **Week 1-2**: Core implementation (Phases 1-3)
2. **Week 3**: Enhancement and testing (Phases 4-5)
3. **Week 4**: Beta testing with web terminal
4. **Week 5**: Production rollout

This plan delivers a responsive interactive shell with minimal overhead while maintaining clean process isolation for reliable command termination.
